# PINGÜINO Pro — Apple 2.0 completion matrix

Date: 2026-08-11  
Base: `origin/staging` at `88920e9eecb880ded4b4ee20d391db851c645114`  
Scope: Pro Workbench presentation and the existing percent/gram lock interaction. Home, Production science, Base Engine, Mapper data and template seeds are outside this change.

## Status vocabulary

- **WORKING** — connected to the canonical draft and covered by a functional regression.
- **WORKING · PROFILE-LIMITED** — operational only in cells with approved product/temperature data; unsupported cells fail closed.
- **PARTIAL** — a real safe path exists, but an explicit data, legal or workflow limitation remains visible.
- **BLOCKED BY SCIENCE / DATA** — the UI must not pretend to calculate an unsupported sensory or regulatory result.
- **DEFERRED** — intentionally unavailable in the current physical-production contract and visibly marked.

## Canonical Pro information architecture

| Area | Final state | Evidence |
|---|---|---|
| Left recipe editor | **WORKING** | One canonical ingredient editor, exact grams, percent share, price and row menu remain together. |
| Right workbench | **WORKING** | One warm-neutral intelligence surface with Profile, Monitor, Production and Summary tabs. |
| Top recalculation | **WORKING** | Existing `Przelicz z PI` still stages the normal verified Preview; no second Apply route. |
| Top score | **WORKING** | Explicitly named `Dopasowanie techniczne receptury`. |
| Production score | **WORKING** | Explicitly named `Przewidywane dopasowanie partii`; it is not presented as the same concept as the recipe score. |
| Bottom workbar | **WORKING** | Recipe name, Save and Undo ownership remain unchanged. |
| Desktop page scroll | **WORKING** | Workbench remains viewport-locked; editor and right workbench own their internal scroll surfaces. |
| Mobile cockpit | **WORKING** | The existing modal bottom sheet is retained; 360/390/430 layouts use responsive grids without horizontal page overflow. |

## Visual-system contract

| Token / surface | Use | Status |
|---|---|---|
| Paper white | Ingredient editor and direct data-entry controls | **CANONICAL** |
| Warm neutral | Intelligence/workbench background | **CANONICAL** |
| Graphite | Decisive score cards, Preview and primary actions only | **CANONICAL** |
| Ivory / muted gold | Optimum target, selected percentage lock and target markers | **CANONICAL** |
| Sage | Confirmed/safe state | **CANONICAL** |
| Amber / terracotta | Attention and hard problem state | **CANONICAL** |
| Pink | Only research, review, not-production-ready or calibration blockers | **CANONICAL** |
| Radius / elevation | Shared 12–16 px modules, one hairline and restrained diffuse shadow | **CANONICAL** |
| Focus / motion | Shared visible gold focus treatment and reduced-motion fallback | **CANONICAL** |

## Functional matrix

