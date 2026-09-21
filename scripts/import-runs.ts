/**
 * CSV -> NDJSON for `sanity dataset import`.
 *
 * Reads the two PUBLIC result files of the benchmark repo, keeps only the AWS
 * capture rows (note = scale-Nc / sat-scale-Nc), validates every row, and writes
 * deterministic-_id documents so re-importing is idempotent.
 *
 * Excluded on purpose (honesty locks): private client-experiment rows, Mac smoke/rehearsal
 * rows, diagnostics. See tests/leakcheck.sh.
 */
import { parse } from "csv-parse/sync";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const benchRoot = process.env.BENCH_REPO ??
  "/Applications/XAMPP/xamppfiles/htdocs/dragonfly-benchmark-root/dragonfly-benchmark";

const SOURCES = [
  { file: "results/runs-aws.csv", session: 1, label: "Session 1 (Sep 1 2026): Dragonfly vs Redis vs Valkey, 48-core c7i.metal-24xl" },
  { file: "results/runs-session2-aws.csv", session: 2, label: "Session 2 (Sep 12 2026): KeyDB + Garnet on the same harness and instance type" },
] as const;

const ENGINES = new Set(["dragonfly", "redis", "valkey", "keydb", "garnet"]);
const MODES = new Set(["single", "cluster", "cluster-sat"]);
const KEEP_NOTE = /^(sat-)?scale-\d+c$/;

type Row = Record<string, string>;
const num = (v: string, field: string, line: number): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`row ${line}: ${field}="${v}" is not numeric`);
  return n;
};

const docs: Record<string, unknown>[] = [];
const ids = new Set<string>();
const counts: Record<string, number> = {};
let skipped = 0;

for (const src of SOURCES) {
  const csvPath = resolve(benchRoot, src.file);
  const rows: Row[] = parse(readFileSync(csvPath, "utf8"), { columns: true, skip_empty_lines: true });
  rows.forEach((r, i) => {
    const line = i + 2;
    if (!KEEP_NOTE.test(r.note)) { skipped++; return; }
    if (!ENGINES.has(r.engine)) throw new Error(`row ${line}: unknown engine ${r.engine}`);
    if (!MODES.has(r.mode)) throw new Error(`row ${line}: unknown mode ${r.mode}`);
    const hitRate = num(r.hit_rate, "hit_rate", line);
    if (hitRate < 0 || hitRate > 1) throw new Error(`row ${line}: hit_rate out of range`);
    const opsPerSec = num(r.ops_per_sec, "ops_per_sec", line);
    if (opsPerSec <= 0) { skipped++; return; } // zero-ops rows = failed run, never a measurement

    const cores = num(r.cores_used, "cores_used", line);
    const pipeline = num(r.pipeline, "pipeline", line);
    const rep = num(r.rep, "rep", line);
    const dataBytes = num(r.data_bytes, "data_bytes", line);
    const _id = `run-s${src.session}-${r.run_id}-${r.engine}-${r.mode}-${cores}c-p${pipeline}-${r.ratio.replace(":", "-")}-d${dataBytes}-rep${rep}`;
    if (ids.has(_id)) throw new Error(`duplicate _id ${_id} (row ${line})`);
    ids.add(_id);

    // Workload family — the axis a human asks about ("read-heavy pipelined")
    const workload =
      r.ratio === "mget10" ? "multi-key MGET(10)" :
      r.ratio === "mset10" ? "multi-key MSET(10)" :
      `${r.ratio === "1:10" ? "read-heavy" : "mixed"} SET:GET ${r.ratio}, ${dataBytes}B values, ${pipeline === 1 ? "no pipeline" : `pipeline ${pipeline}`}`;

    docs.push({
      _id, _type: "benchmarkRun",
      session: src.session,
      runId: r.run_id, note: r.note, sourceCsv: src.file, sourceRow: line,
      engine: { _type: "reference", _ref: `engine-${r.engine}` },
      engineName: r.engine, mode: r.mode, workload,
      shards: num(r.shards, "shards", line),
      serverThreads: num(r.server_threads, "server_threads", line),
      shardIoThreads: num(r.shard_io_threads, "shard_io_threads", line),
      coresUsed: cores, serverCpus: r.server_cpus, clientCpus: r.client_cpus,
      clientThreads: num(r.client_threads, "client_threads", line),
      clientConns: num(r.client_conns, "client_conns", line),
      pipeline, ratio: r.ratio, dataBytes,
      keyMax: num(r.key_max, "key_max", line),
      testTimeSec: num(r.test_time, "test_time", line),
      populated: r.populate === "1", rep,
      opsPerSec, opsPerCore: num(r.ops_per_core, "ops_per_core", line),
      p50Ms: num(r.p50_ms, "p50_ms", line), p99Ms: num(r.p99_ms, "p99_ms", line), p999Ms: num(r.p999_ms, "p999_ms", line),
      hitRate, connErrors: num(r.conn_errors, "conn_errors", line), kbPerSec: num(r.kb_per_sec, "kb_per_sec", line),
    });
    const k = `s${src.session}/${r.engine}/${r.mode}`;
    counts[k] = (counts[k] ?? 0) + 1;
  });
}

// Static documents: engines + hand-written findings + sessions
const engines = JSON.parse(readFileSync(resolve(repoRoot, "data/engines.json"), "utf8"));
for (const e of engines) docs.push({ _type: "engine", ...e, _id: `engine-${e.slug}` });
const findingsPath = resolve(repoRoot, "data/findings.json");
if (existsSync(findingsPath)) {
  const findings = JSON.parse(readFileSync(findingsPath, "utf8"));
  for (const f of findings) docs.push({ _type: "finding", ...f, _id: `finding-${f.slug}`,
    engines: (f.engineSlugs ?? []).map((s: string, i: number) => ({ _type: "reference", _ref: `engine-${s}`, _key: `e${i}` })),
    engineSlugs: undefined });
}
for (const s of SOURCES) docs.push({ _id: `session-${s.session}`, _type: "benchmarkSession", number: s.session, label: s.label, sourceCsv: s.file });

const out = resolve(repoRoot, "data/documents.ndjson");
writeFileSync(out, docs.map((d) => JSON.stringify(d)).join("\n") + "\n");
const summary = { runs: ids.size, skippedRows: skipped, documents: docs.length, byEngineMode: counts };
writeFileSync(resolve(repoRoot, "data/counts.json"), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
console.log(`wrote ${out}`);
