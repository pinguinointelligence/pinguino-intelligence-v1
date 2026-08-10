# PINGÜINO Intelligence — final Aug 8–10 staging release

**Status: READY FOR OWNER QA**

## Release identity

- Integrated code commit: `ec693282bd4fe6cc68a0084deb3671a3d89cf689`.
- Integration base: fetched `origin/staging` `4bd4f50f3c371e579d8b071567764ece0fffe51b`.
- Staging URL: `https://staging.pinguinoai.com`.
- Vercel deployment: `AXF2mfxBVJrrzJrmjXEbJN1r1f1L`.
- GitHub deployment: `5833145749`, environment `Production – pinguino-staging` (the staging Vercel project, not the customer production project).
- Served asset: `assets/index-BgC8XTBZ.js`, `2,747,915` bytes.
- Served asset SHA-256: `5EEBB5E4EC0E575647C65EDFB905798FD4A4ACFE9A1648452319F9C8AFCD4DC1`.
- Content proof: the served JavaScript contains the full commit SHA plus `unavailableMainIngredientIds`, `physical_actual_violated`, `Master Label` and `Brak zweryfikowanego Preview`.

No production branch, customer production deployment, secret, credential, billing
setting, environment file or Mapper dataset was changed.

## Integration and conflicts

The Aug 8–10 work was applied on top of the newest legitimate staging state.
The only semantic merge conflict was `src/features/shell/appNav.ts`; it was
resolved by preserving the newest staging behavior and adding plan-aware global
navigation. No conflict was resolved by restoring older functional logic.

Independent reviews found and closed physical/lock mutation forgery at Verified
Apply, Master Label printing without a VERIFIED profile, forged lock promotion,
state loss in legacy redirects, and a served-only Direction Apply → Undo
availability fingerprint mismatch.

The exact final review of `ec693282` returned `DEPLOY`: reconstructed and
canonical inputs were equal, Direction Apply created one history entry, Undo was
available, Undo restored the formulation byte-for-byte while preserving the
Direction choice, and a later gram edit correctly made Undo stale.

## Automated verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — 0 errors, 2 unchanged react-refresh warnings |
| `npm test` | PASS — 441 files / 5,798 tests |
| `npm run build` | PASS — 1,075 modules; existing chunk-size warning only |
| `npm run recipes:validate` | PASS — 2,500 ranks, 80 images, 0 duplicate hashes |
| `npm audit` | PASS — 0 vulnerabilities |
| `git diff --check` | PASS |
| final independent review | PASS — 3 files / 49 tests |
| prior trust-boundary review | PASS — 7 files / 92 tests |

Regression coverage includes the current canonical draft, Preview/Apply/Undo,
identity and composition forgery, exact/percent/range/Required/Main/Multi-Main,
unavailable ingredients, Vegan, Protein, real Whisky boundary, OPTIMAL/ECO,
Production physical floor and rescue, Master Label, save/version/account
boundaries, Inspiration discovery and owner-review publication gates.

## Staging database and Mapper

- Staging Supabase project: `tunabqqrwabacxjcxxkz`.
- Applied schema-only migration: `20260810125404_mapper_process_metadata.sql`.
- Post-push dry run: remote database up to date; no pending migration.
- Mapper remains exactly 2,088 rows / 62 columns, no blank or duplicate IDs.
- Mapper SHA-256 remains `B13F5DB4AFFD9C3BE5CCBE59B40920053197A3697A3FA1BD4A859406E8BAED38`.
- Process companion tables are intentionally empty until the exact approved
  workbook is supplied; no scientific/process row was fabricated.

## Served browser QA

The browser was authenticated against served staging. Console errors after the
final route sweep: `0`. Desktop routes had `scrollWidth = clientWidth`; the
mobile editor/cockpit was verified at `390×844`, with earlier `360×800` and
`430×932` overflow sweeps also clean.

Verified on served staging:

- canonical logo and black/white design on guest, Home and Pro;
- recipe editor and cockpit, including honest pink blockers;
- Direction Preview → Apply → visible Undo → byte-identical formulation restore;
- Monitor technical score and complete historical metrics;
- Production stepper: Sucrose planned `136.8 g`, actual `180.0 g`, physical
  vessel mass `180.0 g`, forecast `1043.2 g`, truthful `6/10`;
- Production rescue: smallest verified larger batch `1307.4 g`, `10/10`, with
  `+264.2 g` Cream and no removal of confirmed material;
- Label history stays empty before a frozen completed snapshot instead of
  inventing label content;
- Inspiration first view exposes concrete families, including Truskawka and
  Pistacja; Protein remains a product filter;
- Lost & Legendary country selector and candidate are visibly owner-review,
  `RESEARCH`, `TESTOWE / NIEPRODUKCYJNE`, never customer-production ready;
- saved aggregate `QA FINAL c6a0ab1` was reopened and used as the Production
  session source, proving the canonical saved-recipe path.

QA evidence: `reports/qa/final-aug8-10-staging/` (28 screenshots).

## Remaining honest blockers

1. The exact approved process workbook is required before process metadata import.
2. Creaminess needs accepted sensory science; fat percentage is not substituted.
3. Flavour intensity needs ingredient/family potency calibration.
4. Verified market label rendering, allergen coverage, shelf-life basis and
   controlled print artifacts remain separate legal/data work.
5. Mid-production substitutions/process/toppings and broader server-side
   proprietary-IP/rate-limit work remain explicitly pink future architecture.

## AGENTS.md completion ledger

1. **Requested scope** — integrate all Aug 8–10 work, independently review, deploy only staging, verify the served build and produce owner evidence.
2. **Completed work** — all internally achievable scoped functions were integrated; review blockers were fixed; staging database and served browser were verified.
3. **Files changed** — commits `d09d96b` through `ec693282`; the final evidence commit adds only this report and QA images.
4. **Tests added/changed** — Direction, Apply trust boundary, locks, substitution, process, Protein, Whisky, ECO, Production, Master Label, redirects, workbar Undo and discovery regressions.
5. **Exact commands** — `npm run typecheck`; `npm run lint`; `npm test`; `npm run build`; `npm run recipes:validate`; `npm audit`; `git diff --check`; focused `npx vitest run ...`; `supabase db push`; `supabase db push --dry-run`.
6. **Results** — 5,798/5,798 full tests; 0 lint errors; build/typecheck/validation/audit/diff gates pass; independent exact-commit review passes.
7. **Accepted flows retested** — current draft, Preview/Apply/Undo, locks, identity, Main/Multi-Main, Vegan/Protein, pricing, Production/Rescue/Label, Inspiration/publication gate, save/reopen and account boundaries.
8. **Deployment verified** — `origin/staging`, Vercel staging deployment and served bundle contents verified; Supabase staging migration applied and dry-run clean.
9. **Remaining incomplete** — only the five listed data/science/legal/future-architecture items.
10. **External actions** — provide the approved process workbook and approved calibration/regulatory datasets before those blockers can be promoted.
11. **Git status** — code commit `ec693282` was clean and pushed; final status is recorded after the evidence-only commit. Production was not touched.
