import { defineField, defineType } from "sanity";

/**
 * One memtier run = one CSV row. Every knob that moved a number is a field, so
 * GROQ can answer "at 16 cores, 1:10, pipeline 16, which engine has the lower p99"
 * without any prose search. Medians across `rep` are computed by the reader.
 */
export const benchmarkRun = defineType({
  name: "benchmarkRun", title: "Benchmark run", type: "document",
  fieldsets: [
    { name: "identity", title: "Identity & provenance" },
    { name: "server", title: "Server configuration" },
    { name: "client", title: "Client / workload" },
    { name: "results", title: "Results (medians are computed across reps)" },
  ],
  fields: [
    defineField({ name: "session", type: "number", fieldset: "identity", validation: (r) => r.required().integer(), description: "1 = Dragonfly/Redis/Valkey (Sep 1 2026), 2 = KeyDB/Garnet (Sep 12 2026). Never compare across sessions without saying so." }),
    defineField({ name: "runId", type: "string", fieldset: "identity" }),
    defineField({ name: "note", type: "string", fieldset: "identity", description: "Sweep label, e.g. scale-48c or sat-scale-48c" }),
    defineField({ name: "sourceCsv", type: "string", fieldset: "identity" }),
    defineField({ name: "sourceRow", type: "number", fieldset: "identity", description: "Line number in the public CSV — every number is traceable" }),
    defineField({ name: "engine", type: "reference", to: [{ type: "engine" }], fieldset: "identity", validation: (r) => r.required() }),
    defineField({ name: "engineName", type: "string", fieldset: "identity", description: "Denormalised for cheap GROQ filters", validation: (r) => r.required() }),
    defineField({ name: "mode", type: "string", fieldset: "server", options: { list: [
      { title: "single — one process", value: "single" },
      { title: "cluster — realistic: one normal cluster-mode client", value: "cluster" },
      { title: "cluster-sat — ceiling: one load generator per shard", value: "cluster-sat" },
    ] }, validation: (r) => r.required() }),
    defineField({ name: "workload", type: "string", fieldset: "client", description: "Human label derived from ratio/dataBytes/pipeline" }),
    defineField({ name: "shards", type: "number", fieldset: "server" }),
    defineField({ name: "serverThreads", type: "number", fieldset: "server" }),
    defineField({ name: "shardIoThreads", type: "number", fieldset: "server" }),
    defineField({ name: "coresUsed", type: "number", fieldset: "server", validation: (r) => r.required().integer().positive() }),
    defineField({ name: "serverCpus", type: "string", fieldset: "server", description: "cpuset the server was pinned to" }),
    defineField({ name: "clientCpus", type: "string", fieldset: "client" }),
    defineField({ name: "clientThreads", type: "number", fieldset: "client" }),
    defineField({ name: "clientConns", type: "number", fieldset: "client", description: "connections per client thread" }),
    defineField({ name: "pipeline", type: "number", fieldset: "client", validation: (r) => r.required().integer().positive() }),
    defineField({ name: "ratio", type: "string", fieldset: "client", description: "SET:GET ratio, or mget10 / mset10 for multi-key runs", validation: (r) => r.required() }),
    defineField({ name: "dataBytes", type: "number", fieldset: "client", validation: (r) => r.required() }),
    defineField({ name: "keyMax", type: "number", fieldset: "client" }),
    defineField({ name: "testTimeSec", type: "number", fieldset: "client" }),
    defineField({ name: "populated", type: "boolean", fieldset: "client", description: "keyspace preloaded so reads hit (hitRate ≈ 1)" }),
    defineField({ name: "rep", type: "number", fieldset: "identity", validation: (r) => r.required().integer().positive() }),
    defineField({ name: "opsPerSec", type: "number", fieldset: "results", validation: (r) => r.required().positive() }),
    defineField({ name: "opsPerCore", type: "number", fieldset: "results" }),
    defineField({ name: "p50Ms", type: "number", fieldset: "results" }),
    defineField({ name: "p99Ms", type: "number", fieldset: "results" }),
    defineField({ name: "p999Ms", type: "number", fieldset: "results" }),
    defineField({ name: "hitRate", type: "number", fieldset: "results", validation: (r) => r.min(0).max(1) }),
    defineField({ name: "connErrors", type: "number", fieldset: "results" }),
    defineField({ name: "kbPerSec", type: "number", fieldset: "results" }),
  ],
  preview: {
    select: { engine: "engineName", mode: "mode", cores: "coresUsed", ops: "opsPerSec", w: "workload", rep: "rep", s: "session" },
    prepare: ({ engine, mode, cores, ops, w, rep, s }) => ({
      title: `${engine} ${mode} @ ${cores}c — ${(ops / 1e6).toFixed(2)}M ops/s`,
      subtitle: `s${s} · ${w} · rep ${rep}`,
    }),
  },
});
