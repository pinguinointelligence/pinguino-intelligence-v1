#!/bin/bash
# QA ONLY — prove WHICH code the QA branch is running before a campaign part starts.
#
# A branch rebase silently redeployed every parent function once already
# (2026-09-17 12:51 UTC), so a campaign ran against production code while the
# report said it was testing a PR. This downloads the deployed bundle and
# compares each file's git blob with the commit under test. A mismatch stops the
# comparison; it is never mistaken for a defect in the code under test.
#
# usage: verify_deployment.sh <function> <worktree> <commit> [file ...]
#   verify_deployment.sh stripe-webhook ~/Developer/pinguino-affiliate-work/wt-basil HEAD \
#       stripe-webhook/index.ts stripe-webhook/dispatch.ts stripe-webhook/effects.ts
set -u
FN=$1; WT=$2; COMMIT=$3; shift 3
REF=ncmsonfwbgsqedgnzofg
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

( cd "$TMP" && supabase functions download "$FN" --project-ref "$REF" --use-api --workdir "$TMP" >/dev/null 2>&1 )
status=0
for f in "$@"; do
  deployed="$TMP/supabase/functions/$f"
  if [ ! -f "$deployed" ]; then
    echo "MISSING  $f (not in the deployed bundle)"
    status=1
    continue
  fi
  a=$(git -C "$WT" hash-object "$deployed")
  b=$(git -C "$WT" rev-parse "$COMMIT:supabase/functions/$f" 2>/dev/null)
  if [ "$a" = "$b" ]; then
    echo "MATCH    $f $a"
  else
    echo "DIFFERS  $f deployed=$a $COMMIT=$b"
    status=1
  fi
done
supabase functions list --project-ref "$REF" -o json 2>/dev/null | python3 -c "
import json,sys,datetime
fn='$FN'
for row in json.load(sys.stdin):
    if row['slug'] == fn:
        print('version  v%s updated %s UTC' % (row['version'], datetime.datetime.utcfromtimestamp(row['updated_at']/1000).isoformat()))
"
exit $status
