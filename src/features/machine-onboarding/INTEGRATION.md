# Machine Onboarding (Slice B) — integration contract

Slice B deliberately does **not** touch `CustomerShellV1.tsx`, `src/app/router.tsx`
or `customerShellCopy.ts` (a sibling slice owns them). This file specifies the exact
wiring the orchestrator applies. Everything below imports from
`@/features/machine-onboarding` (public barrel) unless stated otherwise.

## 1. Route additions (`src/app/router.tsx`)

```tsx
import { MachineProfilePage } from '@/pages/profile/MachineProfilePage';
// inside <Routes>:
<Route path="/profile/machine" element={<MachineProfilePage />} />
```

The page is already self-contained (light-native, `CustomerSurface` frame) and
currently wires ONLY the device-local store (see §4 — launch gate).

## 2. Home flow gate (§5.1 / §5.2)

**Where:** inside the Home persona flow of the customer shell, immediately after the
opening free-text step (`createCustomerFlow`) and **before** the first
`nextQuestion(flow)`-driven screen.

**First use (no saved machine)** — §5.1 `machine → auto-config → flavor → amount → recipe`:

```tsx
const store = selectMachinePreferenceStore({
  localDevice: () => localStorageMachinePreferenceStore(),
  // backend: () => supabaseMachinePreferenceStore(),   // ONLY after 0030 is applied — §4
}).store;
const preference = useMachinePreference(store);

// Home persona + preference.status === 'ready' + preference.record === null
//   → render <MachineOnboarding market="ES" onComplete={handleMachineChosen} />
//     INSTEAD of the six-mode serving step.
```

`MachineOnboarding` runs tiles → (disambiguation | behavior question → custom form |
honest unsupported state) → §8.5 auto-config transition, then calls back:

```ts
function handleMachineChosen({ record, derivation }: MachineOnboardingCompletion) {
  void preference.save(record);                          // §8.6 persist once
  update((s) => {
    // a) Mode: the saved machine ANSWERS the six-mode question — the step is SKIPPED.
    //    resolvedVisibleMode ∈ {'fresh','ninja_gelato','ninja_swirl'} is a strict
    //    subset of the EXISTING ServingModeId union, so it feeds selectServingMode
    //    directly (no new mode system):
    let next = selectServingMode(s, record.resolvedVisibleMode);
    // b) Batch: the machine's DERIVED grams pre-answer the amount question.
    //    ORDER MATTERS: selectServingMode clears a hand-set batch when a Ninja
    //    mode is involved, so set the batch AFTER selecting the mode.
    if (derivation.recommendedBatchGrams !== null) {
      next = setBatchGrams(next, derivation.recommendedBatchGrams);
    }
    return next;
  });
}
```

**Subsequent uses (saved machine)** — §5.2 `flavor → amount → recipe`:

```ts
// On flow creation for a Home user with preference.record !== null:
let flow = createCustomerFlow({ text });
flow = selectServingMode(flow, preference.record.resolvedVisibleMode); // six-mode step SKIPPED
const grams =
  preference.record.defaultBatch.kind === 'grams' ? preference.record.defaultBatch.grams : null;
if (grams !== null) flow = setBatchGrams(flow, grams);
```

`pendingQuestions()` then never emits `serving_mode` (mode ≠ null) and — when grams
were set — never emits `batch` (explicit batch wins in `resolveBatch`, source `'user'`).
The user may **lower** the batch on the same screen (§5.4); the split notice (§3 below)
handles requests above the limit.

**Change machine:** the §7.3 context bar's `Zmień` (and Profile → `Zmień maszynę`)
re-renders `MachineOnboarding`; on completion save the new record and re-apply (a) + (b).

### Batch semantics (OWNER FINAL DECISION, 2026-07-17 — supersedes the earlier
### "must ASK" tension note)

The recommendation is a SOFT starting proposal — never a hard limit, never a
block:

- a record WITH derived grams sets them explicitly (source `'user'`), taking
  PRECEDENCE over the mode-level 700/480 presets;
- a record WITHOUT grams falls back to the EDITABLE mode preset (no forced
  question, no hidden fork);
- diverging from the recommendation shows „Używasz własnej ilości" + restore;
  exceeding it shows ONLY the warning „Ta ilość przekracza zalecany wsad
  PINGÜINO dla jednego pojemnika." with three non-blocking actions (optional
  EVEN split / keep mine exactly / restore) — `deriveBatchGuidance` in
  `machine-onboarding/batchGuidance.ts`;
