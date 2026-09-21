import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { ask, type Turn } from "./oracle.js";

const printTrace = (trace: Awaited<ReturnType<typeof ask>>["trace"]) => {
  if (!trace.length) return;
  console.log("\n— tool calls —");
  for (const t of trace) {
    const input = JSON.stringify(t.input);
    console.log(`  [${t.server}] ${t.tool}${t.isError ? " (ERROR)" : ""}: ${input.length > 300 ? input.slice(0, 300) + "…" : input}`);
  }
};

const oneShot = process.argv.slice(2).join(" ").trim();
if (oneShot) {
  const r = await ask(oneShot, [], (e) => stdout.write(e.type === "text" ? e.text : `\n  ⟳ ${e.server}/${e.tool}\n`));
  stdout.write("\n");
  printTrace(r.trace);
  console.log(`\n(tokens in/out: ${r.usage.input_tokens}/${r.usage.output_tokens})`);
} else {
  console.log("memdb-oracle — ask about Redis / Valkey / Dragonfly / KeyDB / Garnet. Ctrl-C to quit.");
  const rl = createInterface({ input: stdin, output: stdout });
  let history: Turn[] = [];
  for (;;) {
    const q = (await rl.question("\n> ")).trim();
    if (!q) continue;
    const r = await ask(q, history, (e) => stdout.write(e.type === "text" ? e.text : `\n  ⟳ ${e.server}/${e.tool}\n`));
    stdout.write("\n");
    printTrace(r.trace);
    history = r.history.slice(-12);
  }
}
