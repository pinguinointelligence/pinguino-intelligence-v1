import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { copy } from '@/copy/en';
import { cn } from '@/lib/cn';
import { lockBodyScroll } from '@/components/ui/bodyScrollLock';
import type { VisibleProductType } from '@/features/studio/productType';
import { NewRecipeConfirmationDialog } from '@/features/recipes/NewRecipeConfirmationDialog';
import {
  changeProRecipeProductType,
  isUntouchedNewRecipeStarter,
  startNewProRecipe,
} from '@/pages/destinations/startNewProRecipe';
import { useRecipeStore } from '@/stores/recipeStore';
import { DirectionAxesGrid } from './ProfileDirectionAxes';
import { PRO_VISIBLE_PRODUCT_TYPES } from './profileCompatibility';
import { showsProfessionalServing, useRecipeProfileStore } from './recipeProfileStore';
import { useProSetupFlowStore, type ProSetupOutcome, type ProSetupStep } from './proSetupFlowGate';
import {
  DefaultsCheckbox,
  MachineSettingsField,
  ServingSegments,
  StrategyTiles,
  TargetBatchControlForSetup,
} from './WorkbenchSettingsLine';
import { signatureCoveredByAccountDefaults, useProSettingsAuthority } from './proSettingsAuthority';

const flow = copy.proWorkbench.setupFlow;
const goal = copy.studio.goal;
const TOTAL_STEPS = 3;

/** A quiet mono section label, as the design's Step 3 prints it. */
function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mt-5 mb-[9px] font-mono text-[11.5px] leading-none tracking-[0.08em] text-[var(--g-text-muted)] uppercase first:mt-0">
      {children}
    </p>
  );
}

/**
 * DESIGN V3.0 §3 — the full-screen setup of a NEW recipe on a phone and iPad
 * portrait (owner-LOCKED Points 1–4; V3 CTA „Receptura").
 *
 *   1. „Jakie lody dziś robimy?" — Gelato · Sorbet · Wegańskie · Proteinowe.
 *   2. „Ile lodów dziś przygotowujemy?" — the batch pill and OPTIMAL / ECO.
 *   3. „Maszyna, podawanie i smak" — machine, serving, Słodycz / Twardość and
 *      „Ustaw jako domyślne" for the whole package.
 *
 * It is a PRESENTATION of the recipe's own settings: every control is the
 * panel's control (`useProSettingsAuthority`, `DirectionAxesGrid`) writing the
 * one recipe store, and „Receptura" is the panel's own confirmation
 * (`confirmSettings`, plus the existing defaults mechanism when ticked). It does
 * no recipe math. Step 1 is always asked; when the saved defaults cover the
 * chosen product (the panel's own rule) Steps 2–3 are skipped.
 */
