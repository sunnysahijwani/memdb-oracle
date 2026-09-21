# When to use which: Dragonfly vs Redis vs Valkey

**Part 7 of 7** · [← Operational simplicity](/blog/redis-cluster-operational-simplicity) · [Series index](/blog/dragonfly-vs-redis-valkey-benchmark)

![Trade-off radar: Dragonfly leads on throughput-with-a-normal-client, operational simplicity, multi-key and memory; Redis/Valkey cluster leads on small failure domains and raw throughput ceiling](images/07-decision.png)

*Part 7, the finale. Six posts of measurements come down to this: there is no universal winner, and the right choice depends on which corner of a three-way trade-off you care about. Here's the decision guide I'd actually give a team.*

## The one-screen summary

| Dimension | Dragonfly | Redis / Valkey Cluster |
|---|---|---|
| **Throughput, normal client** | **~3.4× the cluster** (15.5M vs 4.6M @48c) | plateaus early; more shards don't help a naive client |
| **Throughput, perfectly driven** | 15.5M (that *is* driven — one endpoint) | **raw ceiling wins: ~40M** — but needs per-shard routing + a client as big as the server |
| **Effort to reach its throughput** | trivial (one-line client) | serious client-side engineering + client hardware |
| **Latency under load** | sub-ms, predictable | sub-ms *if* driven well; hundreds of ms with a naive client |
| **Multi-key / transactions / Lua** | works across the whole keyspace on one node | same-slot only (hash-tag tax) |
| **Memory / key** | ~13% leaner | baseline |
| **Failure domain / HA** | bigger blast radius per node; has replicas + cluster | **smaller shards = smaller blast radius**, mature, elastic |
| **Governance / licensing** | source-available (BSL) | Redis 8 tri-licensed (incl. AGPL); **Valkey = BSD, Linux Foundation** |

## The three-way trade-off

Every "which is best" argument is really about which of these three you're optimizing — you rarely get all three:

1. **Throughput-per-node** — most work out of one box.
2. **Operational simplicity** — fewest moving parts, no cross-slot data modeling, a dumb client.
3. **Failure domain / elasticity** — small blast radius, easy incremental scale-out, mature HA.

Dragonfly wins **1 and 2** decisively for the single-big-node case. Redis/Valkey Cluster wins **3**, and wins **1** *only* if you'll invest to drive it. That's the whole map.

## Pick by scenario

**Reach for Dragonfly when…**
- you want a lot of throughput from one node with a **normal client and minimal ops** — the common case, where it's ~3.4× a realistic cluster;
- you need **multi-key ops / transactions / Lua across arbitrary keys** while using all your cores;
- you'd rather **scale up than operate a cluster**, and pair one big node with a replica for HA;
- you're memory-sensitive on **many-small-keys** workloads.

**Reach for Redis / Valkey Cluster when…**
- you need **maximum raw throughput** and can invest in **flawless client-side routing + a large client fleet** (the 40M ceiling is real if you'll pay for it);
- you want **small failure domains and elastic horizontal scale** — many modest shards + replicas, so losing one shard blips 1/N of the keyspace;
- you've **outgrown a single big machine** (at which point Dragonfly would shard too, and hit the same cross-slot wall);
- you want the **most mature, battle-tested** clustering, or a specific **license** (Valkey's BSD / Linux Foundation governance is a real reason on its own).

**Valkey vs Redis specifically:** performance is a wash (Valkey is the Redis 7.2 fork; both are multi-threaded-I/O now). Choose on **governance and licensing**, not benchmarks.

## The honest one-liner

> **Redis Cluster has the higher raw ceiling; Dragonfly gives you most of the throughput for almost none of the operational cost. If you can engineer for the ceiling, take it. If you'd rather not, Dragonfly is the better default — and for a single big node with a normal client, it isn't close.**

## What I'd do

For a new service that fits comfortably on one large node — which is *most* services — I'd start with **Dragonfly**: near-top throughput, sub-ms latency, full multi-key semantics, less memory, and a client I don't have to think about. I'd move to a **cluster** (Dragonfly's or Redis/Valkey's) when I genuinely outgrow one machine or need small failure domains for HA — and I'd go in knowing the cross-slot tax and the client-side engineering that "using the cluster's throughput" actually requires.

---

*That's the series. Everything — the harness, pinned versions, raw `runs.csv`, and the analysis scripts — is public so you can rerun and challenge all of it. Verified against the DragonflyDB team's benchmarking notes before publishing; the fairness methodology (and the bias I caught in my own setup) is in [Part 1](/blog/dragonfly-redis-valkey-benchmark-methodology).*

*Benchmarked on AWS `c7i.metal-24xl` (48 physical Sapphire Rapids cores) + `c7i.24xlarge` client, us-east-1, same placement group. Redis 8.2.8 · Valkey 8.1.9 · Dragonfly v1.40.1 · memtier 2.5.1 · io_uring · client-side latency.*
