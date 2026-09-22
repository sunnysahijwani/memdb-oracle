# memdb-oracle — curated transcripts

Verbatim answers from the agent's session log (`docs/session-log.jsonl`, not committed). Each shows the Sanity Context tool calls made and the answer as returned, including the Sources block. Trimmed only where marked `[...]`.


---

## 1. “Is Dragonfly 25x faster than Redis?”

**Tool calls:** `sanity-groq/initial_context`, `sanity-kb/initial_context`, `sanity-kb/knowledge_base_read`, `sanity-groq/groq_query`, `sanity-groq/groq_query`, `sanity-groq/groq_query`, `sanity-groq/groq_query`, `sanity-groq/groq_query`, `sanity-groq/groq_query`, `sanity-groq/groq_query`

> ## Short answer: not in this dataset.
>
> **Measured (ground truth here)** — session 1, 48 physical cores, read-heavy SET:GET 1:10, 100-byte values, pipeline 16, medians across the 2 reps:
>
> | Configuration | Throughput (median) | vs Dragonfly |
> |---|---|---|
> | Dragonfly, 1 process | **15.5 M ops/s** | — |
> | Redis Cluster, `cluster` = realistic (one normal cluster-mode client) | **4.6 M ops/s** | Dragonfly 3.4× faster |
> | Redis Cluster, `cluster-sat` = fully driven ceiling (one memtier per shard) | **40.6 M ops/s** (single rep in this cell) | Dragonfly 0.38× — i.e. Redis 2.6× faster |
>
> So the measured ratio is **3.4× in Dragonfly's favour against a realistically driven Redis cluster**, and **Dragonfly is slower than a perfectly driven Redis cluster** on the same hardware. Nothing measured here comes near 25×.
>
> **Vendor statement (context, not measurement)** — Dragonfly's own marketing claims "25x higher throughput than Redis: 3.97 million QPS versus 148,000 QPS on AWS c6gn.16xlarge" (KB entry *Dragonfly Self-Reported Performance Claims*, sources dragonflydb.io/redis-alternative, /features). That comparison puts multi-threaded Dragonfly against a **single-threaded, single-process Redis** on their own instance type. This dataset has **no single-process Redis run at all** (only `cluster` and `cluster-sat` modes), so the vendor's specific comparison cannot be reproduced or refuted here — it is simply a different setup. The measured figures above are the ground truth for this dataset; the 25× figure describes Dragonfly's own setup.
>
> Two caveats that decide the ratio, both from the KB:
> - **Pipelining** (batching many requests per round trip) dominates: at 48 cores Dragonfly goes 2.8 M → 15.5 M ops/s from pipeline 1 to 16; any headline without a stated pipeline depth is uninterpretable (*Pipelining & Client-Side Routing Effects*).
> - **Client routing** produces a ~9× spread on the *same* Redis cluster hardware: a single cluster-mode client fragments pipelines across shards and plateaus near 5 M, while per-shard clients reach 40.6 M (*Pipelining & Client-Side Routing Effects*; *Dragonfly, Redis & Valkey Throughput*). Most production deployments sit near the naive end.
>
> Plain words: on the same 48-core machine, Dragonfly served about three and a half times more requests per second than a Redis cluster driven the way a normal application drives it — but about a third of what the same Redis cluster managed when every shard was fed by its own dedicated load generator. "25×" is the vendor's own number against a one-threaded Redis, not something seen here.
>
> ### Sources
>
> GROQ run:
> ```groq
> *[_type == "finding" && (statement match "25x" || vendorClaim match "25x" || title match text::query("dragonfly redis"))]{_id, title, slug, statement, caveat, session, vendorClaim, vendorClaimUrl, "engines": engines[]->name, metrics}
>
> *[_type == "benchmarkRun" && session == 1 && coresUsed == 48 && pipeline == 16 && dataBytes == 100 && ratio == "1:10" && engineName in ["dragonfly","redis"]]{_id, engineName, mode, rep, opsPerSec, p99Ms} | order(engineName, mode, rep)
>
> *[_type == "benchmarkRun" && engineName == "redis" && mode == "single"]{_id, session, coresUsed, shards, pipeline, ratio, dataBytes, rep, opsPerSec, note} | order(session, coresUsed, pipeline)[0...20]
> ```
> Run `_id`s used:
> - `run-s1-20260901-083406-dragonfly-single-48c-p16-1-10-d100-rep1`, `…-rep2`
> - `run-s1-20260901-083406-redis-cluster-48c-p16-1-10-d100-rep1`, `…-rep2`
> - `run-s1-20260901-083406-redis-cluster-sat-48c-p16-1-10-d100-rep1`
> - Findings: `finding-headline-48c`
> - (Redis `single`-mode query returned 0 documents.)
>
> Knowledge Base entries read: `vendor_claims/dragonfly_self_reported`, `results/throughput/dragonfly_redis_valkey`, `pipelining_and_client_routing`.


