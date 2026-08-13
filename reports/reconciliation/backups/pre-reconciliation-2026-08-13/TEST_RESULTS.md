# Pre-reconciliation test evidence

The dirty combined Global Catalog + Unified Product Intelligence filesystem was tested before this recovery prompt.

- `npm test -- --reporter=dot`: PASS — 465 files, 6,044 tests.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS — 0 errors, 2 pre-existing Fast Refresh warnings.
- `npm run build`: PASS — existing chunk-size warning only.
- `npm run process:validate`: PASS — 2,088/2,088 Mapper/process alignment.
- `npm run products:audit`: PASS — 2,088 Mapper rows reconciled.
- Native PostgreSQL parsing of 0043, 0044 and 0045: PASS.
- `node scripts/captureDesktopPixelLock.mjs`: PASS — 64/64 bounds.
- `git diff --check`: PASS.

No staging or production mutation was part of these checks.
