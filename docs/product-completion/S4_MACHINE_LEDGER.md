# S4 — PROFESSIONAL MACHINE AND SERVING-MODE WORKFLOW — completion ledger

**Status:** `S4 PROFESSIONAL MACHINE AND SERVING MODES — DEPLOYED, AWAITING OWNER VERIFICATION`
**Date:** 2026-07-22 · **Scope:** the machine/serving selection only (recalculation is the NEXT slice, not this one).

## What S4 delivers

A machine-first selection surface on `/pro?tab=machine` (the **Maszyna** tab), applied to the
**current recipe**, with the owner hierarchy and **zero Engine change**.

### 1. Maszyna profesjonalna — FIRST, visually strongest
- A high-contrast black card (`bg-ink` / `text-paper`) rendered before everything else.
- Copy: **„Maszyna profesjonalna"** / **„Pełna kontrola temperatury serwowania, partii i parametrów receptury."**
- Opens **EXACTLY** four serving modes — **Świeże · −11°C · −12°C · −13°C** — and nothing else
  (no −14 / −18 / Witryna / Własne / Ninja Gelato / Ninja Swirl in this selector).
- Routing reuses the existing `temperatureForMode`: **Świeże→−11 · −11→−11 · −12→−12 · −13→−13**.
  No new Engine, no new temperature cell — the visible mode maps to an existing supported cell.
- Batch entry appears after selection (editable, never a hard limit).

### 2. Maszyny domowe — below, reusing the approved registry
- Lists the **real active** `MACHINE_CATALOG` records via `listActiveHomeMachines` (9 machines).
- Auto-routes via the existing `deriveMachineSetup` (`resolvedVisibleMode` → `temperatureForMode`)
  and auto-batches via the existing derived `recommendedBatchGrams` (the ×0.95 Home rule — NOT
  modified here). Honest „Wsad ustalasz samodzielnie." when no rule fired (bowl-only / program
  volumes), a positive „Zalecany wsad: N g" when it did (450 / 670 / 460 / 1330 g).
- No professional serving selector under Home (all four serving buttons belong to the pro card).
- Optional **„Ustaw również jako domyślną"** persists a **user-scoped** device preference
  (`buildMachinePreferenceRecord` → `localStorageMachinePreferenceStore(userScopedMachineKey(userId))`),
  Home-only. Selection otherwise applies to the current recipe only.

### 3. Inne urządzenia — real records only
- Shows only the real **inactive** registry records (today: Sage / Breville Smart Scoop, `needs_review`),
  with the honest „W trakcie weryfikacji pojemności — brak zalecanego wsadu." note. No invented
  capacity, batch or routing.

## Workbar context (machine-aware)
`ProWorkbar` now reflects the selection:
- **Professional:** `Maszyna profesjonalna · Świeże · 1000 g` / `Maszyna profesjonalna · −12°C · 1000 g`
  (the visible serving temperature is shown).
- **Home:** `Ninja CREAMi · 450 g` — machine + batch **only**, no false professional temperature.
- **No selection:** the recipe's `Produkt · Tier · −N °C · N g` context is unchanged (regression-safe).

## State isolation (cross-account)
The selection lives in `recipeStore` (`machineKind` / `servingModeId` / `machineId` / `machineLabel`,
persisted with the recipe). It is cleared on the account boundary by the existing
`clearAccountScopedClientState` → `resetToDemo` reset (proven by test), so a Pro session never
inherits a previous account's machine.

## Engine integrity (unchanged — verified)
No change to the Base Engine, `TARGET_BANDS`, ice anchors, PAC/POD, Mapper values, the optimizer/
solver, or `CONFIG_VERSION`. The selector only sets `target_temperature_c` to an existing supported
cell and `target_batch_grams`. A source-scan test asserts the component references none of the
protected constants and no non-approved serving mode.

## Files
- `src/features/pro-core/ProMachineSelector.tsx` (NEW) — the selector.
- `src/stores/recipeStore.ts` — `machineKind`/`servingModeId`/`machineId`/`machineLabel` fields +
  `setMachineSelection` (persisted; reset on account switch).
- `src/features/pro-core/ProWorkbar.tsx` — machine-aware context line.
- `src/pages/pro/ProWorkspacePage.tsx` — `MachineTab` renders the selector (settings link retained).
- `src/copy/en.ts` — `copy.proMachine` PL block.
- Tests: `ProMachineSelector.test.tsx` (12), `recipeStore.machineSelection.test.ts` (6),
  `ProWorkbar.test.tsx` (+3 machine-context) — **21 S4 tests**.

## Gate (all green)
- `npm run build` (tsc -b && vite build) ✓
- `npx vitest run` — **4545 passed / 337 files** ✓
- `npx eslint .` — 0 errors (1 pre-existing unrelated warning) ✓
- `npx tsc -b` ✓

## NOT in this slice (kept honest)
- **Recalculation** (`Przelicz z PI → Preview → Zastosuj → Cofnij`) — the explicit NEXT slice; do
  not start until the owner confirms S4.
- A saved professional machine **profile** beyond label/serving/batch (optional per spec; not mandatory).
- The other unfinished `/pro` tabs (Monitor/Produkcja/Historia/Koszty/Eksporty) keep their own honest
  statuses — S4 does not promote them.

## Owner verification checklist (staging)
1. `/pro?tab=machine` as Pro → Maszyna profesjonalna is first + black; the four modes are exactly
   Świeże/−11/−12/−13.
2. Pick −12°C → workbar context reads `Maszyna profesjonalna · −12°C · … g`.
3. Pick a Home machine (e.g. Ninja CREAMi) → context reads `Ninja CREAMi · 450 g` (no temperature).
4. „Ustaw również jako domyślną" + a Home pick → „Zapisano jako domyślną maszynę."
5. Inne urządzenia shows only the real inactive record with the verification note.