---

## 2. “Is Dragonfly 30% more memory efficient than Redis? Short answer with sources.”

**Tool calls:** `sanity-groq/initial_context`, `sanity-kb/initial_context`, `sanity-kb/knowledge_base_read`, `sanity-groq/groq_query`, `sanity-groq/schema_explorer`, `sanity-groq/groq_query`

> **No — not on this workload. Measured: ~12% leaner, not 30%.**
>
> | Engine | bytes/key (measured, session 1) | vs Dragonfly |
> |---|---:|---:|
> | Dragonfly v1.40.1 | 146.1 | — |
> | Redis 8.2 | 165.3 | +13% |
> | Valkey 8.1 | 168.7 | +15% |
>
> - **Measured (ground truth for this dataset):** 1,000,000 keys × 100-byte values, baseline-subtracted RSS ÷ key count. Dragonfly needs ~12% less memory per key than Redis (146.1 vs 165.3). Finding `finding-memory-bytes-per-key`, session 1. These values were identical on a laptop and on the 48-core c7i.metal box, so the number is hardware-independent ("Memory Efficiency Benchmark Results").
> - **Vendor statement (context, their own setup):** DragonflyDB claims "30–60% better memory utilization than Redis", e.g. 275 GB vs Redis's 500 GB for an equivalent workload ("Dragonfly Self-Reported Performance Claims"). Not reproduced here.
> - **Caveats:** the percentage depends on value size — at 100 B per-key overhead is a large fraction of each key, and it shrinks toward noise at large values ("Memory Efficiency Benchmark Results"). Garnet and KeyDB were not part of the memory measurement, so no bytes/key exists for them.
>
> Plain words: for a million small keys, Dragonfly stored each one in about 146 bytes versus Redis's 165 — real savings (~13% of a 256 GB dataset ≈ 33 GB), but roughly a third of the advertised 30%.
>
> **Sources**
>
> ```groq
> *[_type == "finding" && (title match "memor*" || statement match "bytes*")]{_id, slug, title, statement, caveat, session, metrics, "engines": engines[]->name, vendorClaim, vendorClaimUrl, sourceUrl}
> ```
>
> ```groq
> *[_type == "benchmarkRun" && defined(bytesPerKey)]{_id, runId, session, engineName, bytesPerKey}
> ```
> (returned 0 rows — bytes/key is not a per-run field; it lives in the finding document)
>
> Documents used: `finding-memory-bytes-per-key`, `finding-valkey-tracks-redis`.
> Knowledge Base entries read: `results/memory`, `vendor_claims/dragonfly_self_reported`.


---

## 3. “What is Garnet's peak throughput and how does it compare with Dragonfly's?”