export function ProSetupFlow({
  step,
  onReveal,
}: {
  step: ProSetupStep;
  /** Runs the change that hands the screen back to the recipe (the V3 reveal). */
  onReveal: (apply: () => void) => void;
}) {
  const settings = useProSettingsAuthority();
  const { store, hardConflict } = settings;
  const goTo = useProSetupFlowStore((state) => state.goTo);
  const finish = useProSetupFlowStore((state) => state.finish);
  const [typeChoice, setTypeChoice] = useState<VisibleProductType>(store.visibleProductType);
  const [pendingType, setPendingType] = useState<VisibleProductType | null>(null);
  const [asDefault, setAsDefault] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'error'>('idle');
  const titleId = useId();
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  /* The setup owns the screen while it is open: the page under it does not
     scroll, and every step starts at its own question for a screen reader. */
  useEffect(() => lockBodyScroll(), []);
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [step]);

  const identity = () => useRecipeProfileStore.getState().activeDraftIdentity;
  const end = (draftIdentity: string, outcome: ProSetupOutcome) =>
    onReveal(() => finish(draftIdentity, outcome));

  /** After Step 1: the saved defaults either cover the product (skip 2–3) or not. */
  const continueAfterType = () => {
    const draftIdentity = identity();
    if (draftIdentity === null) return;
    const covered = signatureCoveredByAccountDefaults(settings.defaultsOwner);
    if (covered !== null) {
      useRecipeProfileStore
        .getState()
        .confirmSettings(covered, draftIdentity, useRecipeStore.getState().draftContextSeq);
      end(draftIdentity, 'defaults');
      return;
    }
    goTo(draftIdentity, 2);
  };

  const answerType = () => {
    const current = useRecipeStore.getState();
    if (typeChoice !== current.visibleProductType) {
      /* The answer to Step 1 IS the new recipe's type. An untouched starter has
         nothing to lose, so the new draft starts in that type with the account
         defaults for it (the explicit new-recipe door). Anything else goes
         through the panel's own confirmation and family change. */
      if (current.newRecipeStarterKey !== null && isUntouchedNewRecipeStarter()) {
        startNewProRecipe(typeChoice);
      } else {
        setPendingType(typeChoice);
        return;
      }
    }
    continueAfterType();
  };

  const confirmSetup = () => {
    const draftIdentity = identity();
    if (draftIdentity === null || hardConflict) return;
    const savingDefaults = settings.confirm(asDefault);
    if (savingDefaults === null) {
      end(draftIdentity, 'setup');
      return;
    }
    setSaving('saving');
    savingDefaults.then(() => end(draftIdentity, 'setup')).catch(() => setSaving('error'));
  };

  const professionalServing = showsProfessionalServing(store.machineKind);

  let body: ReactNode;
  if (step === 1) {
    body = (
      <div
        role="radiogroup"
        aria-labelledby={titleId}
        className="grid gap-2.5"
        data-testid="pro-setup-types"
      >
        {PRO_SETUP_TYPE_ORDER.map((type) => {
          const selected = typeChoice === type;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setTypeChoice(type)}
              data-testid={`pro-setup-type-${type}`}
              className={cn(
                'pro-setup-card pro-focus-ring grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 bg-white px-4 py-[15px] text-left',
                selected
                  ? 'shadow-[inset_0_0_0_2px_var(--g-ink)]'
                  : 'shadow-[inset_0_0_0_1px_#e3ded5]',
              )}
            >
              <span className="min-w-0">
                <b className="block text-[16px] leading-[1.2] font-semibold text-[var(--g-ink)]">
                  {goal.productTypes[type]}
                </b>
                <small className="mt-0.5 block text-[13px] leading-[1.35] text-[var(--g-text-muted)]">
                  {flow.typeNotes[type]}
                </small>
              </span>
              <span
                aria-hidden
                className={cn(
                  'size-5 rounded-full',
                  selected
                    ? 'shadow-[inset_0_0_0_6px_var(--g-ink)]'
                    : 'shadow-[inset_0_0_0_1.5px_#bdb6aa]',
                )}
              />
            </button>
          );
        })}
      </div>
    );
  } else if (step === 2) {
    body = (
      <>
        <TargetBatchControlForSetup settings={settings} note={flow.batchShortcut} />
        <p className="mt-[22px] mb-1.5 text-[11px] leading-[1.2] font-medium text-[var(--g-text-field-label)]">
          {flow.modeLabel}
        </p>
        <StrategyTiles
          value={store.formulation_strategy}
          onChange={settings.changeStrategy}
          variant="setup"
        />
      </>
    );
  } else {
    body = (
      <>
        <MachineSettingsField settings={settings} variant="setup" />
        {professionalServing ? (
          <>
            <SectionLabel>{flow.sections.serving}</SectionLabel>
            <ServingSegments
              value={settings.activeServing}
              onPick={(id) => settings.pickServing(id)}
              testid="pro-setup-serving"
            />
          </>
        ) : null}
        <SectionLabel>{flow.sections.taste}</SectionLabel>
        <DirectionAxesGrid className="gap-y-2.5" />
        <DefaultsCheckbox
          checked={asDefault}
          disabled={settings.defaultsOwner === null}
          onChange={setAsDefault}
          note={flow.asDefaultScope}
          className="mt-[18px]"
          testid="pro-setup-default"
        />
        {hardConflict ? (
          <p
            role="alert"
            className="mt-3 text-xs text-status-error"
            data-testid="pro-setup-conflict"
          >
            {flow.conflict}
          </p>
        ) : null}
        {saving === 'error' ? (
          <p role="alert" className="mt-3 text-xs text-status-error">
            Nie udało się zapisać ustawień domyślnych. Spróbuj ponownie.
          </p>
        ) : null}
      </>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid="pro-setup-flow"
      data-setup-step={step}
      /* Below the global header, over everything else of the workbench — the
         recipe, its dock and the module tabs wait until the setup is done. */
      className="pro-workbench-mobile-only fixed inset-x-0 top-[var(--pro-mobile-header-height)] bottom-0 z-[65] flex flex-col bg-white"
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[36.25rem] flex-1 flex-col px-[22px] pt-[18px] pb-[max(22px,env(safe-area-inset-bottom))] sm:pt-11">
        <div className="flex justify-between text-[13px] leading-none text-[var(--g-text-muted)]">
          <span>{flow.eyebrow}</span>
          <span className="font-mono" data-testid="pro-setup-step">
            {flow.step(step, TOTAL_STEPS)}
          </span>
        </div>
        <div aria-hidden className="mt-3 mb-[22px] grid grid-cols-3 gap-1.5">
          {Array.from({ length: TOTAL_STEPS }, (_, index) => (
            <i
              key={index}
              className={cn(
                'h-[3px] rounded-full',
                index < step ? 'bg-[var(--g-ink)]' : 'bg-[#e7e2da]',
              )}
            />
          ))}
        </div>
        <div className="-mx-[22px] min-h-0 flex-1 overflow-y-auto px-[22px] pb-2.5">
          <h2
            id={titleId}
            ref={titleRef}
            tabIndex={-1}
            className="mb-[18px] text-[27px] leading-[1.15] font-semibold tracking-[-0.02em] text-[var(--g-ink)] outline-none"
            data-testid="pro-setup-title"
          >
            {flow.titles[step - 1]}
          </h2>
          {body}
        </div>
        <div className="flex gap-2.5 pt-3.5">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                const draftIdentity = identity();
                if (draftIdentity !== null) goTo(draftIdentity, (step - 1) as ProSetupStep);
              }}
              className="pro-focus-ring inline-flex h-12 flex-[0_0_124px] items-center justify-center gap-1.5 rounded-full bg-white px-5 text-[15.5px] font-semibold text-[var(--g-ink)] shadow-[inset_0_0_0_1px_#dcd6cc]"
              data-testid="pro-setup-back"
            >
              <span aria-hidden>←</span>
              {flow.back}
            </button>
          ) : null}
          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={() => {
                if (step === 1) {
                  answerType();
                  return;
                }
                const draftIdentity = identity();
                if (draftIdentity !== null) goTo(draftIdentity, 3);
              }}
              className="pro-focus-ring inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--g-graphite)] px-5 text-[15.5px] font-semibold text-white"
              data-testid="pro-setup-next"
            >
              {flow.next}
              <span aria-hidden>→</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={confirmSetup}
              disabled={hardConflict || saving === 'saving'}
              className="pro-focus-ring inline-flex h-12 flex-1 items-center justify-center rounded-full bg-[var(--g-graphite)] px-5 text-[15.5px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-[var(--g-line-quiet)] disabled:text-[var(--g-lock)]"
              data-testid="pro-setup-finish"
            >
              {flow.finish}
            </button>
          )}
        </div>
      </div>
      <NewRecipeConfirmationDialog
        open={pendingType !== null}
        onCancel={() => setPendingType(null)}
        onConfirm={() => {
          if (pendingType === null) return;
          changeProRecipeProductType(pendingType);
          setPendingType(null);
          continueAfterType();
        }}
        title={`Zmienić typ receptury na ${pendingType === null ? '' : goal.productTypes[pendingType]}?`}
        description={
          pendingType === null
            ? null
            : `${goal.productTypes[pendingType]} korzysta z innej bazy. Niezapisane składniki bieżącego draftu zostaną zastąpione natywną bazą po potwierdzeniu.`
        }
        confirmLabel={
          pendingType === null
            ? 'Utwórz nową wersję'
            : `Utwórz wersję ${goal.productTypes[pendingType]}`
        }
      />
    </div>
  );
}