- a machine CHANGE never rewrites an in-progress amount: the new grams arrive
  as a PROPOSAL („Dopasuj ilość do nowej maszyny" → preview → Zastosuj), and
  `applyMachineRecordIfUnanswered` guarantees an answered flow passes through
  untouched (owner test 11).

## 3. Context bar (§7.3) + split notice

```tsx
const view = preference.record ? buildMachineContextView(preference.record) : null;
// view === null with a saved record ⇒ stale catalog id → re-run onboarding.
{view && <MachineContextBar view={view} onChange={openMachineChange} />}
```

- The bar renders ONLY `Twoja maszyna: <name> · pojemnik <vessel> ml [Zmień]` — no
  engine name, no technology code, no temperature (test-pinned).
- `view.recommendedBatchGrams` is CARRIED for the batch step (label it
  `machineOnboardingCopy.batch.recommendedLabel` = „Zalecany wsad PINGÜINO”; **never**
  as a manufacturer figure). It is also the per-container split limit:

```tsx
const notice = containerSplitNotice(requestedGrams, view.recommendedBatchGrams);
// notice ⇒ show notice.message (owner verbatim: „Ta ilość wymaga N pojemników.
// PINGÜINO podzieli recepturę automatycznie.”) + notice.detail („N pojemniki po X g”).
// The user may always prepare LESS; never auto-increase a single container.
```

## 4. Persistence + launch gate (§8.6, §23)

- Port: `MachinePreferenceStore` (`load/save/clear`), record:
  `MachinePreferenceRecord` (schemaVersion 1, catalog-or-custom selection, market,
  resolvedTechnology, resolvedVisibleMode, §9.1 capacity snapshot, honest
  `defaultBatch` = derived grams with provenance | none, setAt, catalogVersion).
- **Anon/demo today:** `localStorageMachinePreferenceStore()` (versioned key
  `pinguino.machine_preference.v1`, corrupt-data safe, typed write error).
- **Accounts:** `supabaseMachinePreferenceStore()` in
  `src/services/machinePreference/supabaseMachinePreference.ts` targets migration
  **`0030_user_machine_preference.sql` — COMMITTED, NOT APPLIED.** Do **not** wire the
  `backend` factory into `selectMachinePreferenceStore` until the owner applies 0030
  (staging `tunabqqrwabacxjcxxkz` first; never production `riwipywgqobrulyzrzad`).
  The unwired factory IS the launch gate (pro-core pattern); with only `localDevice`
  wired the selector honestly reports `mode: 'local_device', isAccountScoped: false`.
  There is NO in-memory fallback anywhere.
- Older accounts have no row ⇒ `load()` → null ⇒ onboarding shows on the next Home
  visit; nothing is assigned, nothing is deleted (§23.4).

## 5. Exported surface (import from `@/features/machine-onboarding`)

| Kind | Export |
|---|---|
| Flow component | `MachineOnboarding`, `MachineOnboardingCompletion` |
| Context bar | `MachineContextBar`, `buildMachineContextView`, `MachineContextView` |
| Profile | `MachineProfileSection`, `MachineSettingsSubmit`, `buildMachineSettingsView`, `MachineAdjustBatchStep`, `parseGramsInput`, `suggestRecommendedGramsForContainer` (+ page `@/pages/profile/MachineProfilePage`) |
| Store | `MachinePreferenceStore`, `MachinePreferenceRecord`, `SavedDefaultBatch`, `buildMachinePreferenceRecord`, `parseMachinePreferenceRecord`, `localStorageMachinePreferenceStore`, `useMachinePreference` |
| Views/copy | `machineOnboardingCopy`, `buildMachineTileViews`, `searchMachineTiles`, `presentBatchSuggestion`, `containerSplitNotice`, `autoConfigLines`, `machineDisplayName`, `formatGrams` |
| Selector (services) | `selectMachinePreferenceStore`, `chooseMachinePreferenceStoreMode` from `@/services/machinePreference/machinePreferenceSelector` |
| Domain (machine-catalog) | `recommendMachineBatch`, `planContainerSplit`, `HOME_CONTAINER_SAFETY_FACTOR`, `HOME_BATCH_RULE_VERSION`, `deriveMachineSetup`, `listActiveHomeMachines` |

## 6. Owner questions the orchestrator must surface

1. **NC302EU / NC502EU activation (CRITICAL PATH).** The 2026-07-17 investigation of
   the live official ES pages was INCONCLUSIVE (no page distinguishes 473-vs-450 /
   706-vs-680 as different concepts; no MAX FILL wording exists on the ES retail
   pages). Under the owner correction a conflicted figure derives NO grams, so both
   families stay `conflicting_sources` + inactive (tiles visible, disabled, honest
   note). Candidate derivations for the owner: standard **473→450 g** vs
   **450→430 g**; Deluxe **706→670 g** vs **680→650 g** (evidence quoted in
   `machineCatalogData.ts`).
2. **NC7 Swirl 460 g (machine path) vs 480 g (six-mode preset).** Same machine, two
   paths, two numbers until the owner aligns them (`servingMode.ts` untouched).
3. **§24 analytics events** (`home_machine_onboarding_started`, `home_machine_selected`,
   `custom_machine_started/completed`, `machine_profile_saved/changed`) — no analytics
   layer exists in the repo; wire callbacks at the mount points in §2 when one lands.
