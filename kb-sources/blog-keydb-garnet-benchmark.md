# I benchmarked KeyDB and Garnet too — one hit a wall, one broke my assumptions

![KeyDB plateaus and refuses to start above 16 threads; Garnet scales almost linearly to 21.4M ops/s, past Dragonfly's number on half the cores](images/keydb-garnet-scaling.png)

*A follow-up to my [Dragonfly vs Redis vs Valkey series](/blog/dragonfly-vs-redis-valkey-benchmark). Same harness, same bare-metal approach — but this time I pointed it at the two engines almost nobody benchmarks independently: KeyDB and Microsoft's Garnet. One of them surprised me enough that I double-checked the numbers three times.*

When I published the Dragonfly benchmark, three different people asked the same question in the comments: *what about KeyDB? what about Garnet?* Fair. So I ran them — on the same methodology, so the numbers actually mean something next to the others.

Short version: **KeyDB hit a hard ceiling I didn't expect, and Garnet posted a number I didn't believe until I'd verified it wasn't an artifact.**

---

## The setup (and one honest caveat up front)

Single-node, read-heavy (1:10), 100-byte values, 1M keys, pipeline 16, client-side latency, medians across repetitions. The engine box was the same **48-core c7i.metal-24xl** as my earlier benchmark.

**The caveat:** this session's load-generator was an AMD `c7a.24xlarge` — the Intel client I'd used before had no capacity in the availability zone that evening. That matters, so I'm stating it loudly: the *reference* numbers shifted (a normal cluster-mode memtier client hit 6.9M here vs 4.6M in the earlier run — same server, different client, which is itself a lesson about where cluster bottlenecks live). **Every comparison below is within this one session, on these exact machines.** I'm not mixing it with the earlier capture.

Engine versions: **KeyDB 6.3.4**, **Garnet 2.1.6**.

---

## KeyDB: a wall, not a slope

KeyDB is the multithreaded Redis fork — its whole pitch is "Redis, but it uses your cores." So I expected a clean scaling curve. Here's what I got (read-heavy, pipeline 16):

| cores | throughput |
|---:|---:|
| 4 | 413K ops/s |
| 8 | 569K ops/s |
| 16 | 636K ops/s |
| 24 | **won't start** |
| 48 | **won't start** |

Two problems. First, the scaling is weak — doubling from 8 to 16 cores bought 12%, the signature of contention. Second, and more surprising: **KeyDB 6.3.4 refuses to start with more than 16 server threads.** Not a slowdown — a fatal config error:

```
*** FATAL CONFIG FILE ERROR (KeyDB 6.3.4) ***
'server-threads "24"'
Invalid number of threads specified
```

So on a 48-core box, KeyDB's multithreading tops out at a third of the machine, and its latency under load sat around 22–29ms p50 while it did it. It's a real, hard architectural ceiling — and honestly, it's the clearest answer I've seen to *"why did Dragonfly rewrite from scratch instead of just doing what KeyDB did?"* The fork approach ran out of runway.

*(Memory footnote: KeyDB was also the heaviest of every engine I've tested — **200.3 bytes/key** vs Dragonfly's 146, Redis's 165, Valkey's 169, at 100-byte values.)*

---

## Garnet: the number I didn't believe at first

Garnet is Microsoft Research's from-scratch store, written in .NET. I included it half-expecting a research curiosity. Instead:

| cores | throughput | p50 latency |
|---:|---:|---:|
| 4 | 4.1M ops/s | — |
| 8 | 8.1M ops/s | 1.7 ms |
| 16 | 15.8M ops/s | 0.75 ms |
| 24 | 19.0M ops/s | 0.59 ms |
| 48 | **21.4M ops/s** | 0.68 ms |

Almost linear to 16 cores, still climbing at 48, and **sub-millisecond p50 the whole way**. At 16 cores it had already passed the 15.5M that Dragonfly posted at 48 cores in my earlier benchmark — using a third of the hardware.

My first reaction was "that can't be right — the threads must have escaped their CPU limit." So I checked. I watched server CPU during every run: at 24 cores Garnet peaked at 2204% (of a 2400% budget), at 48 cores around 4000% of 4800% — comfortably inside the cores it was pinned to. Hit rate was 1.0 throughout. The number is real.

**And here's the honest part that makes it more impressive, not less:** 21.4M isn't Garnet's ceiling. At 48 cores the *server* wasn't saturated — my client machine ran out of capacity first. I was measuring my load generator, not Garnet's limit. So the real number is higher; I simply couldn't drive it hard enough with one client box. When I say Garnet does "at least 21.4M," the "at least" is doing real work.

---

## What this does — and doesn't — say

I try to be careful here, because it's easy to turn a surprising number into a wrong headline.

- **This is single-node.** Garnet has a cluster mode I didn't test; these are one-process numbers.
- **21.4M is a floor, not a ceiling** — it's client-limited. Don't quote it as Garnet's maximum.
- **I left Garnet out of the memory comparison.** It doesn't report `used_memory` the way the RESP engines do (it pre-allocates a log and reports .NET GC internals), so a bytes/key number would have been apples-to-oranges. Better to say nothing than to say something dishonest.
- **Different client than my earlier series** — so treat this as its own session, which is exactly how I've presented it.

What it *does* say: the multithreaded-fork approach (KeyDB) has a real ceiling, and the from-scratch approaches (Dragonfly, Garnet) are the ones actually using modern many-core hardware. Garnet in particular deserves far more independent benchmarking than it gets — I may be one of the first to publish a fair, reproducible number on it, and I'd genuinely like to be proven wrong or right by someone rerunning it.

---

## Explore the data yourself

Every number here is filterable — by engine, core count, workload, and pipeline depth — in the **[interactive Benchmark Explorer](/benchmarks/keydb-garnet-benchmark)**. And the whole harness, pinned image digests, and raw `runs.csv` are public: **[github.com/sunnysahijwani/dragonfly-redis-valkey-benchmark](https://github.com/sunnysahijwani/dragonfly-redis-valkey-benchmark)**. Rerun it and tell me where I'm wrong — that's the point.

*If you're new here, start with the [main Dragonfly vs Redis vs Valkey series](/blog/dragonfly-vs-redis-valkey-benchmark) for the methodology and the fairness choices behind all of this.*
