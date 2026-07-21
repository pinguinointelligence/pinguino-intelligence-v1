/**
 * PINGÜINO Pro — professional machine + serving-mode selector (S4).
 *
 * Connects the EXISTING approved serving modes + Home machine registry to the Pro workflow. It
 * creates no new Engine, target bands or routing math: it only routes to an existing supported cell
 * via `temperatureForMode` and derives the Home batch via the existing `deriveMachineSetup` (×0.95 rule).
 *
 *   1. Maszyna profesjonalna — FIRST + high-contrast (black card) → Świeże / −11 / −12 / −13 only.
 *   2. Maszyny domowe — the real active registry records; auto-route + auto-batch; optional
 *      „Ustaw również jako domyślną" persists a user-scoped preference (buildMachinePreferenceRecord).
 *   3. Inne urządzenia — real registry records not offered for Home (honest verification note).
 *
 * The selection lives in recipeStore (per-recipe; reset on account switch → cross-account isolation).
 */
import { useMemo, useState } from 'react';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { useRecipeStore } from '@/stores/recipeStore';
import { useAuthStore } from '@/stores/authStore';
import { temperatureForMode } from '@/features/customer-flow/servingMode';
import {
  MACHINE_CATALOG,
  MACHINE_CATALOG_VERSION,
  deriveMachineSetup,
  listActiveHomeMachines,
  type HomeMachineProfile,
} from '@/features/machine-catalog';
import { machineDisplayName } from '@/features/machine-onboarding/machineViews';
import { buildMachinePreferenceRecord } from '@/features/machine-onboarding/preferenceContracts';
import {
  localStorageMachinePreferenceStore,
  userScopedMachineKey,
} from '@/features/machine-onboarding/localStorageMachinePreferenceStore';
import { useMachinePreference } from '@/features/machine-onboarding/useMachinePreference';

const m = copy.proMachine;

/** The professional serving modes, in display order — EXACTLY the four the owner approved. */
const PRO_SERVING: readonly { id: string; label: string }[] = [
  { id: 'fresh', label: m.serving.fresh },
  { id: 'temp_minus_11', label: m.serving.minus11 },
  { id: 'temp_minus_12', label: m.serving.minus12 },
  { id: 'temp_minus_13', label: m.serving.minus13 },
];

