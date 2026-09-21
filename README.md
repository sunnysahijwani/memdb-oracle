# memdb-oracle

An agent that answers questions about in-memory data stores — **Redis, Valkey, Dragonfly, KeyDB, Garnet** — only from measured data, and shows the vendor's claim next to the measurement when the two disagree.

Built for the [Sanity Challenge, Path One](https://dev.to/challenges/sanity-2026-09-16) on top of an independent, reproducible benchmark: 48 bare-metal cores, pinned versions, raw data public ([harness + CSVs](https://github.com/sunnysahijwani/dragonfly-redis-valkey-benchmark), [7-part write-up](https://two-techies.com/blog/dragonfly-vs-redis-valkey-benchmark)).

## How it works

```
question ──> Claude API (one call per turn, MCP connector)
               ├─ Sanity Context MCP, mode=groq            478 benchmarkRun docs + engine/finding docs
               └─ Sanity Context MCP, mode=knowledge_base  entries from the write-ups, glossary, playbook,
                                                            and the vendors' own pages — conflicts resolved
                                                            into Instructions in the Sanity Dashboard
```

- **Numbers** come only from GROQ over structured `benchmarkRun` documents (median across reps). "At 16 cores, read-heavy, pipeline 16, which has the lower p99?" is a query, not a search.
- **Prose, definitions and vendor claims** come only from the Knowledge Base, cited by entry.
- **Contradictions** (e.g. "25x more QPS than Redis" vs a measured 3.4× over a realistic cluster) are surfaced by the Knowledge Base build and shown side by side.
- The agent has **no MCP client code**: the Claude API's MCP connector calls Sanity server-side. The whole agent is [`agent/oracle.ts`](agent/oracle.ts) plus [`agent/system-prompt.md`](agent/system-prompt.md).

## Run it

```bash
npm install
cp .env.example .env     # Anthropic key + Sanity ORG id + org-level Context Viewer token
npm run ask -- "Is Dragonfly 25x faster than Redis?"
npm run ask              # interactive
npm run serve            # tiny web chat on :8787 with per-IP daily caps
```

## Data pipeline

```bash
npm run import:build     # CSV → data/documents.ndjson (deterministic _ids, validated, idempotent)
npm run import:push      # sanity dataset import … --replace
npm run golden           # golden numbers computed outside the agent → tests/golden.json
npm test                 # offline import tests + live golden/behaviour tests (skipped without env)
npm run leakcheck        # honesty lock: private experiment data never enters the dataset or KB
```

Schema: [`sanity/schemaTypes/`](sanity/schemaTypes/) — `engine`, `benchmarkRun` (one per run, every knob a field), `finding` (headline + caveat + vendor claim), `benchmarkSession`.

## Honesty rules the agent must follow

Encoded in the system prompt and checked by tests: median across reps; Garnet is "at least X, client-limited"; Garnet/KeyDB have no memory numbers; never compare session 1 with session 2 silently; "cluster" (realistic) vs "cluster-sat" (ceiling) always named; no number that was not measured; every answer ends with the GROQ it ran.

MIT.