**Tool calls:** `sanity-groq/initial_context`, `sanity-kb/initial_context`, `sanity-groq/groq_query`, `sanity-kb/knowledge_base_read`, `sanity-groq/groq_query`, `sanity-groq/groq_query`, `sanity-groq/groq_query`, `sanity-kb/knowledge_base_read`

> I'll start by initializing both sources.## Answer
>
> **Garnet's peak measured throughput: ≥ 21.4 M ops/s** (median of 2 reps), single node, 48 cores, read-heavy SET:GET 1:10, 100 B values, pipeline 16 — session 2.
> Individual reps: 21,672,789 and 21,039,644 ops/s → median **21,356,217 ops/s**.
>
> This is a **floor, not a ceiling**: at 48 cores the server was not saturated — the load generator ran out of capacity first (server CPU ~4000% of a 4800% budget). "Client-limited" means the number you measured belongs to your load generator, not the database; such a run normally must be discarded or labelled as a lower bound (Knowledge Base: *Common Benchmark Pitfalls*, Pitfall 2 — "Client-side saturation masking server capacity"; *KeyDB & Garnet Throughput*).
>
> **Dragonfly's peak measured throughput: 15.5 M ops/s**, single process, 48 cores, 100 B, pipeline 16 — session 1.
> Read-heavy 1:10 reps: 15,503,060 / 15,444,257 → median **15,473,658**. Mixed 1:1 reps: 15,512,667 / 15,475,981 → median **15,494,324**.
>
> ### Side by side (48 cores, 100 B, pipeline 16, single node, medians across reps)
>
> | Engine | Workload | Throughput | p50 | p99 | Session |
> |---|---|---:|---:|---:|---:|
> | Garnet 2.1.6 | read-heavy 1:10 | **≥ 21.4 M ops/s** (client-limited floor) | 0.68 ms | ~1.6 ms | 2 |
> | Garnet 2.1.6 | mixed 1:1 | **≥ 21.1 M ops/s** (client-limited floor) | 0.69 ms | ~1.7 ms | 2 |
> | Dragonfly v1.40.1 | read-heavy 1:10 | 15.5 M ops/s | 0.88 ms | ~2.4 ms | 1 |
> | Dragonfly v1.40.1 | mixed 1:1 | 15.5 M ops/s | 0.90 ms | ~2.1 ms | 1 |
>
> **Important caveat:** these are **different sessions** — same instance type (48-core AWS `c7i.metal-24xl`), but different instances, different dates, and a different load-generator machine (session 2 used an AMD `c7a.24xlarge` client because the Intel client had no AZ capacity). The comparison is indicative, not a controlled head-to-head (KB: *KeyDB & Garnet Throughput*). With that qualifier, Garnet's floor is ~1.4× Dragonfly's measured peak, and Garnet already exceeded Dragonfly's 48-core figure at 16 cores (15.8 M vs 15.5 M — again cross-session).
>
> ### Vendor statements (context, not ground truth)
> - **Microsoft (Garnet):** claims higher throughput and lower latency than Redis 7.2, KeyDB 6.3.4 and Dragonfly 6.2.11 on Azure F72s v2 VMs with their own `Resp.benchmark` tool, 8-byte keys/values, batches of 4,096 — no single "peak ops/s" headline figure is given in the KB entry (KB: *Garnet Vendor-Published Benchmarks*).
> - **Dragonfly:** claims "millions of QPS per instance", 25× Redis, and 3.97 M QPS on AWS `c6gn.16xlarge` GET (KB: *Dragonfly Self-Reported Performance Claims*).
>
> The measured figures above are the ground truth **for this dataset**; the vendor numbers describe each vendor's own hardware and tooling and are not comparable to them.
>
> **Terms used:** *pipeline 16* = the client sends 16 requests before waiting for replies, amortizing round trips (KB: *tooling_and_setup*, "Pipelining (-P)"). *p50 / p99* = the median and the 99th-percentile client-side latency. *Hit rate 1.0* = every read found real data, so no cheap "key not found" path is being measured (KB: *Pitfalls*, Pitfall 3).
>
> **Plain words:** on the same class of 48-core machine, Garnet handled at least ~21 million operations a second — and could likely do more, since the test client, not Garnet, hit its limit — while Dragonfly handled about 15.5 million; the two numbers come from separate test rounds, so treat the gap as approximate.
>
> ---
>
> ### Sources
>
> GROQ run (verbatim):
> ```groq
> {"engines": *[_type=="engine"]{_id, name, slug, versionTested}, "names": array::unique(*[_type=="benchmarkRun"].engineName), "modes": array::unique(*[_type=="benchmarkRun"].mode), "workloads": array::unique(*[_type=="benchmarkRun"].workload)}
> ```
> ```groq
> {"garnet": *[_type=="benchmarkRun" && engineName=="garnet"] | order(opsPerSec desc){_id, runId, session, mode, coresUsed, pipeline, dataBytes, ratio, rep, opsPerSec, p50Ms, p99Ms, p999Ms, hitRate, workload}, "dfTop": *[_type=="benchmarkRun" && engineName=="dragonfly"] | order(opsPerSec desc)[0...12]{_id, runId, session, mode, coresUsed, pipeline, dataBytes, ratio, rep, opsPerSec, p50Ms, p99Ms, hitRate, workload}}
> ```
>
> Run `_id`s used (8):
> - `run-s2-20260909-205911-garnet-single-48c-p16-1-10-d100-rep1`, `…-rep2`
> - `run-s2-20260909-205911-garnet-single-48c-p16-1-1-d100-rep1`, `…-rep2`
> - `run-s1-20260901-083406-dragonfly-single-48c-p16-1-10-d100-rep1`, `…-rep2`
> - `run-s1-20260901-083406-dragonfly-single-48c-p16-1-1-d100-rep1`, `…-rep2`
>
> Knowledge Base entries read: `results/throughput/keydb_garnet`, `results/throughput/dragonfly_redis_valkey`, `benchmark_methodology/pitfalls`, `vendor_claims/garnet_vendor_benchmarks`, `vendor_claims/dragonfly_self_reported`.


