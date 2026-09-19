#!/bin/bash
# QA ONLY — run campaign slices strictly one after another (the Supabase CLI must never run concurrently).
# usage: run_slices.sh <run-id> <suffix|-> <slice> [slice ...]
RUN=$1; SUF=$2; shift 2
[ "$SUF" = "-" ] && SUF=""
LOG=~/Developer/pinguino-affiliate-work/logs/qa-stripe/campaign/${RUN:0:8}
cd "$(dirname "$0")"
for s in "$@"; do
  echo "=== $s${SUF:+ ($SUF)} start $(date -u +%FT%TZ)"
  timeout 2400 python3 campaign.py "$s" "$RUN" $SUF > "$LOG/run-$s${SUF:+-$SUF}.out" 2>&1
  echo "=== $s exit=$? end $(date -u +%FT%TZ)"
  grep -E "PASS|FAIL|checks passed|RuntimeError" "$LOG/run-$s${SUF:+-$SUF}.out" | cut -c1-300
done
