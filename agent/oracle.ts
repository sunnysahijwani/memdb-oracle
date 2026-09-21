/**
 * memdb-oracle core: one Claude API call per turn. Sanity Context is reached
 * through the API's MCP connector, so the model calls Sanity's MCP tools
 * server-side — this file holds no MCP client code at all.
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const SYSTEM_PROMPT = readFileSync(resolve(here, "system-prompt.md"), "utf8");

export type Trace = { server: string; tool: string; input: unknown; isError?: boolean; resultPreview?: string };
export type LiveEvent = { type: "tool"; server: string; tool: string } | { type: "text"; text: string };
export type Turn = Anthropic.Beta.Messages.BetaMessageParam;

export function config() {
  const need = (k: string) => {
    const v = process.env[k];
    if (!v) throw new Error(`Missing env ${k} (see .env.example)`);
    return v;
  };
  const org = need("SANITY_ORG_ID");
  const name = process.env.SANITY_MCP_NAME ?? "memdb";
  const kbName = process.env.SANITY_KB_MCP_NAME; // optional: a second endpoint that serves ONLY the Knowledge Base
  const base = `https://api.sanity.io/v1/context/organizations/${org}/mcp`;
  return {
    model: process.env.MODEL ?? "claude-opus-5",
    effort: (process.env.EFFORT ?? "high") as "low" | "medium" | "high" | "xhigh" | "max",
    token: need("SANITY_CONTEXT_TOKEN"),
    groqUrl: `${base}/${name}?mode=groq`,
    kbUrl: kbName ? `${base}/${kbName}` : `${base}/${name}?mode=knowledge_base`,
    logFile: process.env.SESSION_LOG ?? resolve(here, "..", "docs", "session-log.jsonl"),
    kbEnabled: (process.env.KB_ENABLED ?? "true") !== "false", // KB_ENABLED=false → GROQ-only (diagnostics)
  };
}

const client = new Anthropic();

export async function ask(question: string, history: Turn[] = [], onEvent?: (e: LiveEvent) => void) {
  const cfg = config();
  const messages: Turn[] = [...history, { role: "user", content: question }];

  const stream = client.beta.messages.stream({
    model: cfg.model,
    max_tokens: 16000,
    betas: ["mcp-client-2025-11-20"],
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    thinking: { type: "adaptive" },
    output_config: { effort: cfg.effort },
    mcp_servers: [
      { type: "url", url: cfg.groqUrl, name: "sanity-groq", authorization_token: cfg.token },
      ...(cfg.kbEnabled ? [{ type: "url" as const, url: cfg.kbUrl, name: "sanity-kb", authorization_token: cfg.token }] : []),
    ],
    tools: [
      { type: "mcp_toolset", mcp_server_name: "sanity-groq" },
      ...(cfg.kbEnabled ? [{ type: "mcp_toolset" as const, mcp_server_name: "sanity-kb" }] : []),
    ],
    messages,
  });
  if (onEvent) {
    // Text deltas as they arrive, and a marker each time the model starts a Sanity tool call.
    // Text written BEFORE a tool call is narration; the page discards it when a tool event follows.
    stream.on("text", (t) => onEvent({ type: "text", text: t }));
    stream.on("streamEvent", (ev: any) => {
      if (ev.type === "content_block_start" && ev.content_block?.type === "mcp_tool_use") {
        onEvent({ type: "tool", server: ev.content_block.server_name, tool: ev.content_block.name });
      }
    });
  }
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error(`Model declined the request (${message.stop_details?.category ?? "no category"})`);
  }

  const trace: Trace[] = [];
  let text = "";
  const results = new Map<string, { isError?: boolean; preview: string }>();
  for (const b of message.content) {
    if (b.type === "mcp_tool_result") {
      const preview = Array.isArray(b.content)
        ? b.content.map((c: any) => (c.type === "text" ? c.text : "")).join("").slice(0, 400)
        : String(b.content).slice(0, 400);
      results.set(b.tool_use_id, { isError: b.is_error, preview });
    }
  }
  let preamble = "";
  for (const b of message.content) {
    if (b.type === "text") text += b.text;
    if (b.type === "mcp_tool_use") {
      preamble += text; text = ""; // anything written before a tool call is narration, not the answer
      const r = results.get(b.id);
      trace.push({ server: b.server_name, tool: b.name, input: b.input, isError: r?.isError, resultPreview: r?.preview });
    }
  }

  if (!text.trim()) text = preamble; // no tool calls at all → the whole reply is the answer
  const nextHistory: Turn[] = [...messages, { role: "assistant", content: message.content as any }];
  try {
    mkdirSync(dirname(cfg.logFile), { recursive: true });
    appendFileSync(cfg.logFile, JSON.stringify({ at: new Date().toISOString(), model: cfg.model, question, trace, text, usage: message.usage }) + "\n");
  } catch { /* logging is best-effort */ }

  return { text, trace, history: nextHistory, usage: message.usage, stopReason: message.stop_reason };
}
