import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import {
  DEFAULT_DIRECTION_INTENTS,
  useRecipeProfileStore,
  type ProfileSettingsSnapshot,
} from './recipeProfileStore';
import { profileSnapshotFromState } from './recipeProfilePersistence';
import { listUserRecipeDefaults, upsertUserRecipeDefault } from '@/services/userRecipeDefaults';
import { VISIBLE_PRODUCT_TYPES, type VisibleProductType } from '@/features/studio/productType';
import { temperatureForMode } from '@/features/customer-flow/servingMode';
import {
  FORMULATION_STRATEGIES,
  type FormulationStrategy,
} from '@/features/formulation-strategy/strategy';
import { copy } from '@/copy/en';
import { productionAreaCopy } from '@/copy/productionArea';
import { commitRecipeDefaultsAfterRemoteSave } from './accountRecipeDefaultsSave';
import { professionalAccountDefaultSnapshot } from './professionalAccountAuthority';

const servings = [
  ['fresh', 'Świeże'],
  ['temp_minus_11', '−11°C'],
  ['temp_minus_12', '−12°C'],
  ['temp_minus_13', '−13°C'],
] as const;

const productKey = (owner: string, product: VisibleProductType) => `${owner}:${product}`;

const cloneSettings = (settings: ProfileSettingsSnapshot): ProfileSettingsSnapshot => ({
  ...settings,
  directionTargets: { ...settings.directionTargets },
  directionIntents: settings.directionIntents ? { ...settings.directionIntents } : undefined,
});

const directionIntentLabel = (value: number): string => {
  if (value === 0) return 'Środek';
  return `${value < 0 ? 'Mniej' : 'Więcej'} · ${Math.abs(value)}/2`;
};

const areaCopy = productionAreaCopy();

/**
 * Produkcja v3 §3 — the machine and the default batch have ONE place: Produkcja → Maszyna.
 * This card no longer edits them, and a save here must never change them either:
 *
 *   - WITH an account row for the product, its machine fields travel back 1:1 (the draft is
 *     the row, and nothing here patches them);
 *   - WITHOUT a row, the draft used to be a snapshot of the OPEN recipe — so saving a
 *     serving mode silently made that recipe's machine (e.g. a Ninja) the account default.
 *     A new row now carries the Professional fields of the canonical authority instead,
 *     which is exactly what `startNewRecipe` already resolves when there is no row (it takes
 *     a batch from these settings only for a Home machine). The saved machine from
 *     Produkcja → Maszyna still wins over the row (GEL-P0-022, `mergeMachineAccountDefault`).
 */
const MACHINE_FIELDS = [
  'machineKind',
  'machineId',
  'machineLabel',
  'machineTechnology',
  'homeFormulationModuleId',
  'machineCapacityGrams',
  'targetBatchGrams',
  'batchSource',
] as const;

const withoutRowMachineFields = (
  settings: ProfileSettingsSnapshot,
  product: VisibleProductType,
): ProfileSettingsSnapshot => {
  const professional = professionalAccountDefaultSnapshot(product);
  const next: ProfileSettingsSnapshot = { ...settings };
  for (const field of MACHINE_FIELDS) {
    (next as unknown as Record<string, unknown>)[field] = professional[field];
  }
  return next;
};

/** The stored account row for this product — the RAW row, never merged with the machine. */
const storedRowFor = (owner: string, product: VisibleProductType) =>
  useRecipeProfileStore.getState().defaultsByOwner[productKey(owner, product)] ?? null;

