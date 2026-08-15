# Served staging self-audit — New Recipe and retained audit matrix

Audit date: 2026-08-15
Starting staging SHA: `7de5bcac28e7e8d7cf292dab98ba95df6091c87e`
Target: `https://staging.pinguinoai.com` only
Production: explicitly excluded and unchanged

## Evidence boundary

The supplied directory `C:\Users\Absconsio\.codex\attachments\c85422bc-6914-4a80-a290-37387f208e55` contains only `pasted-text.txt`. It does not contain the QA audit referred to by that prompt, its exact test IDs, exact Owner ingredient vectors, screenshots, or the SmartGelato fixture. A recursive text search of the available attachment store found no second audit artifact. Those exact cases cannot be reconstructed or silently replaced with easier fixtures.

The authenticated served application was nevertheless inspected before implementation. On the starting SHA the Pro recipe editor had no button with accessible name `Nowa receptura`; the existing 1000 g draft rendered and the Console had no errors or warnings. This is the one served failure independently reproduced from the evidence that was actually available.

## Confirmed failures and repairs

| ID | Before | Reproduced | Root cause | Repair | Pre-deploy result | Final served result |
|---|---|---|---|---|---|---|
| NR-01 | Permanent `+ Nowa receptura` missing from bottom bar | Served FAIL | Pro workbar had save/status actions but no explicit new-draft action | Added permanent design-system action directly before status | Focused PASS; pixel bounds 64/64 | Pending staging deploy |
| NR-02 | Explicit new draft had no canonical product starter contract | Code/test FAIL | Existing `resetToDemo` path was a Gelato demo reset, not product-aware New Recipe orchestration | Added one canonical starter builder over the accepted template/toolbox registry | Gelato/Sorbet/Vegan/Protein focused PASS | Pending staging deploy |
| NR-03 | Recipe-specific sidecars could survive an ad-hoc reset | Test-first FAIL | No single orchestration cleared recipe link, constraints, Preview/Undo, Production, label and temporary ingredient UI | New orchestration bumps the draft context and clears the linked sidecars; existing context subscription clears constraint session | Focused PASS | Pending staging deploy |
| NR-04 | Switching an untouched starter could retain the wrong profile; switching an edited starter had no guarded replacement | Test-first FAIL | Product selector called the generic profile setter directly | Untouched starter is atomically replaced; edited starter uses the compact `Przebuduj` confirmation | Focused PASS | Pending staging deploy |
| NR-05 | Recipes Hub Pro action could destroy an unsaved draft without confirmation | Independent review FAIL | Hub called `startNewProRecipe()` directly | Hub now uses the same unsaved-state guard and shared confirmation dialog | Interactive regression PASS | Pending staging deploy |
| NR-06 | Confirmation dialog did not own keyboard focus | Independent review FAIL | No initial focus, focus trap or reliable bubbled Escape handler | Added least-destructive initial focus, Tab loop, Escape and focus restore | Interactive regression PASS | Pending staging deploy |
| NR-07 | Name edit could leave `dirty=true` after returning to the stored name | Independent review FAIL | Name input directly mutated global dirty state | Name delta remains local and is passed explicitly to the new-draft guard | Focused PASS | Pending staging deploy |
| NR-08 | Opened saved/history/library recipes risked receiving a starter on profile change | Test-first protection | Starter identity was not an explicit state discriminator | Starter template ID exists only for explicit New Recipe; saved/history load clears it | Focused PASS | Pending staging deploy |

## New Recipe proof matrix

