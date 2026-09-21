# The Benchmark Dictionary

Every parameter that shapes an in-memory database benchmark — client side, server
side, network, and the metrics themselves — defined so a beginner can follow and
a practitioner can nod. Written as source material for the video series intros.
Each entry: what it is → why it changes the numbers → the value we used.

Companion: `MEASUREMENT-PLAYBOOK.md` (the rules we learned the hard way).

---

## Part 1 — The client side (who is asking)

**Benchmark generator (load generator).** The program that fires commands at the
database and measures what comes back. Ours is `memtier_benchmark` (Redis Labs'
standard C tool); others: `redis-benchmark`, YCSB, custom clients. *Why it
matters:* the generator IS the measurement instrument — a weak one measures
itself, not the server. *Ours: memtier 2.5.1, pinned by digest.*

**Client implementation (the language/library tax).** The same workload driven by
a C tool vs a Go/Java/Python client library produces different numbers, because
the client burns CPU parsing, routing, and scheduling. *Why:* your app never gets
what memtier gets — a maintainer-optimized Go client reached ~60% of memtier in
our testing. *Rule: name the client in every published number.*

**Number of clients / connections.** How many TCP connections carry the load
(memtier: threads × clients-per-thread). More connections = more parallel demand,
until they contend. *Why:* under-connected leaves the server idle; over-connected
measures congestion. *Ours: 48 threads × 20 conns = 960 connections at capture.*

**Client threads.** OS threads the generator uses to drive its connections. Must
fit the client machine's cores. *Why:* too few = the client is the bottleneck
(our Mac default of 4 threads client-limited everything until fixed).*

**Workers × in-flight (async client shape).** In async clients (e.g. Go
autopipeline): workers = concurrent goroutines issuing commands; in-flight = how
many commands each may have outstanding before it waits. Same total load in a
different shape performs differently (64×96 beat 16×384 by 27% in our runs).
*Rule: calibrate the shape to the hardware before capturing.*

**Pipeline size (depth).** How many commands the client sends down one connection
before waiting for replies. Depth 1 = ask, wait, ask. Depth 16 = 16 on the wire
at once. *Why:* the single biggest throughput lever — it amortizes network round
trips; but deeper pipelines queue, so latency rises. *Ours: 1 (latency-honest)
and 16 (throughput-honest), always reported separately.*

**GET vs SET ratio (read/write mix).** The proportion of reads to writes.
*Why:* reads and writes stress different paths (writes allocate memory, touch
replication/persistence). *Ours: 1:10 (read-heavy, cache-like) and 1:1 (mixed),
plus MGET/MSET multi-key variants.*

**Key size & key pattern.** How long key names are, and how they're chosen —
random (realistic cache), sequential (population), or hash-tagged `{tag}:...`
(forces cluster co-location). *Why:* pattern decides cluster routing behavior:
random keys fragment pipelines across shards; hash-tags keep them together.*

**Value size (payload).** Bytes stored per key. *Why:* small values (100 B) make
the benchmark CPU-bound (engine speed shows); large values (1 KB+) make it
network-bound (engines converge — our gaps compressed at 1 KB). *Ours: 100 B and
1024 B, reported separately.*

**Dataset size (keyspace).** Total distinct keys. *Why:* must exceed CPU caches
to be honest, and fit in RAM to avoid eviction; also determines memory-test
scale. *Ours: 1M keys benchmark, 5M for memory tests.*

**Hit/miss ratio.** Fraction of GETs that find their key. *Why:* misses are
cheaper than hits (no payload returned) — a high miss rate silently inflates
ops/s. We prefill the whole keyspace so hit_rate = 1.0, and record it per run as
proof. *A benchmark that doesn't report hit rate may be measuring misses.*

**Warmup.** A discarded period before measurement while caches fill, JITs
compile, connections settle. *Ours: 3–5 s discarded per run.*

