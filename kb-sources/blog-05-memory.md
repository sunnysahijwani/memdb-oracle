# Memory efficiency: bytes per key

**Part 5 of 7** · [← Latency under load](/blog/dragonfly-vs-redis-latency) · [Next: Operational simplicity →](/blog/redis-cluster-operational-simplicity)

![Bytes per key: Dragonfly 146, Redis 165, Valkey 169 — Dragonfly ~13% leaner](images/05-memory.png)

*Part 5. The shortest post in the series, and the least arguable number in it — because memory footprint is about data-structure design, not how hard you drive the client. It's the same on a laptop and on 48 bare-metal cores.*

## The measurement

I loaded **1,000,000 keys × 100-byte values** into each engine, subtracted the empty-server baseline, and divided by key count:

| Engine | bytes / key | vs Dragonfly |
|---|---:|---:|
| **Dragonfly** | **146.1** | — |
| Redis 8.2 | 165.3 | +13% |
| Valkey 8.1 | 168.7 | +15% |

Dragonfly stores the same data in **~12–13% less memory** than Redis, and a bit less than Valkey.

## Why this one is trustworthy

Two reasons I trust this number more than any throughput number:

1. **It's hardware-independent.** I got 146.1 / 165.3 / 168.7 on my laptop *and* 146.1 / 165.3 / 168.7 on the c7i.metal box — to the decimal. Memory layout doesn't care about cores, io_uring, or how big your client is. There's nothing to "drive" and nothing to get wrong.
2. **It's methodology-proof.** No pipelining, no cluster routing, no client bottleneck — just "store a million keys, read the memory counter." The only care needed is subtracting the empty baseline and loading exactly N *distinct* keys (an easy thing to get wrong — load them in parallel with overlapping ranges and you'll silently store far fewer).

## What it means (and doesn't)

Dragonfly's edge comes from more compact internal data structures. For a 100-byte value, ~46–69 bytes of per-key overhead sits on top of the payload, and Dragonfly carries less of it.

Two honest qualifiers:
- **The percentage shrinks as values grow.** At 100 B, overhead is a big fraction of each key; at 10 KB values it's noise. Memory efficiency matters most for **many-small-keys** workloads (sessions, counters, feature flags, rate-limit buckets) — exactly where you also have the most keys.
- **13% is real money at scale but not a headline-grabber.** On a 256 GB dataset it's ~33 GB — a meaningful instance-size difference. It won't decide an architecture on its own, but it's a steady, dependable point in Dragonfly's favor that no amount of benchmarking dispute can erode.

*Next: [Part 6 — operational simplicity](/blog/redis-cluster-operational-simplicity), where the cluster's cross-key limitations get quantified — and where Dragonfly's real structural advantage lives.*
