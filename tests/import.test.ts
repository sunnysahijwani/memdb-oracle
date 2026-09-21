import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lines = readFileSync(new URL("../data/documents.ndjson", import.meta.url), "utf8").trim().split("\n");
const docs = lines.map((l) => JSON.parse(l));
const runs = docs.filter((d) => d._type === "benchmarkRun");
const counts = JSON.parse(readFileSync(new URL("../data/counts.json", import.meta.url), "utf8"));

test("every document has a unique deterministic _id", () => {
  const ids = new Set(docs.map((d) => d._id));
  assert.equal(ids.size, docs.length);
  for (const d of docs) assert.match(d._id, /^[A-Za-z0-9._-]+$/);
});

test("only AWS capture rows are imported (scale-* / sat-scale-*)", () => {
  for (const r of runs) assert.match(r.note, /^(sat-)?scale-\d+c$/, r._id);
  assert.equal(runs.length, counts.runs);
});

test("no zero-ops rows, hit rate in range, positive cores", () => {
  for (const r of runs) {
    assert.ok(r.opsPerSec > 0, r._id);
    assert.ok(r.hitRate >= 0 && r.hitRate <= 1, r._id);
    assert.ok(r.coresUsed > 0, r._id);
  }
});

test("every run references an engine document that exists", () => {
  const engineIds = new Set(docs.filter((d) => d._type === "engine").map((d) => d._id));
  for (const r of runs) assert.ok(engineIds.has(r.engine._ref), r._id);
});

test("session field is present and matches the source CSV", () => {
  for (const r of runs) {
    if (r.sourceCsv.includes("session2")) assert.equal(r.session, 2, r._id);
    else assert.equal(r.session, 1, r._id);
  }
  // KeyDB/Garnet only ever ran in session 2
  for (const r of runs) if (["keydb", "garnet"].includes(r.engineName)) assert.equal(r.session, 2, r._id);
});

test("honesty lock: no private-experiment or gated-name strings in the dataset", (t) => {
  // Patterns live in a gitignored file so the guard does not publish what it guards.
  const file = new URL("./leak-patterns.txt", import.meta.url);
  let patterns: string[] = [];
  try { patterns = readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter(Boolean); }
  catch { t.skip("tests/leak-patterns.txt not present"); return; }
  const blob = lines.join("\n");
  for (const p of patterns) assert.doesNotMatch(blob, new RegExp(p, "i"), `pattern ${patterns.indexOf(p) + 1}`);
});