**Repetitions (reps).** Same configuration run multiple times; report the
median. *Why:* one run can be a fluke (our blocking-arm reps differed by 23%).
*Ours: 2–3 reps, medians, raw reps preserved in the CSV.*

---

## Part 2 — The server side (who is answering)

**CPU architecture & generation.** x86 vs ARM, and the generation (our c7i =
Intel Sapphire Rapids). *Why:* per-core speed differs enormously across
generations — numbers from different CPU families aren't comparable. *Rule:
name the exact instance/CPU in every report.*

**Cores vs vCPUs vs hyperthreading.** A "96 vCPU" cloud box is usually 48
physical cores, each presenting 2 hyperthreads. Two hyperthreads share one
core's hardware — they are NOT two cores. *Why:* pinning an engine to "8 vCPUs"
that are 4 cores + their siblings halves what you think you gave it. *Ours:
lscpu -e mapped CPUs 0–47 as the real cores; engines pinned there.*

**CPU pinning (cpuset).** Restricting a process to specific cores. *Why:* it
makes "at N cores" a fact instead of a hope, prevents the client and server
stealing each other's CPU, and enables per-core efficiency math. *Ours: docker
--cpuset-cpus everywhere; it also confined Garnet's auto-scaling thread pool.*

**NUMA (non-uniform memory access).** Big machines group cores with "their own"
RAM; touching another group's RAM is slower. *Why:* an engine spanning NUMA
nodes gets erratic memory latency. *Ours: single-NUMA box (all 48 cores, one
node) — deliberately chosen to remove the variable.*

**Threading model.** How the engine uses cores: Redis = one execution thread
(+io-threads for network only); KeyDB = real execution threads (capped at 16 —
it fatally refuses more); Dragonfly = proactor threads that each own a slice of
data (shared-nothing); Garnet = .NET thread pool, self-scaling. *Why:* this IS
the architectural story most benchmarks are secretly about.*

**Persistence (RDB / AOF).** Writing data to disk for durability — snapshots
(RDB) or an append-only log (AOF). *Why:* persistence steals CPU and I/O from
serving; on vs off changes numbers materially. *Ours: OFF for every engine,
explicitly and symmetrically — we benchmark the engine, not the disk.*

**Replication.** Copying data to replica nodes for failover. Costs CPU and
network on the primary. *Ours: none — single-node/cluster primaries only; we say
so. A production deployment with replicas will see lower numbers.*

**Eviction policy & maxmemory.** What the engine does when RAM fills (evict
keys vs refuse writes). *Why:* mid-benchmark eviction pollutes everything.
*Ours: noeviction + maxmemory far above the dataset, verified equivalent on all
engines (dragonfly cache_mode=false).*

**Transparent Huge Pages (THP).** A kernel memory feature that causes latency
spikes in memory-heavy processes; every engine vendor says disable it. *Ours:
disabled on the server box before anything ran.*