export function AccountRecipeDefaults() {
  const recipe = useRecipeStore();
  const authenticatedOwner = useAuthStore((state) => state.user?.id ?? null);
  const owner = authenticatedOwner ?? (import.meta.env.DEV ? 'local-device' : null);
  const saveLocal = useRecipeProfileStore((state) => state.saveDefaults);
  const replaceDefaultsForOwner = useRecipeProfileStore((state) => state.replaceDefaultsForOwner);
  const directions = useRecipeProfileStore((state) => state.directionIntents);
  const [product, setProduct] = useState<VisibleProductType>('gelato');
  const [draft, setDraft] = useState<ProfileSettingsSnapshot>(() => {
    const stored = owner ? storedRowFor(owner, 'gelato') : null;
    return stored
      ? cloneSettings(stored)
      : withoutRowMachineFields(
          profileSnapshotFromState(recipe, recipe.direction_targets, directions),
          'gelato',
        );
  });
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (!authenticatedOwner) return;
    void listUserRecipeDefaults(authenticatedOwner)
      .then((rows) => {
        replaceDefaultsForOwner(
          authenticatedOwner,
          rows.map((row) => ({
            productContextKey: row.product_context_key,
            settings: row.settings,
          })),
        );
        const selected = rows.find((row) => row.settings.visibleProductType === product);
        if (selected) setDraft(cloneSettings(selected.settings));
        else {
          // No row for this product on the account: never keep a machine that came from the
          // open recipe (or from a row the account no longer has).
          setDraft((current) => withoutRowMachineFields(current, product));
        }
      })
      .catch(() => setStatus('error'));
  }, [authenticatedOwner, product, replaceDefaultsForOwner]);

  const productLabel = useMemo(() => copy.studio.goal.productTypes[product], [product]);
  if (!owner) return null;
  const patch = (next: Partial<ProfileSettingsSnapshot>) => {
    setDraft((current) => ({ ...current, ...next, visibleProductType: product }));
    setStatus('idle');
  };
  const setDirectionIntent = (axis: 'sweetness' | 'softness', value: number) => {
    const intent = Math.max(-2, Math.min(2, value)) as -2 | -1 | 0 | 1 | 2;
    patch({
      directionIntents: {
        ...DEFAULT_DIRECTION_INTENTS,
        ...draft.directionIntents,
        [axis]: intent,
      },
      directionTargets: {
        ...draft.directionTargets,
        [axis]: intent,
      },
    });
  };
  return (
    <section className="py-6" data-testid="account-recipe-defaults">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.06em] text-stone-600 uppercase">
            Domyślne ustawienia receptury
          </p>
          <h2 className="mt-1 text-[15px] leading-[1.3] font-bold tracking-[-0.02em] text-[var(--g-ink)]">
            Nowa receptura · {productLabel}
          </h2>
          <p className="mt-1 text-sm text-stone-600">
            Dotyczy tylko nowych receptur. Zapisane wersje pozostają bez zmian.
          </p>
        </div>
        <select
          className="h-11 rounded-[14px] border border-ink/12 bg-white px-3 text-sm text-ink"
          value={product}
          aria-label="Typ produktu dla domyślnych ustawień"
          onChange={(event) => {
            const next = event.currentTarget.value as VisibleProductType;
            setProduct(next);
            const stored = storedRowFor(owner, next);
            setDraft(
              stored
                ? cloneSettings(stored)
                : withoutRowMachineFields(
                    {
                      ...profileSnapshotFromState(
                        useRecipeStore.getState(),
                        useRecipeStore.getState().direction_targets,
                        useRecipeProfileStore.getState().directionIntents,
                      ),
                      visibleProductType: next,
                    },
                    next,
                  ),
            );
            setStatus('idle');
          }}
        >
          {VISIBLE_PRODUCT_TYPES.map((type) => (
            <option key={type} value={type}>
              {copy.studio.goal.productTypes[type]}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-stone-600">
          Tryb serwowania
          <select
            className="mt-1 h-11 w-full rounded-[14px] border border-ink/12 bg-white px-3 text-sm text-ink"
            value={draft.servingModeId}
            onChange={(event) => {
              const servingModeId = event.currentTarget.value;
              patch({
                servingModeId,
                targetTemperatureC: temperatureForMode(servingModeId) ?? draft.targetTemperatureC,
              });
            }}
          >
            {servings.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-stone-600">
          Strategia
          <select
            className="mt-1 h-11 w-full rounded-[14px] border border-ink/12 bg-white px-3 text-sm text-ink"
            value={draft.formulationStrategy ?? 'optimal'}
            onChange={(event) =>
              patch({ formulationStrategy: event.currentTarget.value as FormulationStrategy })
            }
          >
            {FORMULATION_STRATEGIES.map((value) => (
              <option key={value} value={value}>
                {value === 'optimal' ? 'OPTIMAL · Priorytet smaku.' : 'ECO · Priorytet kosztu.'}
              </option>
            ))}
          </select>
        </label>
      </div>
      {/* Produkcja v3 §3 — „Maszyna / styl produkcji” and „Partia bazy · g” moved to the ONE
          place of the machine and the default batch. */}
      <Link
        to="/machine"
        className="pro-focus-ring mt-4 flex min-h-12 flex-col gap-1 rounded-[14px] border border-ink/12 bg-white px-4 py-3 text-sm text-ink hover:border-ink/25 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
        data-testid="account-recipe-defaults-machine-link"
      >
        <span className="min-w-0">
          <span className="block font-semibold">{areaCopy.account.machineLinkLabel}</span>
          <span className="mt-0.5 block text-xs text-stone-600">
            {areaCopy.account.machineLinkHint}
          </span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-ink">
          {areaCopy.account.machineLinkTarget} <span aria-hidden>→</span>
        </span>
      </Link>
      <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Domyślny kierunek receptury">
        {(
          [
            ['sweetness', 'Słodycz'],
            ['softness', 'Miękkość'],
          ] as const
        ).map(([axis, label]) => {
          const value = draft.directionIntents?.[axis] ?? draft.directionTargets[axis];
          return (
            <div key={axis} className="rounded-[16px] border border-ink/10 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-stone-700">{label}</span>
                <span className="text-xs text-stone-600" aria-live="polite">
                  {directionIntentLabel(value)}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-[44px_1fr_44px] items-center gap-2">
                <button
                  type="button"
                  className="size-11 rounded-xl border border-ink/12 bg-[var(--g-ivory)] text-lg text-ink"
                  aria-label={`${label}: mniej`}
                  disabled={value <= -2}
                  onClick={() => setDirectionIntent(axis, value - 1)}
                >
                  −
                </button>
                <div
                  className="pro-focus-ring grid min-h-11 grid-cols-5 items-center gap-1 rounded-xl"
                  role="slider"
                  tabIndex={0}
                  aria-label={`Domyślna ${label.toLocaleLowerCase('pl')}`}
                  aria-valuemin={-2}
                  aria-valuemax={2}
                  aria-valuenow={value}
                  aria-valuetext={directionIntentLabel(value)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
                      event.preventDefault();
                      setDirectionIntent(axis, value - 1);
                    } else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
                      event.preventDefault();
                      setDirectionIntent(axis, value + 1);
                    } else if (event.key === 'Home') {
                      event.preventDefault();
                      setDirectionIntent(axis, -2);
                    } else if (event.key === 'End') {
                      event.preventDefault();
                      setDirectionIntent(axis, 2);
                    }
                  }}
                >
                  {[-2, -1, 0, 1, 2].map((position) => (
                    <span
                      key={position}
                      className={`h-2 rounded-full ${position === value ? 'bg-gold' : 'bg-stone-200'}`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="size-11 rounded-xl border border-ink/12 bg-[var(--g-ivory)] text-lg text-ink"
                  aria-label={`${label}: więcej`}
                  disabled={value >= 2}
                  onClick={() => setDirectionIntent(axis, value + 1)}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        disabled={status === 'saving'}
        className="mt-4 min-h-11 rounded-[14px] bg-ink px-4 text-sm font-semibold text-white shadow-pro-e1"
        onClick={() => {
          const settings = { ...draft, visibleProductType: product };
          setStatus('saving');
          void commitRecipeDefaultsAfterRemoteSave(
            () =>
              authenticatedOwner
                ? upsertUserRecipeDefault(authenticatedOwner, product, settings)
                : Promise.resolve(),
            () => saveLocal(productKey(owner, product), settings),
          )
            .then(() => {
              setStatus('saved');
            })
            .catch(() => setStatus('error'));
        }}
      >
        {status === 'saving' ? 'Zapisuję…' : 'Zapisz ustawienia domyślne'}
      </button>
      <p className="mt-2 min-h-5 text-xs text-stone-700" role="status" aria-live="polite">
        {status === 'saved'
          ? '✓ Domyślne ustawienia zostały zapisane.'
          : status === 'saving'
            ? 'Trwa zapis ustawień…'
            : ''}
      </p>
      {status === 'error' ? (
        <p role="alert" className="mt-2 text-xs text-status-error">
          Nie udało się zapisać. Spróbuj ponownie.
        </p>
      ) : null}
    </section>
  );
}
