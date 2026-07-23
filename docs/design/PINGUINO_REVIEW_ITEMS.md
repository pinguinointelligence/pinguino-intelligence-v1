# PINGÜINO — OWNER REVIEW ITEMS (`DO PRZEGLĄDU`) — Phase 3

Date: 2026-07-24 · Agent G. Source of truth for the red markers rendered by
`src/features/design-review/` (staging-only + owner/QA capability; customers NEVER see them).

**How the gate works** (proven by `designReview.test.tsx`):
- environment: dev build OR `VITE_DESIGN_REVIEW=1` (set ONLY on the staging deploy target;
  production never sets it),
- capability: the EXISTING resolved persona must be `pro` (owner/QA tier) — demo/home see nothing,
- meaning is carried by icon + text (`DO PRZEGLĄDU`), never color alone,
- nothing is removed, hidden, or made unreachable — markers only flag.

**Checklist semantics** — the owner marks one of: `KEEP` / `MOVE` / `RENAME` / `MERGE` /
`REMOVE APPROVED`. No removal happens automatically; `REMOVE APPROVED` only authorizes a future,
separate change.

| Id | Item | Route | Function | Why questionable | Suggested action | Owner decision |
|----|------|-------|----------|------------------|------------------|----------------|
| RV-01 | Gotowe receptury — EN copy + decorative tiles | `/recipes` | browse hub; only „Moje receptury” link is live | English customer copy; dead-looking clickable tiles | keep + PL pass + label tiles as roadmap | pending |
| RV-02 | Etykiety i produkty — EN copy | `/label` | sample nutrition label + QUID + CSV/print | English customer copy | keep + PL pass | pending |
| RV-03 | API destination — EN, all coming-soon | `/api` | roadmap rows only | EN; seven passive rows | keep (roadmap surface) | pending |
| RV-04 | Work With Us — EN copy | `/work-with-us` | 4 offers + mailto | English customer copy | keep + PL pass | pending |
| RV-05 | Create Ingredient — EN, coming-soon | `/create-ingredient` | roadmap rows | EN; passive rows | keep (roadmap surface) | pending |
| RV-06 | Product CSV import on a public route | `/products/import` | internal catalog intake | technical/EN internal tool on a routable path | hide-by-capability (owner diagnostics section) | pending |
| RV-07 | 404 mixed language | `*` | NotFoundPage | EN headline + PL link | keep + one-language pass | pending |
| RV-08 | Second drawer implementation (CustomerMenu) | `/`, `/start`, `/subscription`, `/profile/machine` | customer hamburger | duplicated nav implementation vs canonical AppNavDrawer | merge onto `appNav.ts` after P0 merge (Agent D seam) | pending |
| RV-09 | Legacy TopNav/MegaMenu/navConfig | unrouted | Phase 6C black shell | legacy Studio remnant in tree; `ImagePlaceholder` still imported by `/recipes` | remove-later (owner decision); extract ImagePlaceholder first | pending |
| RV-10 | Legacy AppMenu (left drawer) | unrouted | superseded menu | unused duplicate | remove-later (owner decision) | pending |
| RV-11 | ShellLayout + HomePage (black AI Home) | unrouted | legacy shell | kept code without a route | remove-later (owner decision) | pending |
| RV-12 | Pro → Monitor tab is a note | `/pro/monitor` | note pointing at Receptura | navigation to an explanation, not a function | relocate: tab opens the Monitor drawer on the live result | pending |
| RV-13 | Maszyna (per-recipe) vs Moja maszyna (default) | `/pro/machine` + `/profile/machine` | two machine surfaces | feels duplicated; roles differ but are unexplained | keep + one distinguishing sentence on each | pending |
| RV-14 | Double context line in Pro recipe view | `/pro/recipe` | workbar context + lab header summary | two context lines in one viewport | merge presentation post-P0 (lab header is near owned files) | pending |

## Batch Rescue / Stock Shortage (presentation follow-ups, no marker route yet)

The modules exist inside the engine lab (preset „Actual Batch Rescue”, optimization/branch
previews IF9/IF10). Their current presentation is technical-QA. Proposal (presentation only):
customer-facing contextual actions in the workbar `⋯` menu — **„Napraw gotową partię”** and
**„Mam tylko tyle składnika”** — opening the SAME existing flows. Recorded in
`PINGUINO_WIREFRAMES.md` §9; blocked tonight by Agent A ownership of constraint-studio surfaces.

## Where markers render today

- Floating overlay (all routes): collapsed `Do przeglądu (14)` pill, bottom-left — lists
  current-route items first, then the full registry with reasons + suggestions.
- Inline `ReviewBadge` placements: `/pro` Monitor & Maszyna tab panels (Phase 5 edit).
- Both render `null` for every non-owner session (tested).