export function ProMachineSelector() {
  const machineKind = useRecipeStore((s) => s.machineKind);
  const servingModeId = useRecipeStore((s) => s.servingModeId);
  const machineId = useRecipeStore((s) => s.machineId);
  const batchGrams = useRecipeStore((s) => s.target_batch_grams);
  const setMachineSelection = useRecipeStore((s) => s.setMachineSelection);
  const setBatchGrams = useRecipeStore((s) => s.setBatchGrams);

  const authUserId = useAuthStore((s) => s.user?.id ?? null);
  const prefStore = useMemo(
    () => localStorageMachinePreferenceStore(undefined, userScopedMachineKey(authUserId)),
    [authUserId],
  );
  const preference = useMachinePreference(prefStore);

  const [setAsDefault, setSetAsDefault] = useState(false);
  const [savedDefault, setSavedDefault] = useState(false);

  const activeHome = useMemo(() => listActiveHomeMachines(MACHINE_CATALOG), []);
  const otherDevices = useMemo(
    () => MACHINE_CATALOG.filter((p) => !activeHome.includes(p)),
    [activeHome],
  );

  const selectProfessional = (modeId: string) => {
    const temp = temperatureForMode(modeId);
    if (temp == null) return;
    setSavedDefault(false);
    setMachineSelection({
      kind: 'professional',
      servingModeId: modeId,
      machineId: null,
      label: m.professionalLabel,
      temperatureC: temp,
    });
  };

  const selectHome = (profile: HomeMachineProfile) => {
    const d = deriveMachineSetup(profile);
    if (d.resolvedVisibleMode == null) return;
    const temp = temperatureForMode(d.resolvedVisibleMode);
    if (temp == null) return;
    setSavedDefault(false);
    setMachineSelection({
      kind: 'home',
      servingModeId: d.resolvedVisibleMode,
      machineId: profile.id,
      label: machineDisplayName(profile),
      temperatureC: temp,
      batchGrams: d.recommendedBatchGrams,
    });
    if (setAsDefault) {
      const record = buildMachinePreferenceRecord({
        profile,
        isCustom: false,
        setAt: new Date().toISOString(),
        catalogVersion: MACHINE_CATALOG_VERSION,
      });
      if (record) {
        void preference.save(record);
        setSavedDefault(true);
      }
    }
  };

  const isPro = machineKind === 'professional';

  return (
    <div className="space-y-8" data-testid="pro-machine-selector">
      <div>
        <h2 className="text-sm font-medium tracking-label text-ink uppercase">{m.heading}</h2>
        <p className="mt-1 text-xs text-stone-500">{m.intro}</p>
      </div>

      {/* 1 — Maszyna profesjonalna (first, high-contrast black card) */}
      <section
        data-testid="pro-machine-professional"
        className={cn(
          'rounded-xl border p-5 text-paper',
          isPro ? 'border-ink bg-ink ring-2 ring-ink/30' : 'border-ink bg-ink',
        )}
      >
        <h3 className="text-lg font-medium">{m.professional.title}</h3>
        <p className="mt-1 max-w-xl text-sm text-paper/70">{m.professional.body}</p>

        <p className="mt-4 text-[0.65rem] font-medium tracking-label text-paper/60 uppercase">
          {m.professional.chooseServing}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {PRO_SERVING.map((s) => {
            const active = isPro && servingModeId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => selectProfessional(s.id)}
                aria-pressed={active}
                data-testid={`pro-serving-${s.id}`}
                className={cn(
                  'min-h-11 rounded-lg border px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-paper/50',
                  active
                    ? 'border-paper bg-paper text-ink'
                    : 'border-paper/30 text-paper hover:border-paper/60',
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* 2 — Maszyny domowe (below, reuse the registry + approved auto-routing) */}
      <section>
        <h3 className="text-xs font-medium tracking-label text-stone-400 uppercase">{m.home.heading}</h3>
        <label className="mt-2 flex items-center gap-2 text-xs text-stone-600">
          <input
            type="checkbox"
            checked={setAsDefault}
            onChange={(e) => setSetAsDefault(e.target.checked)}
            data-testid="pro-machine-set-default"
            className="h-4 w-4 rounded border-ink/30"
          />
          {m.home.setDefault}
        </label>

        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {activeHome.map((profile) => {
            const d = deriveMachineSetup(profile);
            const active = machineKind === 'home' && machineId === profile.id;
            const batchNote =
              d.recommendedBatchGrams != null ? m.home.recommended(d.recommendedBatchGrams) : m.home.userSetsBatch;
            return (
              <li key={profile.id}>
                <button
                  type="button"
                  onClick={() => selectHome(profile)}
                  aria-pressed={active}
                  data-testid={`pro-machine-home-${profile.id}`}
                  className={cn(
                    'flex w-full flex-col items-start rounded-lg border px-4 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40',
                    active ? 'border-ink bg-ink/5' : 'border-ink/15 hover:border-ink/40',
                  )}
                >
                  <span className="text-sm font-medium text-ink">{machineDisplayName(profile)}</span>
                  <span className="mt-0.5 text-xs text-stone-500">{batchNote}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {savedDefault ? (
          <p className="mt-2 text-xs text-emerald-700" data-testid="pro-machine-default-saved">{m.home.savedDefault}</p>
        ) : null}
      </section>

      {/* 3 — Inne urządzenia (real registry records only; honest verification note) */}
      {otherDevices.length > 0 ? (
        <section data-testid="pro-machine-other">
          <h3 className="text-xs font-medium tracking-label text-stone-400 uppercase">{m.other.heading}</h3>
          <ul className="mt-3 space-y-2">
            {otherDevices.map((profile) => (
              <li
                key={profile.id}
                className="flex flex-col rounded-lg border border-ink/10 bg-stone-50 px-4 py-3"
              >
                <span className="text-sm text-stone-600">{machineDisplayName(profile)}</span>
                <span className="mt-0.5 text-xs text-stone-400">{m.other.needsReview}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Batch entry — after a selection (editable; never a hard limit) */}
      {machineKind !== null ? (
        <section>
          <label className="block max-w-xs">
            <span className="text-xs tracking-label text-stone-500 uppercase">{m.batch.label}</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={batchGrams}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n > 0) setBatchGrams(Math.round(n));
                }}
                data-testid="pro-machine-batch"
                className="w-32 rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:border-ink/40 focus:outline-none"
              />
              <span className="text-sm text-stone-500">{m.batch.unit}</span>
            </div>
          </label>
        </section>
      ) : null}
    </div>
  );
}
