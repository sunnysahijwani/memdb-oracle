#!/usr/bin/env python3
"""Golden numbers computed OUTSIDE the agent, straight from data/documents.ndjson
(median across reps, same semantics as the repo's analysis/report.py).
Writes tests/golden.json — the agent's answers are checked against this."""
import json, statistics, collections, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
runs = [json.loads(l) for l in open(root/"data/documents.ndjson") if '"benchmarkRun"' in l]
runs = [r for r in runs if r["_type"] == "benchmarkRun"]
g = collections.defaultdict(list)
for r in runs:
    g[(r["session"], r["engineName"], r["mode"], r["coresUsed"], r["ratio"], r["dataBytes"], r["pipeline"])].append(r)
def med(key, field):
    rows = g.get(key)
    if not rows: return None
    return round(statistics.median(x[field] for x in rows), 3)
def ids(key): return [x["_id"] for x in g.get(key, [])]
K = lambda s,e,m,c,r="1:10",d=100,p=16: (s,e,m,c,r,d,p)
golden = {
  "q1_fastest_48c_readheavy_p16": {
    "dragonfly": med(K(1,"dragonfly","single",48),"opsPerSec"),
    "redis_cluster_realistic": med(K(1,"redis","cluster",48),"opsPerSec"),
    "redis_cluster_sat_ceiling": med(K(1,"redis","cluster-sat",48),"opsPerSec"),
    "valkey_cluster_realistic": med(K(1,"valkey","cluster",48),"opsPerSec"),
    "valkey_cluster_sat_ceiling": med(K(1,"valkey","cluster-sat",48),"opsPerSec"),
    "run_ids_dragonfly": ids(K(1,"dragonfly","single",48)),
  },
  "q2_p99_16c_df_vs_redis_cluster": {
    "dragonfly_p99": med(K(1,"dragonfly","single",16),"p99Ms"),
    "redis_cluster_p99": med(K(1,"redis","cluster",16),"p99Ms"),
  },
  "q3_overtake_cores": {c: {"dragonfly": med(K(1,"dragonfly","single",c),"opsPerSec"), "redis_cluster": med(K(1,"redis","cluster",c),"opsPerSec")} for c in (4,8,16,24,48)},
  "q5_garnet_vs_dragonfly": {
    "garnet_48c_s2": med(K(2,"garnet","single",48),"opsPerSec"),
    "garnet_24c_s2": med(K(2,"garnet","single",24),"opsPerSec"),
    "dragonfly_48c_s1": med(K(1,"dragonfly","single",48),"opsPerSec"),
    "required_phrases": ["client-limited", "at least"],
  },
  "q6_keydb": {c: med(K(2,"keydb","single",c),"opsPerSec") for c in (4,8,16)},
  "q7_valkey_pipeline_24c": {"p1": med(K(1,"valkey","cluster",24,p=1),"opsPerSec"), "p16": med(K(1,"valkey","cluster",24,p=16),"opsPerSec")},
  "q14_nonexistent_combo": {"key": "redis single 8c pipeline 64", "exists": bool(g.get(K(1,"redis","single",8,p=64)))},
  "totals": {"runs": len(runs), "groups": len(g)},
}
(root/"tests/golden.json").write_text(json.dumps(golden, indent=2) + "\n")
print(json.dumps(golden, indent=2)[:1500])