/** Point 1 order: Gelato, Sorbet, Wegańskie, Proteinowe — every PRO type. */
const PRO_SETUP_TYPE_ORDER: readonly VisibleProductType[] = (
  ['gelato', 'sorbet', 'vegan', 'protein'] as const
).filter((type) => PRO_VISIBLE_PRODUCT_TYPES.includes(type));

/**
 * „Używamy Twoich domyślnych ustawień · Zmień ✓" — under the recipe after the
 * saved defaults skipped Steps 2–3. „Zmień" reopens the setup at Step 2.
 */
export function ProSetupDefaultsNotice({ draftIdentity }: { draftIdentity: string }) {
  const reopen = useProSetupFlowStore((state) => state.reopen);
  return (
    <div
      className="pro-workbench-mobile-only pro-setup-notice mx-[var(--pro-mobile-gutter)] mt-2.5 flex items-center gap-2 bg-[#eef5f0] px-3 py-[9px] text-[13px] leading-[1.3] font-medium text-[#2f5b3e]"
      data-testid="pro-setup-defaults-notice"
    >
      <span className="min-w-0 flex-1">{flow.defaultsNotice}</span>
      <button
        type="button"
        onClick={() => reopen(draftIdentity)}
        className="pro-focus-ring relative shrink-0 text-[13px] leading-none font-semibold text-[var(--g-ink)] underline after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2"
        data-testid="pro-setup-defaults-change"
      >
        {flow.change}
      </button>
      <span role="img" aria-label={flow.applied} className="grid shrink-0">
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
          <path
            d="M3.5 8.3 6.6 11.3 12.5 4.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}
