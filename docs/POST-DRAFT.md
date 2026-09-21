---
title: memdb-oracle: an agent that answers Redis-vs-Dragonfly questions only from measured data
published: false
tags: devchallenge, sanitychallenge, sanity, ai
---

*This is a submission for the [Sanity Challenge, Path One: Ship an Agent That Queries Real Content](https://dev.to/challenges/sanity-2026-09-16)*

## What I Built

Choosing between Redis, Valkey, Dragonfly, KeyDB and Garnet is a decision you cannot afford to get wrong, and the loudest sources are vendor pages. Earlier this month I published an independent benchmark of these engines on 48 bare-metal cores, with the harness, pinned versions and raw data public. **memdb-oracle** is an agent that answers questions from that data and nothing else. When a vendor's page says one thing and the measurement says another, it shows both, with sources, and tells you which one was measured.

Why structured content is the whole point: "at 16 cores, read-heavy, pipeline 16, which engine has the lower p99?" is not a search. It is a query over 478 run documents, each with every knob that moved the number as a field: engine, mode, cores, read/write ratio, value size, pipeline depth, repetition, throughput, p50/p99/p99.9, hit rate, session. A keyword search over my blog posts returns a paragraph. GROQ returns two medians and the run ids behind them.

Three things it does that I could not get from a search box:

1. **Numbers come only from GROQ, prose only from the Knowledge Base.** Every answer ends with the exact GROQ it ran and the `_id`s of the runs it used, so anyone can verify it against the public dataset.
2. **Vendor claim and measurement side by side.** Ask "Is Dragonfly 25x faster than Redis?" and it reads Dragonfly's own claim from the Knowledge Base, runs the queries, and answers: not on this hardware, 3.4× over a realistic Redis cluster and 38% of the fully driven ceiling, and here is why the vendor's single-process comparison is a different test.
3. **It refuses to invent.** Ask for a combination that was never measured and it says so and lists the nearest real rows. Ask about Postgres and it declines in one paragraph.

It also explains terms for people new to benchmarking, from the benchmark glossary in the Knowledge Base, and marks anything it explains from general knowledge as exactly that.

## Demo

**Live: https://memdb.two-techies.com** — no login. Example questions are pre-loaded as chips. Each answer shows the Sanity tool calls it made and ends with the GROQ it ran. A turn takes 30 to 60 seconds because it is five to ten sequential Context MCP calls plus model reasoning; the page streams tool activity while it runs. Limit: 30 questions per IP per day.

Three curated answers from the session log:

<details><summary><b>"Is Dragonfly 25x faster than Redis?"</b> (7 GROQ queries + 1 Knowledge Base read)</summary>

> **Short answer: not on this hardware, in this benchmark.** Measured, the gap is about 3.4× — and it flips the other way against a fully-driven Redis cluster.
>
> **Vendor statement (context, not measurement).** Dragonfly's own marketing claims "25× higher throughput than Redis", backed by their AWS c6gn.16xlarge figures of ~3.97M QPS (Dragonfly) vs ~130k QPS (Redis) on GET — KB entry *Dragonfly Self-Reported Performance Claims*. That ~130k/s figure is a **single Redis process**, i.e. one core doing the data work, versus a Dragonfly process using the whole machine.
>
> **Measured, this dataset (ground truth here).** Session 1, AWS c7i.metal-24xl, 48 cores, read-heavy SET:GET 1:10, 100 B values, pipeline 16, hit rate 1.0, median across reps:
>
> | Configuration | Throughput (median) | vs Dragonfly |
> |---|---|---|
> | Dragonfly, 1 process (`single`) | **15.5 M ops/s** | — |
> | Redis Cluster, 48 shards, `cluster` (realistic: one normal client) | **4.6 M ops/s** | Dragonfly 3.4× faster |
> | Redis Cluster, 48 shards, `cluster-sat` (driven ceiling, one client per shard) | **40.6 M ops/s** | Redis 2.6× faster |
>
> **Why the claim and the measurement differ.** The 25× comparison is one Dragonfly process against one Redis process. The KB entry *Common Benchmark Pitfalls* calls this "not a fair fight": Redis executes commands on one thread, so the like-for-like peer is a Redis Cluster with one shard per physical core. This dataset contains no single-process Redis runs (0 documents with `engineName == "redis" && mode == "single"`), so the vendor's exact comparison cannot be reproduced here. [...]
>
> **Plain words:** on the test machine here, Dragonfly served about three and a half times as many requests per second as a normal Redis cluster, and about a third as many as a Redis cluster pushed as hard as the hardware allows — nowhere near twenty-five times either way.

</details>

<details><summary><b>"Give me the Redis single-process result at 8 cores with pipeline 64."</b> (never measured)</summary>

> **No matching run exists.** Two parts of your request are not in the dataset: `pipeline 64` was never measured — the only pipeline depths in the whole dataset are 1 and 16 — and Redis has no `single`-mode runs; Redis appears only as `cluster` and `cluster-sat`. Why: Redis executes commands on one thread, so a single process cannot use more than one core; the series therefore tests Redis as an N-shard cluster and reports it two ways. [...] **Nearest measured combinations — Redis, 8 cores, pipeline 16, 100 B, session 1:** cluster (realistic) 5.0 M ops/s, p99 35.2 ms; cluster-sat (driven ceiling) 9.2 M ops/s, p99 0.78 ms.

</details>

<details><summary><b>"Which is better for my Postgres workload, MySQL or Postgres?"</b> (out of scope, zero tool calls)</summary>

> That question is outside what I can answer — this dataset only covers in-memory data stores (Redis, Valkey, Dragonfly, KeyDB, Garnet) and their benchmark runs, not relational databases like Postgres or MySQL. What I can help with instead: throughput, p50/p99/p99.9 latency, hit rate, memory per key, and scaling behaviour across cores, value sizes, pipeline depths and read/write ratios for those five engines — plus the vendor claims and glossary definitions behind them.

</details>

## Code

**https://github.com/sunnysahijwani/memdb-oracle** (MIT)

The whole agent is one file plus a system prompt. It uses the Claude API's MCP connector, so Sanity's Context MCP is called server-side and there is no MCP client code at all: one API call per turn, streamed to the page over server-sent events. The repo also holds the schema, the CSV importer, the golden-number script and 13 tests (6 offline, 7 live against the real endpoints).

## How I Used Sanity

**Schema.** Four document types in `sanity/schemaTypes/`:

- `benchmarkRun` — one document per measured run, 30 fields in four fieldsets: identity and provenance (session, runId, the source CSV and line number, so every number is traceable), server configuration (mode, shards, coresUsed, cpuset), workload (ratio, dataBytes, pipeline, client threads and connections) and results (opsPerSec, p50/p99/p99.9, hitRate). Deterministic `_id`s, so re-import is idempotent; I ran it twice and the count stayed at 497.
- `engine` — version pinned in the harness, threading model, configuration notes the agent must repeat, and the vendor page whose claims the Knowledge Base compares against.
- `finding` — a headline number with its caveat, its metrics, and the verbatim vendor claim it is usually compared to.
- `benchmarkSession` — because two capture sessions on different dates must never be compared silently.

**Import.** CSV → NDJSON → `sanity dataset import --replace`. The importer keeps only the bare-metal capture rows (350 from the Dragonfly/Redis/Valkey session, 128 from the KeyDB/Garnet session), validates every field, and drops 147 smoke, laptop and diagnostic rows that were never measurements. A grep-based leak test makes sure a private client experiment I have not published never enters the dataset or the Knowledge Base.

**Knowledge Base.** Sources: the nine write-up pages (Website), the benchmark glossary, measurement playbook and findings (Files), the `finding`/`engine`/`benchmarkSession` documents (Dataset — deliberately not the 478 runs, those are for GROQ), and the vendor pages: Dragonfly's homepage and comparison pages, the Redis benchmarks page, KeyDB's docs landing page and Garnet's published results.

The build raised eight Issues. Four were thin entries it offered to merge; I kept them standalone. The other four were **Conflicts, marked Critical, that I had not told it to look for**:

- Dragonfly's "25× more QPS than Redis" vs the measured 3.4× over a realistic cluster.
- Dragonfly's "30–60% better memory" vs the measured 12–13% (146 vs 165 bytes/key).
- Garnet "higher throughput than Dragonfly" vs my note that Garnet's 21.4M is a client-limited floor from a different session and a different load generator.
- Dragonfly's "sub-1 ms p99" vs the measured 2.42 ms at pipeline 16 and 0.55 ms without pipelining.

Each resolution became an Instruction, a standing rule tied to the sources, and the vendor entries were rewritten under those rules. That is the mechanism the agent leans on when it says "measured is ground truth here, the vendor figure describes their own setup".

**TODO screenshot: Issues → Resolved tab (four Critical conflicts).**
**TODO screenshot: Instructions page (four rules, origin "Resolved issue").**

**Context MCP.** Two endpoints, same organisation token: `memdb` serves the dataset (tools `initial_context`, `schema_explorer`, `groq_query`, `array_field_reader`) and `memdb-kb` serves the Knowledge Base (`initial_context`, `knowledge_base_read`). The system prompt forbids numbers from anywhere but `groq_query` and prose from anywhere but `knowledge_base_read`. Both endpoints carry the same custom instructions: cite the entry or run ids, measured data is ground truth, Garnet is client-limited, sessions are not comparable without saying so.

**What went wrong, honestly.**

- My first Dragonfly crawl pulled 492 pages and blew straight through the plan's 150-indexed-document cap (634 of 150). The fix was better than the original: I re-added only the homepage bucket and the five comparison pages, because the claims I contradict live on exactly those pages.
- I wanted one endpoint with both sources, which the docs suggest is the common setup. In the editor, only the last saved source survived a refresh: attach the Knowledge Base and the dataset dropped off, and GROQ mode then failed with a misleading "deploy a Studio v5.1.0+" error while the Studio was deployed and the schema listed. Two endpoints, one source each, fixed it in ten minutes.
- The model narrated "I'll start by loading both sources" before its first tool call and that leaked into the chat. Fix: the final answer is the text after the last tool call, plus a one-line rule in the prompt.
- Turns are slow, 30 to 60 seconds, because each is a chain of sequential MCP round trips through the API plus reasoning. Streaming the tool activity to the page made that acceptable; it did not make it fast.

## Sanity Project Details

- Project ID: `ynsa3nyp`, dataset `production` (public). Try it without a token: https://ynsa3nyp.api.sanity.io/v2025-08-15/data/query/production?query=count(*%5B_type%3D%3D%22benchmarkRun%22%5D)
- Studio: https://memdb-oracle.sanity.studio/
- Knowledge Base: `memdb-kb`, served by endpoint `memdb-kb`; dataset served by endpoint `memdb`.

## Agent Session

**TODO: upload the Claude Code session (schema, import, first contradiction), Make Public, embed here.**
