/** Tiny hosted chat: static page + POST /api/ask. Per-IP and global daily caps. */
import "dotenv/config";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ask, type Turn } from "./oracle.js";

const here = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(here, "..", "web", "index.html"));
const logo = readFileSync(resolve(here, "..", "web", "logo.png"));
const PER_IP = Number(process.env.RATE_PER_IP_PER_DAY ?? 30);
const GLOBAL = Number(process.env.RATE_GLOBAL_PER_DAY ?? 400);
const PORT = Number(process.env.PORT ?? 8787);

const day = () => new Date().toISOString().slice(0, 10);
let bucketDay = day();
let globalCount = 0;
const perIp = new Map<string, number>();
function allow(ip: string): string | null {
  if (bucketDay !== day()) { bucketDay = day(); globalCount = 0; perIp.clear(); }
  if (globalCount >= GLOBAL) return "Daily global limit reached — run the CLI locally with your own key.";
  const n = perIp.get(ip) ?? 0;
  if (n >= PER_IP) return `Daily limit of ${PER_IP} questions per IP reached.`;
  perIp.set(ip, n + 1); globalCount++;
  return null;
}

const json = (res: any, code: number, body: unknown) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "?";
  const path = new URL(req.url ?? "/", "http://x").pathname; // ignore ?query
  if ((req.method === "GET" || req.method === "HEAD") && (path === "/" || path === "/index.html")) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" }); return res.end(req.method === "HEAD" ? undefined : page);
  }
  if ((req.method === "GET" || req.method === "HEAD") && path === "/healthz") return json(res, 200, { ok: true });
  if ((req.method === "GET" || req.method === "HEAD") && path === "/logo.png") {
    res.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=86400" }); return res.end(req.method === "HEAD" ? undefined : logo);
  }
  if (req.method === "POST" && path === "/api/ask") {
    let raw = "";
    for await (const c of req) { raw += c; if (raw.length > 200_000) return json(res, 413, { error: "too large" }); }
    let body: { question?: string; history?: Turn[] };
    try { body = JSON.parse(raw); } catch { return json(res, 400, { error: "bad json" }); }
    const q = (body.question ?? "").trim().slice(0, 1000);
    if (!q) return json(res, 400, { error: "question required" });
    const blocked = allow(ip);
    if (blocked) return json(res, 429, { error: blocked });
    const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
    const wantsStream = (req.headers.accept ?? "").includes("text/event-stream");
    if (!wantsStream) {
      try {
        const r = await ask(q, history);
        return json(res, 200, { answer: r.text, trace: r.trace, history: r.history.slice(-12), usage: r.usage });
      } catch (e: any) { return json(res, 502, { error: e?.message ?? "agent error" }); }
    }
    // Server-sent events: tool markers + text deltas while the turn runs, then the final payload.
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const ping = setInterval(() => res.write(": ping\n\n"), 15000);
    try {
      const r = await ask(q, history, (e) => send(e.type, e));
      send("done", { answer: r.text, trace: r.trace, history: r.history.slice(-12), usage: r.usage });
    } catch (e: any) {
      send("error", { error: e?.message ?? "agent error" });
    } finally { clearInterval(ping); res.end(); }
    return;
  }
  json(res, 404, { error: "not found" });
}).listen(PORT, () => console.log(`memdb-oracle chat on http://localhost:${PORT}`));