---

## 4. “What does client-limited mean in the Garnet result?”

**Tool calls:** `sanity-groq/initial_context`, `sanity-kb/initial_context`, `sanity-kb/knowledge_base_read`, `sanity-groq/groq_query`, `sanity-groq/groq_query`

> I'll start by initializing both sources.## Short answer
>
> "Client-limited" means the number you see is the **load generator's ceiling, not Garnet's**. In that run the server still had CPU headroom while the client machine ran out of capacity first — so the measured throughput is a **floor**: Garnet does at least that much, and its true maximum was not measurable with one client box.
>
> ## The definition, from the methodology
>
> From **`benchmark_methodology/pitfalls`, "Pitfall 2: Client-side saturation masking server capacity"**: a benchmark has two machines doing work, and throughput is capped by whichever runs out of CPU first. A result is only valid as a server measurement when the **server is saturated and the client has headroom**. If the client is maxed while the server has headroom, the run measures the load generator, not the engine.
>
> **`benchmark_methodology/measurement_rules`** operationalises this:
> - *Rule 2 — Record client CPU for every run*: "was the client saturated?" must be answerable from the data.
> - *Rule 3 — Attribute every plateau to server or client*: a plateau is publishable only when the server is saturated and the client has headroom; when attribution is unclear, publish with explicit caveats.
>
> ## Why it applies to Garnet specifically
>
> From **`results/throughput/keydb_garnet`** ("Garnet 2.1.6: client-limited floor, not a ceiling"): at 48 cores the Garnet server was **not** saturated — server CPU peaked at about 4000% out of a 4800% pinned budget — while the client machine ran out of capacity. Hit rate was 1.0 throughout, so the reads were hitting real data. Hence the 48-core figure is reported as "≥", and Garnet's true maximum is higher but unmeasured. (Same entry also notes Garnet is excluded from bytes/key entirely, per *Rule 12*.)
>
> ## The measured numbers this attaches to
>
> Session 2, Garnet 2.1.6, single-node, read-heavy 1:10, 100-byte values, pipeline 16, medians across reps:
>
> | Cores | Throughput (median of reps) | p50 | p99 |
> |---:|---:|---:|---:|
> | 48 | **≥ 21.4 M ops/s** (client-limited floor) | 0.68 ms | ~1.0–2.3 ms across reps |
>
> (21.67 M and 21.04 M ops/s across the two reps; median 21.4 M.) Note this is a **session-2** run — it must not be compared with session-1 Dragonfly/Redis/Valkey numbers without saying so; session 2 also used a different (AMD) client machine, per `results/throughput/keydb_garnet`.
>
> **Plain words:** Garnet handled at least 21.4 million operations per second — the test rig, not the database, was the thing that gave out first, so the real number is somewhere above that.
>
> ## Sources
>
> GROQ run (verbatim):
>
> ```groq
> *[_type == "benchmarkRun" && engineName match "Garnet*"]{ _id, runId, session, mode, coresUsed, ratio, dataBytes, pipeline, rep, opsPerSec, clientCpuPct } | order(coresUsed asc)[0...60]
> ```
>
> ```groq
> *[_type == "benchmarkRun" && engineName match "Garnet*" && coresUsed == 48 && pipeline == 16 && ratio == "1:10" && dataBytes == 100]{ _id, session, mode, rep, opsPerSec, p50Ms, p99Ms, hitRate, serverCpuPct, clientCpuPct, note }
> ```
>
> Run `_id`s used:
> - `run-s2-20260909-205911-garnet-single-48c-p16-1-10-d100-rep1`
> - `run-s2-20260909-205911-garnet-single-48c-p16-1-10-d100-rep2`
>
> (Note: `clientCpuPct` / `serverCpuPct` are null on these documents; the ~4000%/4800% server-CPU observation comes from the Knowledge Base entry, not the run records.)
>
> Knowledge Base entries read: `benchmark_methodology/pitfalls`, `benchmark_methodology/measurement_rules`, `results/throughput/keydb_garnet`.


