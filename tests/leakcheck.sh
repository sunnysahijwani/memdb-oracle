#!/usr/bin/env bash
# Honesty lock: private experiment data and gated attribution must never reach
# the dataset, the KB sources, the agent, the web page, or the write-up.
# The patterns live in tests/leak-patterns.txt (one regex per line, gitignored)
# so the guard itself does not publish what it guards.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f tests/leak-patterns.txt ] || { echo "leak check skipped: tests/leak-patterns.txt not present"; exit 0; }
pattern=$(grep -v '^\s*$' tests/leak-patterns.txt | paste -sd'|' -)
targets="data kb-sources agent scripts sanity/schemaTypes docs web README.md"
hits=$(grep -rIn -i -E "$pattern" $targets --exclude-dir=node_modules 2>/dev/null || true)
if [ -n "$hits" ]; then echo "LEAK CHECK FAILED:"; echo "$hits"; exit 1; fi
echo "leak check passed ($(echo "$pattern" | tr '|' '\n' | wc -l | tr -d ' ') patterns) over: $targets"