| Capability | Final status | What is true now | Honest limitation / blocker |
|---|---|---|---|
| Sweetness Direction | **WORKING · PROFILE-LIMITED** | Supported cells use approved POD-side preference bands through normal Preview → Apply → Undo. Direction shows separate `Teraz`, `Cel` and staged `Preview` semantics. | Unsupported profile/temperature cells stay blocked; native hard bands remain superior. |
| Softness Direction | **WORKING · PROFILE-LIMITED** | Supported Standard Gelato cells use the approved NPAC preference path and normal verified Apply. | No unsupported profile is inferred from a display range or milk fallback. |
| Creaminess Direction | **BLOCKED BY SCIENCE** | Visible with pink `WYMAGA KALIBRACJI`; no movement is claimed. | Fat percentage is not relabelled as sensory creaminess. |
| Flavour intensity Direction | **BLOCKED BY DATA / SCIENCE** | Visible with pink `BRAK DANYCH`; no fabricated dose-to-perception solve. | Ingredient-class potency profiles remain absent. |
| Exact gram lock | **WORKING** | Exact Float64 grams are preserved and rechecked by Apply. Active state is an explicit graphite `g` control plus a `Gramy · …` state chip. | Main/Required/physical constraints keep their stronger contract. |
| Percent lock | **WORKING** | Exact final-batch share is canonical, scales with batch, persists, and is trustlessly rechecked. Active state is an ivory/gold `%` control plus a `% partii · …` state chip. | None for supported recipe lines. |
| `% ↔ g` mutual exclusivity | **WORKING** | One click replaces the other constraint atomically; no intermediate unlocked click is required. | Poured physical material remains immutable. |
| Range constraint | **WORKING** | Existing min/max contract and Apply validation remain; the ingredient row names the range state. | Range authoring remains in its established menu/constraint flow. |
| Main / Multi-Main | **WORKING** | Stable canonical identities and 1:1, 2:1 and 1:1:1 ratio contracts remain enforced. | Automatic intensity changes are still blocked without potency science. |
| Required ingredient | **WORKING** | Required identity cannot silently disappear; persisted Engine lock is visible after reopen. | No weakening was introduced by this visual pass. |
| Unavailable ingredient | **WORKING** | Explicit unavailable state and verified recipe substitute route remain. | Mid-production substitution remains deferred. |
| Recipe substitution | **WORKING** | Verified, role/profile/allergen-compatible candidate → Preview → Apply with trustless identity recheck. | Template-controlled stabilizers cannot use generic same-role substitution. |
| Canonical identity / dedup | **WORKING** | Preview and Apply retain the canonical duplicate gate. | None. |
| Preview → Apply → Undo | **WORKING** | One staged proposal, explicit Apply/Cancel, trustless commit and exact Undo. Preview hierarchy is now result-first without removing evidence. | Diagnostic-only or unsafe candidates remain non-applicable. |
| Save / reload / versions | **WORKING** | Canonical recipe input and supported constraint sidecars remain the durable source. | Session-only consent is intentionally not persisted. |
| OPTIMAL | **WORKING** | Technical candidate remains price-independent. | None introduced here. |
| ECO | **WORKING · POLICY-LIMITED** | Cost ranking remains below hard technology, canonical identity and flavour/Main protection. | Unknown flavour floors fail closed instead of inventing a cheaper dose. |
| Vegan | **WORKING · PROFILE-LIMITED** | Verified vegan ingredient gates and approved Mapper candidates remain. | Direction cells without verified profile calibration remain blocked. |
| Protein Gelato | **WORKING** | Product target/frontier stays separate from flavour-family semantics and is rechecked at Apply. | Protein is a product type/filter, not flavour intensity. |
| Technical Monitor | **WORKING** | Every historical module/value remains. Neutral tracks use graphite for the current value, a thin gold optimum marker and a gold Preview marker whenever a proposal is staged; proprietary exact ranges are still protected. | Unbanded metrics remain visibly unassessed instead of receiving a fake position. |
| Process Guide | **WORKING** | Normal Monitor entry remains directly before owner diagnostics and opens the existing fail-closed guide with exact canonical process evidence. | Missing/error evidence remains UNKNOWN, never cold-approved. |
| Production / Batch Rescue | **WORKING** | Physical add-only, forecast and verified rescue logic are unchanged. Confirmed physical mass remains authoritative. | Mid-run substitution/process automation/toppings remain pink and deferred. |
| Master Label | **PARTIAL / SAFETY-GATED** | Frozen actual production snapshot remains authoritative. | System print still requires verified allergen, shelf-life and regulatory market data. |
| Summary | **WORKING** | Ingredient list, nutrition and cost presentation are fully Polish in the Polish Pro surface. | Regulatory/claim modules remain honestly pink where incomplete. |
| Lost & Legendary | **OWNER REVIEW ONLY** | Public customer mode still hides unpublished candidates; owner review remains pink. | Seven-stage publication gate is unchanged. |

## Marker semantics

| Marker | Meaning |
|---|---|
| Graphite dot/line | Current calculated state (`Teraz`). |
| Thin muted-gold line | Selected target or approved golden middle (`Cel`). |
| Gold outlined ring | Staged result from the current Preview; absent when no Preview exists. |
| Amber / terracotta status | Attention or a value outside the accepted native safety band; the current-value marker itself remains graphite. |
| Pink badge | Not production-ready, research, missing data or missing calibration — never a quality grade. |

## QA evidence

### BEFORE

`reports/qa/pro-apple2-before/` contains desktop 1440×900 and mobile 390×844 evidence for Profile, Monitor, Direction, locks, Preview, Production, Summary, Process Guide and menu.

### AFTER

Final local and served screenshots are recorded under `reports/qa/pro-apple2-after/` and the served deployment directory after staging verification.

## Gate ledger

### Pre-deployment verification

- Focused lock / persistence / Apply gate: **8 files / 132 tests passed**.
- Independent functional reviewer gate: **8 files / 150 tests passed**.
- Full repository suite: **444 files / 5849 tests passed**.
- TypeScript: `npm run typecheck` — **passed**.
- Lint: `npm run lint` — **0 errors**; two unchanged Fast Refresh warnings.
- Production build: `npm run build` — **passed**; local assets `index-B-9FmNge.css` and `index-DKu7fsGV.js`.
- Recipe catalogue: `npm run recipes:validate` — **2500 / 2500**.
- Process metadata: `npm run process:validate` — **2088 / 2088**, exact source hash `c185d08ef89229001ffc56eceda0dbe55442e9abe0327d2b27742e40d8dbc9f4`.
- Dependency audit: `npm audit` — **0 vulnerabilities**.
- Patch integrity: `git diff --check` — **passed**.
- Latest integration base re-fetched immediately before commit: `origin/staging` = `88920e9eecb880ded4b4ee20d391db851c645114`; no merge or rebase conflict.

### Independent review verdicts

- Product / visual design: **DEPLOY** — P0 0, P1 0, P2 0.
- Accessibility and responsive interaction: **DEPLOY** — P0 0, P1 0, P2 0.
- Functional locks, Preview, Apply, persistence and trust boundaries: **DEPLOY** — P0 0, P1 0, P2 0.

The exact staging commit, served Vercel deployment, served bundle and final served-browser screenshot inventory are reported in the owner handoff after the immutable staging deployment is verified.