| Product type | Starter ingredients | Canonical IDs | Source template | Result |
|---|---|---|---|---|
| Gelato | Milk 600 g; Cream 135 g; SMP 43 g; Sucrose 86 g; Dextrose 80 g; Inulin 54.1 g; Tara gum 1.9 g | `PI-ING-000236`, `PI-ING-000180`, `PI-ING-000270`, `PI-ING-000514`, `PI-ING-000494`, `PI-ING-000456`, `PI-ING-000492` | `milk_base_g17_minus12_v1` | 1000 g neutral dairy scaffold; no invented Main |
| Sorbet | Water 164.2 g; Sucrose 90 g; Dextrose 90 g; Inulin 55 g; Tara gum 0.8 g | `PI-ING-001409`, `PI-ING-000514`, `PI-ING-000494`, `PI-ING-000456`, `PI-ING-000492` | `S02` | 400 g technological scaffold; zero dairy; fruit/Main deliberately absent |
| Vegan | Water 397.4 g; Oat drink 250 g; Refined coconut oil 52.5 g; Sucrose 145 g; Dextrose 100 g; Inulin 53.1 g; Tara gum 2 g | `PI-ING-001409`, `PI-ING-001565`, `PI-ING-000163`, `PI-ING-000514`, `PI-ING-000494`, `PI-ING-000456`, `PI-ING-000492` | `vegan_neutral_minus12_final` | 1000 g; zero dairy; no invented Main |
| Protein | Milk 460 g; Cream 100 g; Protein Gel WPC 230 g; Water 92 g; Sucrose 30 g; Dextrose 86 g; Tara gum 2 g | `PI-ING-000236`, `PI-ING-000180`, `PI-ING-000264`, `PI-ING-001409`, `PI-ING-000514`, `PI-ING-000494`, `PI-ING-000492` | `protein_dairy_neutral_minus12_v1` | 1000 g; Protein Contributor remains separate; no invented Main |

Values are the unchanged accepted registry values at the default −12°C / 1000 g settings. The Sorbet template contains a 600 g fruit role without an approved toolbox identity; it is intentionally omitted instead of fabricated.

## Complete available audit matrix

The following table retains every category named in the supplied prompt. `BLOCKED BY EXTERNAL DATA` means the required exact audit row/fixture is absent from the attachment, not that the application failed.

| Test | Before | Reproduced | Root cause / evidence | Repair | Final served result |
|---|---|---|---|---|---|
| Session and reload | Prior accepted baseline | NOT REPRODUCED | Exact attached case absent | No speculative change | Pending / exact fixture blocked |
| Picker | Prior accepted baseline | Representative local pixel and regression PASS | Unrelated to confirmed defect | Preserved | Pending served smoke |
| Product search | Prior accepted baseline | NOT REPRODUCED with Owner terms | Exact audit queries absent | No search change | Exact fixture blocked |
| Global scope | Prior accepted baseline | NOT REPRODUCED | Exact audit setup absent | No search/RLS change | Exact fixture blocked |
| Configured market | Unknown | BLOCKED BY EXTERNAL DATA | Market/account fixture absent | None | Blocked by missing fixture |
| Baseline OPTIMAL | Prior accepted baseline | Related full suite PASS | Solver unchanged | None | Pending served smoke |
| SmartGelato reconstruction | Unknown | BLOCKED BY EXTERNAL DATA | Exact vector absent | None | Blocked by missing fixture |
| Zero-gram flavour | Unknown | BLOCKED BY EXTERNAL DATA | Exact row absent | None | Blocked by missing fixture |
| OPTIMAL and ECO | Prior accepted baseline | Related full suite PASS | No solver/price change | None | Pending served smoke |
| Direction controls | Prior accepted baseline | Related full suite and pixel PASS | No direction-control change | None | Pending served smoke |
| Quantity boundaries | Prior accepted baseline | Related full suite PASS | Precision policy unchanged | None | Pending served smoke |
| Alcohol boundaries | Prior accepted baseline | Related full suite PASS | Alcohol science unchanged | None | Pending served smoke |
| Duplicate product | Prior accepted baseline | Related full suite PASS | Catalog unchanged | None | Pending served smoke |
| Main | Prior accepted baseline | Related full suite PASS | Main policy unchanged | None | Pending served smoke |
| Multi-Main | Prior accepted baseline | Related full suite PASS | Ratio/identity/Apply unchanged | None | Pending served smoke |
| New Recipe action | Served FAIL | REPRODUCED FAIL | Missing UI and orchestration | NR-01–NR-08 | Pending deploy |
| Reset and persistence | No explicit contract | Test-first FAIL | Ad-hoc reset was incomplete/product-agnostic | Single explicit new-draft transition | Pending deploy |

## Quality and deployment ledger

The exact final commit, staging deployment, served bundle names, post-deploy results, screenshots and Git status are reported in the final handoff after the deployment exists. No migration, RLS, secret, environment, production, billing, or `mapper_basement` change belongs to this candidate.