**io_uring vs epoll.** Two Linux mechanisms for handling many network sockets.
epoll = classic (Redis/Valkey/Garnet); io_uring = newer, fewer syscalls
(Dragonfly's native path). *Why:* Docker's default seccomp profile silently
blocks io_uring — Dragonfly falls back to epoll and loses its edge unless you
allow it. We did (seccomp=unconfined), and verified. *A benchmark can handicap
an engine without knowing.*

**Bare metal vs virtualized.** A hypervisor adds jitter and steals cycles;
"dedicated" vCPUs still aren't a dedicated machine. *Why:* our Mac/VM numbers
were pure noise (a 1-thread server "beat" a 4-shard cluster). *Rule: publishable
throughput numbers come from bare metal (ours: c7i.metal-24xl).*

---

## Part 3 — The network (the road between them)

**RTT (round-trip time).** Time for a packet there and back. Loopback ≈ 20 µs,
same-AZ cloud ≈ 50–100 µs, cross-region = milliseconds. *Why:* RTT is the floor
under every latency number, and decides how much pipelining/batching pays.*

**Loopback vs real network.** Benchmarking client and server on one machine
skips the NIC entirely — unrealistically fast path, but also CPU contention
between client and server. *Ours: two separate machines, real network — and we
disclose when a fallback used loopback.*

**Bandwidth / NIC capacity.** The pipe's width. At 1 KB values × millions of
ops/s you can saturate a NIC and think the engine plateaued. *Why:* network
saturation masquerades as an engine ceiling. *Ours: 37.5 Gbps instances; value
sizes chosen so we measure engines, not the NIC.*

**Placement (same AZ / placement group).** Cloud knobs that keep two instances
physically close. *Why:* our client moved AZ-paths between sessions and the
reference numbers moved with it — same server. *Rule: same AZ always; note the
placement group; never compare across network paths without a caveat.*

**TLS.** Encrypting client-server traffic. Costs CPU on both ends (handshakes
and per-byte encryption) — real deployments increasingly require it. *Ours: OFF
(we say so). A TLS run is a legitimate future scenario — expect lower numbers.*

**Connection scaling.** More connections = more kernel/socket state and
per-connection buffers on the server. A multiplexing client (one connection per
node, like an async Go client) and a connection-per-worker client (memtier: hundreds)
stress the server differently at the same ops/s. *Report connection counts as a
result, not a footnote.*

---

## Part 4 — The metrics (what we actually report)

**Throughput (ops/s).** Completed commands per second. For multi-key commands,
say which you count: 1 MGET of 10 keys = 1 op or 10? (We count commands and say
so.)

**Latency percentiles (p50 / p99 / p99.9).** Sort every response time; p50 =
the middle one (median — half were faster), p99 = 99% were faster (the "bad
minute of the day"), p99.9 = the tail your angriest user feels. *Never use the
mean: latency is skewed and the mean reads high. And ALWAYS client-side —
engines self-report latency incompatibly (Dragonfly includes network+queue
time in info; Redis doesn't).*

**Ops per core.** Throughput ÷ cores given to the engine. The efficiency view —
separates "fast because big" from "fast because efficient." *Secondary to
per-node throughput in our reports (per a Dragonfly maintainer's fairness point).*

**Bytes per key.** (used_memory − empty baseline) ÷ keys, at a fixed value
size. Memory efficiency — the least-disputable cross-engine number. *Excluded
where unreportable (Garnet has no used_memory).*

**Hit rate (again, as a metric).** Printed per run in our CSV as proof the
run measured what it claimed.

**Client & server CPU% during the run.** The attribution metric: which side
was the bottleneck? Server pegged = engine ceiling (publish it). Client pegged,
server idle = client ceiling (say "at least X"). *Every plateau gets attributed
before it gets published.*

**Ceiling vs realistic.** Two honest numbers for the same system: what it
achieves driven perfectly (per-shard clients, hash-tag routing) vs driven by a
normal client. The gap between them — 6–9× in our cluster tests — is the
operational story most benchmarks hide. *When you see one cluster number,
always ask which one it is.*

---

## Part 5 — Client architecture (how a modern client library actually works)

*Part 1 covered the knobs you set on a client. This part covers what happens
*inside* a high-performance client library — the concepts behind an async Go
autopipeline work, and the vocabulary you need to reason about why a real
application never gets the number a benchmark tool reports. Framed in Go because
that's where these techniques are most developed, but the ideas are general.*

**The serialize-and-wait ceiling.** The default shape of a client call: turn the
command into bytes, write it to the socket, **block until the reply arrives**,
parse, return. One command per round trip, per connection. *Why it matters:* even
on a 100µs network that caps one connection at ~10,000 ops/s — the wire sits idle
almost the whole time, waiting. Every technique below exists to stop that idling.

**Goroutine.** Go's lightweight unit of concurrent work — not an OS thread and not
a process. One Go program routinely runs tens of thousands of them, all inside a
single process, scheduled onto a handful of real OS threads by the Go runtime.
*Why it matters here:* because they share one process, their Redis commands can be
pooled into shared batches — the thing separate OS processes (e.g. php-fpm
workers) fundamentally cannot do. Rough mapping for non-Go readers: one Go
application process ≈ an entire php-fpm pool, and its goroutines ≈ all the
in-flight requests at once — but able to share one command buffer.

**Pipelining vs autopipelining.** *Pipelining* = send many commands down one
connection before reading replies (amortizes round trips; the single biggest
throughput lever). *Manual* pipelining makes the application author collect the
batch explicitly. *Autopipelining* makes it implicit: application goroutines call
`Get`/`Set` normally, and the client library itself scoops commands from all of
them into a shared buffer and ships them as batches. The batching **emerges** from
concurrency — no code restructuring. *Why it matters:* it's how you get pipeline
throughput from ordinary-looking application code.

**Flusher.** The dedicated goroutine (one per connection) that decides **when** the
shared command buffer is actually written to the socket. The core tradeoff of a
modern client: flush too eagerly → tiny batches → per-command overhead returns;
flush too lazily → big batches, great throughput, but the first command waits for
the batch to fill → latency rises. *Why it matters:* the flush policy IS the
performance of an autopipelining client — it's the main thing being optimized in
an async Go client's connection-pool lineage.

**Half-duplex vs full-duplex (FD).** How a connection uses its two directions.
*Half-duplex* (walkie-talkie): write a batch, stop, read all its replies, write
the next — the outbound wire idles while replies stream back. *Full-duplex*
(phone call): a writer goroutine sends continuously while a separate reader
goroutine receives continuously on the same connection, so command B is going out
while command A's reply is still coming back. This **overlaps ~1 round trip per
command** — send and receive run concurrently, so the client never stops to wait.
*Why it matters:* FD is the difference between a connection that's busy half the
time and one that's busy all the time; it's the substance of an async cluster client's
FD work we benchmarked.

**Client-side routing (cluster).** In a cluster, each key belongs to a hash slot
owned by one node, so a cluster client must hold one pipe **per master** (48 pipes
for a 48-shard cluster), hash every key to pick the right pipe (`CRC16 mod
16384`), keep the slot map fresh, and follow MOVED/ASK redirects. *Why it matters:*
doing this routing *without* strangling the pipes is the hard part; its cost is
measured as the gap between a routing client and a no-routing baseline (we saw
~5–15%). A MOVED error reaching the driver means routing is broken and the number
is invalid.

**The runtime tax.** The cost of running everything inside **one process with one
language runtime**: one garbage collector that periodically coordinates all
goroutines at once, one scheduler multiplexing them onto OS threads, one netpoller
dispatching all socket events. *Why it matters:* a C tool running 48 separate
processes (like memtier's per-shard ceiling) pays none of this; a single Go
process driving 48 pipes pays all of it. It's a large part of why a real
application client lands at ~60% of what memtier reports.

**The ladder (measurement construction).** Not a task list — a series of runs
arranged so each differs from the next by exactly **one** variable, so the gap
between two rungs prices one specific cost. For the async-client question: memtier×48
processes (C, no runtime-sharing, no routing) → Go fd-per-node×48 processes (adds
the language) → Go fd-per-node×1 process (adds runtime-sharing) → Go cluster-fd×1
process (adds routing). Each gap isolates one cause — turning a blurry "Go gets
60% of memtier" into three separately-measured numbers (language cost,
runtime-sharing tax, routing cost). *Why it matters:* it's how you explain a
number instead of just reporting it.

---

*Everything above is instrumented in the public harness:
github.com/sunnysahijwani/dragonfly-redis-valkey-benchmark — every CSV row
carries its full parameter set, so any number can be traced to its exact
conditions.*
