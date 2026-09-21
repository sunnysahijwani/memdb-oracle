# Operational simplicity: the cross-key tax, quantified

**Part 6 of 7** · [← Memory efficiency](/blog/dragonfly-vs-redis-memory) · [Next: When to use which →](/blog/dragonfly-vs-redis-when-to-use-which)

![Multi-key MGET(10) throughput scales to 2.4M commands/sec on Dragonfly; Redis/Valkey clusters reject cross-slot multi-key (CROSSSLOT)](images/06-multikey.png)

*Part 6. Throughput and latency are what benchmarks measure. This is the thing they usually miss — and it's where Dragonfly's real structural advantage lives. It's also where I have to be most careful to stay honest, because it's easy to overclaim here.*

## The demo (run it yourself)

Take three plain keys and ask each engine to fetch them in one command. On a single Dragonfly process and on a single Redis, this just works. On a **Redis Cluster** it doesn't:

```
Redis Cluster (slots: alpha=865  bravo=8623  charlie=1769)
  MGET alpha bravo charlie      → CROSSSLOT Keys in request don't hash to the same slot
  EVAL over alpha bravo charlie → CROSSSLOT Keys in request don't hash to the same slot
  MGET {u1}:name {u1}:email     → OK   (same hash-tag → same slot)

Dragonfly (single process)
  MGET alpha bravo charlie      → OK
  EVAL over alpha bravo charlie → OK
```

This isn't a bug — it's how Redis Cluster is designed. Each shard is an independent process that only holds its slice of the 16,384 hash slots, and it **refuses** any multi-key command whose keys don't all live in the same slot, rather than doing a slow cross-shard scatter-gather.

## Why it matters: multi-key isn't a convenience, it's atomicity

`MGET` being rejected is mildly annoying — you can do three separate GETs. But the same rule hits **`MULTI`/`EXEC` transactions and Lua scripts**, and those are how you do *atomic* multi-key logic:

- deduct from `wallet:A`, credit `wallet:B`, all-or-nothing;
- check `stock:item`, decrement it, write `reserved:user` — atomically, so two buyers can't grab the last unit.

On a single Dragonfly (or single Redis) you write one Lua script over whatever keys you need and it runs atomically. On a Redis Cluster, that script can **only touch same-slot keys** — so you must force the related keys onto one slot with a **hash-tag** (`{group}:...`). That works, but it:
1. **concentrates those keys on one shard** — you lose the load-spreading you sharded for, and
2. **forces you to decide, at data-model time, which entities will ever need to be touched together** — often impossible to predict.

That's the tax. It's not "Redis is worse" — it's the unavoidable cost of splitting one logical keyspace across independent processes.

## Quantified: multi-key throughput

Because Dragonfly handles cross-key ops natively, I could benchmark them — `MGET`/`MSET` of 10 keys, scaling with cores:

- **`MGET(10)`, pipeline 16:** 4c → 0.3M, 8c → 0.5M, 16c → 0.9M, 24c → 1.3M, **48c → 2.4M commands/sec** (= ~24M keys/sec).
- **`MSET(10)`, pipeline 16:** scales similarly to ~1.3M commands/sec at 48 cores.

The Redis/Valkey clusters get **no bar on this chart** — cross-slot multi-key is rejected outright. To make it work you'd hash-tag everything onto shared slots, which changes the workload (and the point).

## The honesty guard — this is important

It would be easy, and wrong, to say "Dragonfly has no sharding limits." It does. **Dragonfly Cluster, once you scale it across machines, uses the same 16,384-slot model and returns the same `CROSSSLOT` error.** Dragonfly's advantage is narrower and more honest:

> A **single Dragonfly node uses all your cores without sharding** — so it keeps single-instance semantics (any multi-key op, atomic Lua, transactions) *while* scaling up. You postpone clustering — and its cross-key tax — until you genuinely outgrow one big machine. With Redis you pay that tax the moment you need more than one core's worth of throughput.

Not "never." **Later.** For a lot of workloads, "later" means "never in practice," because one big Dragonfly node goes a very long way. But if you truly outgrow a single machine, both engines shard and both hit the same wall.

## The takeaway

The cross-key tax is the clearest structural difference between the two designs. Redis makes you choose, quite early, between *using all your cores* and *keeping multi-key atomicity across arbitrary keys*. Dragonfly lets you have both on one node. That — not raw ops/sec — is the strongest case for it.

*Next: [Part 7 — when to use which](/blog/dragonfly-vs-redis-when-to-use-which), where all of this becomes a decision table.*
