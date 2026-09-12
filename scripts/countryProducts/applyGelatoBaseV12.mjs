#!/usr/bin/env node
// DB package for the GELATO base v12 country products — NOT executed by default.
//
//   node scripts/countryProducts/applyGelatoBaseV12.mjs            # dry run: print the plan, touch nothing
//   node scripts/countryProducts/applyGelatoBaseV12.mjs --json     # dry run: full plan as JSON
//   node scripts/countryProducts/applyGelatoBaseV12.mjs \
//     --project-ref=tunabqqrwabacxjcxxkz --apply --owner-db-approval=GELLATTI-V12-PR-ING
//
// The Supabase project tunabqqrwabacxjcxxkz is shared by staging AND
// production. Mutation happens only with all three arguments above, exactly.
// The guard, the dry run and the sanctioned write path are shared with the v23
// package (lib/applyPlan.mjs, lib/applyCli.mjs, lib/applyExecutor.mjs). The
// write path is modeled on scripts/seed-staging-canonical-country-milk.mjs:
// product request → START_REVIEW → ADMIN_EVIDENCE_PATCH → duplicate preview →
// catalog-submit approval → APPROVE_LINK → canonical slot review → ADD_MARKET →
// country PRIMARY_DEFAULT. It never replaces or deactivates an existing
// assignment.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runApplyCli } from './lib/applyCli.mjs';
import { APPLY_APPROVAL_TOKEN } from './lib/applyPlan.mjs';
import { VERSION_PATHS } from './lib/versions.mjs';

await runApplyCli({
  repoRoot: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'),
  argv: process.argv.slice(2),
  paths: VERSION_PATHS.GELATO_BASE_V12,
  approvalToken: APPLY_APPROVAL_TOKEN,
});
