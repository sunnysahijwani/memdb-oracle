/**
 * Live golden tests — run only when the agent is configured (ANTHROPIC_API_KEY +
 * SANITY_* env). Numbers are checked against tests/golden.json, which is computed
 * outside the agent straight from the NDJSON.
 */
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const live = !!(process.env.ANTHROPIC_API_KEY && process.env.SANITY_ORG_ID && process.env.SANITY_CONTEXT_TOKEN);
const golden = JSON.parse(readFileSync(new URL("./golden.json", import.meta.url), "utf8"));

/** Extract every number in the text, expanding K/M suffixes, so "15.5M ops/s" ≈ 15473658. */
function numbersIn(text: string): number[] {
  const out: number[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?(?![\w.])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let n = Number(m[1].replace(/,/g, ""));
    if (m[2]?.toLowerCase() === "k") n *= 1e3;
    if (m[2]?.toLowerCase() === "m") n *= 1e6;
    out.push(n);
  }
  return out;
}
const within = (nums: number[], target: number, tol = 0.015) => nums.some((n) => Math.abs(n - target) / target <= tol);

const skip = { skip: live ? false : "set ANTHROPIC_API_KEY + SANITY_ORG_ID + SANITY_CONTEXT_TOKEN to run live tests" };
const askFn = async (q: string) => (await import("../agent/oracle.js")).ask(q);

test("Q1 fastest at 48c read-heavy p16 → Dragonfly, median matches", skip, async () => {
  const r = await askFn("Which engine is fastest at 48 cores, read-heavy (1:10), 100-byte values, pipeline 16? Give the median ops/s.");
  assert.match(r.text, /dragonfly/i);
  assert.ok(within(numbersIn(r.text), golden.q1_fastest_48c_readheavy_p16.dragonfly, 0.02), r.text);
  assert.ok(r.trace.some((t) => t.tool === "groq_query"), "must use groq_query");
});

test("Q2 p99 at 16c: Dragonfly vs Redis cluster (realistic)", skip, async () => {
  const r = await askFn("At 16 cores, 1:10, 100B, pipeline 16, which has the lower p99 latency: Dragonfly or the realistic Redis cluster? Quote both p99 values in ms.");
  const g = golden.q2_p99_16c_df_vs_redis_cluster;
  const nums = numbersIn(r.text);
  assert.ok(within(nums, g.dragonfly_p99, 0.02) && within(nums, g.redis_cluster_p99, 0.02), r.text);
});

test("Q5 Garnet vs Dragonfly carries the client-limited caveat and the session boundary", skip, async () => {
  const r = await askFn("What is Garnet's peak throughput and how does it compare with Dragonfly's?");
  for (const p of golden.q5_garnet_vs_dragonfly.required_phrases) assert.match(r.text.toLowerCase(), new RegExp(p.replace("-", "[- ]")), `missing "${p}"`);
  assert.match(r.text, /session/i, "must mention the session boundary");
  assert.ok(within(numbersIn(r.text), golden.q5_garnet_vs_dragonfly.garnet_48c_s2, 0.02), r.text);
});

test("Q9 vendor claim vs measurement are shown side by side", skip, async () => {
  const r = await askFn("Is Dragonfly 25x faster than Redis?");
  assert.match(r.text, /25/); assert.match(r.text, /3\.4/);
  assert.match(r.text, /vendor|dragonflydb\.io|claim/i);
  assert.ok(r.trace.some((t) => t.tool === "knowledge_base_read"), "must read the Knowledge Base");
});

test("Q12c term outside the Knowledge Base is labelled general knowledge", skip, async () => {
  const r = await askFn("What is a NUMA node?");
  assert.match(r.text, /general knowledge, not from the Knowledge Base|dictionary|Knowledge Base/i);
});

test("Q13 out-of-scope question is declined without numbers", skip, async () => {
  const r = await askFn("Which is better for my Postgres workload, MySQL or Postgres?");
  assert.doesNotMatch(r.text, /\d(\.\d+)?\s*M ops/i);
  assert.match(r.text, /can't|cannot|out of scope|only|not covered/i);
});

test("Q14 non-existent combination is not fabricated", skip, async () => {
  const r = await askFn("Give me the Redis single-process result at 8 cores with pipeline 64.");
  assert.match(r.text, /no (matching|such) run|not measured|does not exist|no run/i);
});