---

## 5. “What is a NUMA node?”

**Tool calls:** `sanity-kb/initial_context`, `sanity-groq/initial_context`, `sanity-kb/knowledge_base_read`

> I'll start by loading both sources.Let me look for NUMA in the methodology entries.## NUMA node
>
> **The term is not defined as such in the Knowledge Base.** The benchmark dictionary/playbook material uses NUMA but never spells out the definition, so here is the definition marked accordingly, followed by what the sources *do* say.
>
> **Definition (general knowledge, not from the Knowledge Base):** NUMA stands for Non-Uniform Memory Access. A NUMA node is one grouping of CPU cores together with the memory attached directly to them. On a multi-socket (or multi-die) server there are several such nodes; a core can reach its own node's memory quickly and another node's memory more slowly, over the interconnect. "Non-uniform" is exactly that: access cost depends on which node the memory lives on relative to the core touching it.
>
> **What the sources say about NUMA in this benchmark:**
>
> - The test server is an AWS `c7i.metal-24xl` — Intel Xeon 8488C (Sapphire Rapids), **48 physical cores, single NUMA node, 192 GB RAM** — with the load generator on a separate `c7i.24xlarge`, same AZ and placement group. A single NUMA node means cross-node memory effects are not a variable in these runs. (KB: *Benchmark Tooling & Engine Setup* → "Hardware & benchmark harness")
> - On NUMA placement generally: "On multi-socket servers, placing client and server on two cores of the same CPU (sharing the L3 cache) gives the most deterministic results; use `taskset` or `numactl`." (KB: *Benchmark Tooling & Engine Setup* → "Factors impacting Redis/Valkey performance")
> - Related declaration rules: every published number must state CPU generation and architecture, **physical cores vs hyperthreads vs vCPUs** ("a '96 vCPU' box is typically 48 physical cores; hyperthreads are not cores"), and CPU pinning (cpuset) — "without it, 'at N cores' is a hope, not a fact." (KB: *Measurement Rules & Statistical Honesty* → "Measurement parameter honesty")
>
> **Plain words:** a NUMA node is "a bunch of CPU cores plus the memory that sits closest to them"; this benchmark's server has only one, so no core in it pays an extra penalty to reach memory.
>
> ---
>
> ### Sources
>
> **GROQ queries run:** none — this is a definition question; no measured figures are quoted, so no `benchmarkRun` documents were used.
>
> **Run `_id`s used:** none.
>
> **Knowledge Base entries read** (`kb5mbMKOT1UT`):
> - `benchmark_methodology/tooling_and_setup` — "Benchmark Tooling & Engine Setup"
> - `benchmark_methodology/measurement_rules` — "Measurement Rules & Statistical Honesty"


