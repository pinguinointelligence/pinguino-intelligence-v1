#!/usr/bin/env node
// DB package for the GELATO base v23 country products (FINAL owner workbook)
// — NOT executed by default.
//
//   node scripts/countryProducts/applyGelatoBaseV23.mjs            # dry run: print the plan, touch nothing
//   node scripts/countryProducts/applyGelatoBaseV23.mjs --json     # dry run: full plan as JSON
//   node scripts/countryProducts/applyGelatoBaseV23.mjs \
//     --project-ref=tunabqqrwabacxjcxxkz --apply --owner-db-approval=GELLATTI-V23-PR-ING
//
// The Supabase project tunabqqrwabacxjcxxkz is shared by staging AND
// production. Same guard, dry run and sanctioned write path as the v12 package
// (lib/applyPlan.mjs, lib/applyCli.mjs, lib/applyExecutor.mjs), reading the v23
// registry and requiring the v23 owner approval token — the v12 token never
// applies v23. --apply is also refused while
// docs/country-products/gelato-base-v23/catalog-dedupe-snapshot.json is still
// the seeded copy of the v12 snapshot: re-capture it read-only, re-run
// importGelatoBaseV23.mjs and review the regenerated package first.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runApplyCli } from './lib/applyCli.mjs';
import { V23_APPLY_APPROVAL_TOKEN } from './lib/applyPlan.mjs';
import { VERSION_PATHS } from './lib/versions.mjs';

await runApplyCli({
  repoRoot: resolve(dirname(fileURLToPath(import.meta.url)), '..', '..'),
  argv: process.argv.slice(2),
  paths: VERSION_PATHS.GELATO_BASE_V23,
  approvalToken: V23_APPLY_APPROVAL_TOKEN,
});
