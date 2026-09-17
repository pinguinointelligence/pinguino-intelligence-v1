#!/bin/bash
# QA ONLY — run campaign slices strictly one after another (the Supabase CLI must never run concurrently).
RUN=$1; shift
LOG=~/Developer/pinguino-affiliate-work/logs/qa-stripe/campaign/${RUN:0:8}
cd "$(dirname "$0")"
for s in "$@"; do
  echo "=== $s start $(date -u +%FT%TZ)"
  timeout 2400 python3 campaign.py "$s" "$RUN" > "$LOG/run-$s.out" 2>&1
  echo "=== $s exit=$? end $(date -u +%FT%TZ)"
  grep -E "PASS|FAIL|checks passed|Error|Traceback|RuntimeError" "$LOG/run-$s.out" | cut -c1-600
done
