# Sanity setup checklist (Sunny, ~45 min, needs a browser)

**DONE Sep 19:** org `o09c84kq9`, project `ynsa3nyp`, dataset `production` PUBLIC, 497 docs imported (idempotent ✔), Studio https://memdb-oracle.sanity.studio/ (app id `vl4iigt9fc0c1fgxyi07tp4w`). **ALL DONE Sep 19–21.** KB built (8 issues resolved), endpoints `memdb` + `memdb-kb`, org token, Anthropic key+cap, 13/13 tests green. **HOSTED Sep 21: https://memdb.two-techies.com** (AWS Ubuntu box 13.204.233.176, Apache 2.4 reverse proxy w/ flushpackets, systemd unit as user `memdb`, app at /var/www/memdb-oracle, Let's Encrypt exp Dec 20 2026 auto-renew).

Everything the agent needs from Sanity, in the order that unblocks the build fastest.
Tick as you go; paste IDs/tokens into `.env` (never into chat or git).

## 1. Account / organisation (5 min)
- [ ] https://www.sanity.io/ → sign up / log in (GitHub login is fine).
- [ ] Dashboard → your organisation → **Labs** → enable **Context** (Knowledge Bases are beta, opt-in).
- [ ] Note the **organisation ID** (Dashboard → organisation settings) → `SANITY_ORG_ID`.
- [ ] Check the plan's Knowledge Base slot count (we need ONE). Free plan is expected to have at least one; if not, tell me.

## 2. Project + public dataset (5 min)
- [ ] Dashboard → **New project** → name `memdb-oracle`, dataset `production`, visibility **public** (judges must open it).
- [ ] Copy the **project ID** → `SANITY_PROJECT_ID` and into `sanity/.env` as `SANITY_STUDIO_PROJECT_ID=<id>`.

## 3. Import the data (5 min, terminal)
```bash
cd /Applications/XAMPP/xamppfiles/htdocs/sanity-benchmark-agent
npm run import:build          # rebuilds data/documents.ndjson (485 docs) — already done, safe to rerun
cd sanity && npx sanity login # browser auth once
SANITY_STUDIO_PROJECT_ID=<id> npx sanity dataset import ../data/documents.ndjson production --replace
SANITY_STUDIO_PROJECT_ID=<id> npx sanity deploy   # pick a hostname like memdb-oracle → Studio URL for the post
```
Expected import summary: 478 benchmarkRun + 5 engine + 12 finding + 2 benchmarkSession.
Idempotency check (test 17): run the import twice → same counts.

## 4. Knowledge Base (10 min to set up, then it builds on its own)
Dashboard → **Context** → **New knowledge base**
- Title: `memdb-kb`
- Purpose (paste): `Independent benchmark knowledge for choosing between Redis, Valkey, Dragonfly, KeyDB and Garnet. Audience: engineers deciding on an in-memory store and readers new to benchmarking. Covers methodology, measured throughput/latency/memory, the benchmark glossary and measurement rules, and the vendors' own performance claims so that claims and measurements can be compared side by side.`

**Add source → Website** (one per line; if the UI takes a single start URL, use the series hub first and add the rest as extra sources):
```
https://two-techies.com/blog/dragonfly-vs-redis-valkey-benchmark
https://two-techies.com/blog/dragonfly-redis-valkey-benchmark-methodology
https://two-techies.com/blog/dragonfly-vs-redis-throughput-scaling
https://two-techies.com/blog/redis-cluster-saturation-problem
https://two-techies.com/blog/dragonfly-vs-redis-latency
https://two-techies.com/blog/dragonfly-vs-redis-memory
https://two-techies.com/blog/redis-cluster-operational-simplicity
https://two-techies.com/blog/dragonfly-vs-redis-when-to-use-which
https://two-techies.com/blog/keydb-vs-garnet-benchmark
```
**Add source → Website (vendor claims — the contradiction fuel):**
```
https://www.dragonflydb.io/
https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/benchmarks/
https://docs.keydb.dev/
https://microsoft.github.io/garnet/docs/benchmarking/results-resp-bench
https://valkey.io/
```
**Add source → Files** — upload everything in `kb-sources/` (13 markdown files; sanitised copies — do NOT upload from the benchmark root).
If `.md` is rejected, tell me and I'll convert to `.txt`/`.pdf`.

**Add source → Dataset** — project `memdb-oracle`, dataset `production` (lets entries cite findings/engines).

- [ ] Click **Build entries** → wait for "Entries up to date" (can take a while — start this BEFORE anything else below).
- [ ] **Issues** tab: for each conflict, choose the measured/benchmark claim as ground truth and add the note
      `Measured on 48-core bare metal with a documented harness; vendor figure describes the vendor's own setup and is kept as context.`
      Screenshot the Issues list and one resolved Instruction (goes into the post).
- [ ] Note the Knowledge Base **public id** (starts with `kb`).

## 5. Context MCP endpoint (5 min) — ⚠️ TWO endpoints (found Sep 19: the endpoint editor keeps only the LAST saved source; dataset+KB on one endpoint does not persist)
- `memdb` → Content source: **Dataset** memdb-oracle/production ONLY (GROQ mode). Env `SANITY_MCP_NAME=memdb`.
- `memdb-kb` → Content source: **Knowledge bases** memdb-kb ONLY. Env `SANITY_KB_MCP_NAME=memdb-kb`. Same instructions text on both.
- Symptom when a source is missing: groq mode → -32004 "Only datasets with deployed Studio applications are supported" (misleading); knowledge_base mode → -32005 "no knowledge bases are configured".

Dashboard → **Context** → **MCP** → **New MCP** (name: `memdb`)
- Sources: the Knowledge Base `memdb-kb` **and** the dataset `memdb-oracle/production`.
- Instructions (paste, ≤10k chars):
```
This endpoint serves an independent in-memory database benchmark. Numbers live in benchmarkRun documents (median across rep). Prose, definitions and vendor claims live in the Knowledge Base. When answering, always cite the entry or the run ids used. Measured data is the ground truth for this dataset; vendor claims are context. Garnet throughput is client-limited (a floor). Session 1 and session 2 runs must not be compared without saying so.
```
- Endpoint URL will be `https://api.sanity.io/v1/context/organizations/<ORG>/mcp/memdb`.

## 6. Token (2 min) — ORGANISATION level, not project level
Dashboard → organisation → **API** → **Tokens** → new token, role/permission **Context Viewer**.
→ `SANITY_CONTEXT_TOKEN`. (Project-level tokens are rejected by Context MCP — that is test 16.)

## 7. Anthropic (3 min)
- [ ] console.anthropic.com → **Limits / spend cap**: set a hard monthly cap (suggest USD 25) BEFORE anything is hosted.
- [ ] API key → `ANTHROPIC_API_KEY`.

## 8. Smoke test
```bash
cp .env.example .env   # fill it
npm run ask -- "What tools do you have and what is in the dataset?"
npm run ask -- "Fastest engine at 48 cores, read-heavy, pipeline 16?"
npm test               # 6 offline + 7 live golden tests
```
