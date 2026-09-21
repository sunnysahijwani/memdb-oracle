# Measurement playbook — what the sharp people keep teaching us

Living document. Every incisive question, correction, or insight from collaborators
and commenters gets captured here, so the NEXT benchmark bakes it in from day one
instead of learning it mid-flight. Add entries with source + date.

## Rules we now follow (and who taught us)

1. **Measure at the boundary the user experiences — never what the system reports
   about itself.** Engine self-reported latency includes/excludes network + queue
   time differently per project; two vendors' "p99" are different measurements
   wearing the same shirt. *(a Dragonfly maintainer's note, Aug 9; independently confirmed by
   Baptiste, dev.to Part 4 comment, Sep 11 — his phrasing is the keeper.)*

2. **Record client CPU% for every run, always.** "Was the client saturated?" must
   answer itself from the CSV. We couldn't prove it for the private async-client runs
   and had to say so publicly. Now wired into the session script. *(Nedyalko's first
   question about our results, Sep 10.)*

3. **Attribute every plateau before publishing it.** Server CPU + client CPU sampled
   during the run decide whose ceiling it is. Garnet@48c looked like a plateau; it
   was the client (server at ~3400/4800%, client threads pegged). Publishing
   "Garnet plateaus at 21M" would have been wrong. *(Session 2, Sep 10 — same
   discipline that produced the Part 3 cluster-saturation story.)*

4. **Worker/concurrency shapes must match the hardware.** 16 workers on a 96-vCPU
   client is under-driving; an under-driven "ceiling" measures your pedal, not the
   engine. Calibrate shapes FIRST (fast short runs), capture at the winner.
   *(Nedyalko, Sep 10: "even 64 workers is small… ~100 workers with 100-300
   in-flight".)*

5. **Similar numbers across different setups prove nothing without a controlled
   test.** Laptop-loopback ≈ our-48-shard number LOOKS like a process-global cap,
   but both may just be under-driven. State the mechanism, make the falsifiable
   prediction, run the controlled check. *(Nedyalko's pushback, Sep 10 — "I
   wouldn't think those are related, but we can check".)*

6. **References must be same-day, same-boxes.** Client hardware alone moved our
   realistic-cluster reference 4.6M→6.9M (Intel→AMD client, identical server).
   Cross-session comparisons need explicit caveats or they're invalid.
   *(Session 2 accidental finding — now also our best "measure at the boundary"
   anecdote.)*

7. **Measurement overhead is part of the experiment design.** Full per-command
   latency sampling cost ~5% throughput on a CPU-limited client — the observer
   changes the number being observed. Sample (1/32 with batch-correlated commands
   is sound), and CALIBRATE the sampling once (full vs sampled at moderate load)
   rather than paying the tax on every run. *(Nedyalko's tool design, Sep 9.)*

8. **Label statistics honestly: a mean is not a p50.** Skewed latency
   distributions make means read high; mislabeling short-changes your own tool.
   If samples are already stored for p99, the true median is free.
   *(Our catch in Nedyalko's tool, Sep 9 — he fixed it.)*

9. **Redirects/errors surfacing at the driver = the run is invalid, not retryable.**
   MOVED reaching the harness means client routing is broken and the ops/s number
   is meaningless. Fail hard, never paper over. *(Nedyalko's tool README —
   adopted as our standard.)*

10. **Hard limits are findings, not failures.** KeyDB refusing to start >16 threads
    (FATAL, verbatim captured) is better data than any curve. Capture exact error
    text at the moment of failure. *(Session 2, Sep 10.)*

11. **Auto-scaling runtimes need confinement verification.** Garnet (.NET thread
    pool, no thread flag) could have escaped its cpuset and faked per-core numbers.
    docker stats during the run proved confinement. Any engine that "manages its
    own threads" gets this check. *(Session 2, Sep 10.)*

12. **Exclude engines from metrics they can't honestly report.** Garnet has no
    used_memory (pre-allocated log + .NET GC fields) → it is OUT of the bytes/key
    comparison, with the reason documented in the script. Partial honest coverage
    beats complete dishonest coverage. *(Session 2, Sep 10.)*

13. **Silence looks identical to progress — monitor for terminal states.** The
    KeyDB/Garnet sweep died silently on a failed config and idled 31 min of paid
    metal. Watchers must alert on failure signatures, not just tail the log.
    *(Session 2 harness bug, Sep 10.)*

14. **Decompose blended numbers into priced components.** "Go client = 60% of
    memtier" is an observation; the ladder (C-multiproc → Go-multiproc →
    Go-1proc-no-routing → Go-1proc-routed) turns it into separately-measured
    language cost + runtime-sharing tax + routing cost. Design experiments so each
    gap isolates ONE cause. *(Emerged from Nedyalko's one-process-vs-many point,
    Sep 10.)*

## Questions the audience asked that we should answer IN the next write-up

- "Was the box at full CPU for those numbers?" → publish client+server CPU
  alongside every headline number. (Nedyalko)
- "Does one process vs many matter?" → the runtime-tax ladder, run and charted.
  (Nedyalko)
- Real-workload boundary costs — cold starts, retries, connection churn — the
  "queue time nobody's dashboard admits to." Our benchmarks are steady-state;
  say so explicitly, and consider a churn/reconnect scenario. (Baptiste, Sep 11)
- Dragonfly/KeyDB/Garnet deep-dive (3 commenters on the Aug Redis-vs-Valkey post)
  → data captured Sep 9-10, post pending.

## Candidate improvements for benchmark v3

- [ ] Client CPU% column everywhere (memtier runs too, not just the async client).
- [ ] Per-run server CPU% captured automatically (not just ad-hoc docker stats).
- [ ] Calibration phase as a first-class harness stage (shapes sweep → capture).
- [ ] A connection-churn / reconnect scenario (Baptiste's boundary-cost angle).
- [ ] Publish an explicit "what we do NOT measure" section per report.