---

## 6. “Give me the Redis single-process result at 8 cores with pipeline 64.”

**Tool calls:** `sanity-groq/initial_context`, `sanity-kb/initial_context`, `sanity-groq/groq_query`, `sanity-groq/groq_query`, `sanity-groq/groq_query`, `sanity-groq/groq_query`, `sanity-groq/groq_query`, `sanity-kb/knowledge_base_read`

> I'll start by loading both sources.## No matching run exists
>
> Two parts of your request are not in the dataset:
>
> 1. **`pipeline 64` was never measured.** The only pipeline depths in the whole dataset are **1** and **16**.
> 2. **Redis has no `single`-mode runs.** Redis appears only as `cluster` and `cluster-sat`. Mode `single` exists only for dragonfly, garnet and keydb.
>
> Why: Redis executes commands on one thread, so a single process cannot use more than one core; the series therefore tests Redis as an N-shard cluster (N = cores) and reports it two ways — `cluster` = one normal cluster-mode client (realistic), `cluster-sat` = one client per shard (fully driven ceiling). (KB: *Common Benchmark Pitfalls* → "Pitfall 1: Single-process vs. single-process is not a fair fight"; *Benchmark Tooling & Engine Setup* → "Engine threading models & cluster requirement".) The same KB entry notes, as prose rather than a dataset run, that a single standalone Redis shard pinned to one core delivered ~474K ops/s (*Pipelining & Client-Side Routing Effects*).
>
> ## Nearest measured combinations — Redis, 8 cores, pipeline 16, 100 B, session 1
>
> Medians across `rep` (2 reps for `cluster`, 1 rep for `cluster-sat` — a single rep is not a median):
>
> | Mode | Ratio | Throughput | p50 | p99 | p99.9 | Hit rate |
> |---|---|---|---|---|---|---|
> | cluster (realistic, 1 client) | 1:10 | 5.0 M ops/s | 18.4 ms | 35.2 ms | 40.8 ms | 1.0 |
> | cluster (realistic, 1 client) | 1:1 | 5.0 M ops/s | 18.1 ms | 34.9 ms | 60.2 ms | 1.0 |
> | cluster-sat (driven ceiling) | 1:10 | 9.2 M ops/s | 0.42 ms | 0.78 ms | 0.90 ms | 1.0 |
> | cluster-sat (driven ceiling) | 1:1 | 8.7 M ops/s | 0.44 ms | 0.82 ms | 0.93 ms | 1.0 |
>
> (cluster medians of 2 reps: 1:10 = 5,027,714 ops/s; 1:1 = 5,010,724 ops/s. cluster-sat values are the single rep: 9,191,908 and 8,686,636 ops/s; their latencies are single-rep too.)
>
> Other Redis 8-core combinations that exist: pipeline **1** (mode `cluster` only, ratios 1:1 and 1:10, 100 B and 1024 B) and pipeline 16 at **1024 B**. All Redis runs here are session 1 — don't line them up against session-2 numbers without saying so.
>
> Terms used: **pipeline depth** = how many commands a client sends before waiting for replies; it is the single biggest throughput lever, and any number quoted without its depth is uninterpretable (KB: *Pipelining & Client-Side Routing Effects*, "Pipeline depth effect"). **p99 / p99.9** = the latency that 99 % / 99.9 % of requests come in under. **cluster vs cluster-sat** as defined above.
>
> Plain words: at 8 cores with pipeline 16, a Redis cluster driven the way a normal app drives it handles about 5 million operations a second with ~18 ms typical latency, while the same cluster pushed to its limit with one dedicated load generator per shard does about 9 million a second at under half a millisecond — but nobody measured pipeline 64 or a single-process Redis, so there is no number to give you for that.
>
> ## Sources
>
> GROQ run (verbatim):
>
> ```groq
> *[_type == "benchmarkRun" && engineName match "Redis*" && mode == "single" && coresUsed == 8]{_id, runId, session, engineName, mode, coresUsed, ratio, dataBytes, pipeline, rep, opsPerSec, p50Ms, p99Ms, p999Ms, hitRate, workload, note} | order(pipeline asc)
> ```
>
> ```groq
> {"engines": array::unique(*[_type=="benchmarkRun"].engineName), "modes": array::unique(*[_type=="benchmarkRun"].mode), "cores": array::unique(*[_type=="benchmarkRun"].coresUsed), "pipelines": array::unique(*[_type=="benchmarkRun"].pipeline), "ratios": array::unique(*[_type=="benchmarkRun"].ratio), "sizes": array::unique(*[_type=="benchmarkRun"].dataBytes)}
> ```
>
> ```groq
> *[_type=="benchmarkRun" && engineName=="redis"]{"k": mode + "|c" + string(coresUsed) + "|p" + string(pipeline) + "|" + ratio + "|" + string(dataBytes) + "|s" + string(session)} | order(k asc)
> ```
>
> ```groq
> {"redis8c": *[_type=="benchmarkRun" && engineName=="redis" && coresUsed==8 && pipeline==16 && dataBytes==100]{_id, mode, ratio, pipeline, rep, opsPerSec, p50Ms, p99Ms, p999Ms, hitRate, session} | order(mode asc, ratio asc, rep asc),
> "singleModeEngines": array::unique(*[_type=="benchmarkRun" && mode=="single"].engineName),
> "redisEngine": *[_type=="engine" && name match "Redis*"][0]{name, versionTested, threadingModel, clusterRequiredForScale, notes}}
> ```
>
> Run `_id`s used: `run-s1-20260901-083406-redis-cluster-8c-p16-1-10-d100-rep1`, `...-1-10-d100-rep2`, `...-1-1-d100-rep1`, `...-1-1-d100-rep2`, `run-s1-20260901-083406-redis-cluster-sat-8c-p16-1-10-d100-rep1`, `run-s1-20260901-083406-redis-cluster-sat-8c-p16-1-1-d100-rep1`; plus `engine-redis`.
>
> Knowledge Base entries read: `benchmark_methodology/pitfalls`, `pipelining_and_client_routing`, `benchmark_methodology/tooling_and_setup`.


---

## 7. “Which is better for my Postgres workload, MySQL or Postgres?”

**Tool calls:** none

> That question is outside what I can answer — this dataset only covers in-memory data stores (Redis, Valkey, Dragonfly, KeyDB, Garnet) and their benchmark runs, not relational databases like Postgres or MySQL.
>
> What I can help with instead: throughput (ops/s), p50/p99/p99.9 latency, hit rate, memory per key, and scaling behaviour across cores, value sizes, pipeline depths, and read/write ratios for those five engines — plus the vendor claims and glossary definitions behind them.
