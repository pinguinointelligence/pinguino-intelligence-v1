/**
 * §8.6 „Moja maszyna” — the machine SETTINGS card (owner hotfix 2026-07-17).
 *
 * Replaces the former read-only card, which left the user with no way to set
 * their own default batch, no save, no confirmation and no next step. The card
 * now separates by construction:
 *
 *   Pojemnik producenta   706 ml      ← model parameter, READ-ONLY (§8)
 *   Zalecany wsad PINGÜINO 670 g      ← PINGÜINO's proposal (never a limit)
 *   Mój domyślny wsad     [ 670 ] g   ← the USER's setting, always editable
 *   [Zapisz ustawienia] [Przywróć zalecany wsad] [Zmień maszynę]
 *   ✓ Ustawienia zapisane
 *   [Przejdź do receptury]
 *
 * A value above the recommendation WARNS with the owner's three choices and
 * never blocks the save. The manufacturer figure is editable only behind the
 * explicit „Używam innego pojemnika” action, which marks the profile as the
 * user's own configuration.
 */
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { cardShell, color, notice, radius, type } from '@/features/customer-shell/ui/tokens';
import { TextField } from '@/features/customer-shell/ui/TextField';
import { TouchButton } from '@/features/customer-shell/ui/TouchButton';
import { machineOnboardingCopy as copy } from '../machineOnboardingCopy';
import { containerSplitNotice, formatGrams } from '../machineViews';
import { deriveBatchGuidance, type AboveRecommendationChoice } from '../batchGuidance';
import {
  parseGramsInput,
  suggestRecommendedGramsForContainer,
  type MachineSettingsView,
} from '../machineSettingsView';
import type { SavedCustomContainer } from '../preferenceContracts';

export interface MachineSettingsSubmit {
  /** The user's own default batch, or null = follow the recommendation. */
  readonly userDefaultGrams: number | null;
  /** The user's own container, or null = the model's manufacturer figure. */
  readonly customContainer: SavedCustomContainer | null;
}

interface MachineProfileSectionProps {
  /** Null = no machine saved yet → the set-up entry point. */
  view: MachineSettingsView | null;
  onSetUp: () => void;
  onChange: () => void;
  /** Persist the settings. Resolves false on an honest save failure. */
  onSave: (submit: MachineSettingsSubmit) => Promise<boolean>;
  /** The next action after settings exist (§3) — never an empty screen. */
  onGoToRecipe: () => void;
  /**
   * Label of the bottom action. „Wróć do receptury” when the user came FROM a
   * recipe in progress; „Przejdź do receptury” otherwise (owner hotfix §2/§10).
   */
  goToRecipeLabel?: string;
  /** Offered only for §8.4 user-declared machines. */
  onEditCustom?: () => void;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-ink/10 py-2.5 first:border-t-0 first:pt-0">
      <span className={cn(type.secondary, color.textSecondary)}>{label}</span>
      <span className={cn(type.bodyStrong, color.textPrimary, 'text-right font-mono tabular-nums')}>
        {value}
      </span>
    </div>
  );
}

export function MachineProfileSection({
  view,
  onSetUp,
  onChange,
  onSave,
  onGoToRecipe,
  goToRecipeLabel = copy.settings.goToRecipe,
  onEditCustom,
}: MachineProfileSectionProps) {
  /* Field drafts — seeded from the saved record, re-seeded when it changes. */
  const [batchText, setBatchText] = useState('');
  const [containerOpen, setContainerOpen] = useState(false);
  const [capacityText, setCapacityText] = useState('');
  const [containerBatchText, setContainerBatchText] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [batchError, setBatchError] = useState<string | null>(null);
  const [capacityError, setCapacityError] = useState<string | null>(null);
  const [aboveChoice, setAboveChoice] = useState<AboveRecommendationChoice>('undecided');

  const savedBatch = view?.userDefaultGrams ?? null;
  const savedCapacity = view?.container?.capacityMl ?? null;
  const savedContainerBatch = view?.usesOwnContainer ? (view.recommendedGrams ?? null) : null;
  const usesOwnContainer = view?.usesOwnContainer ?? false;

  /**
   * Seed the drafts from the SAVED record during render (React's documented
   * "adjust state when props change" pattern) — an effect would leave the
   * first paint with an empty field, so the user would see it flash blank.
   * A plain re-render never overwrites what the user is typing. Two pieces of
   * state deliberately survive the re-seed a successful save triggers: the
   * saved `status` (the "✓ Ustawienia zapisane" confirmation) and the user's
   * `aboveChoice` — a save must not silently revert the split/keep-mine
   * decision the user just made (adversarial review #5). Editing a field
   * (onChange) is the only thing that re-opens the above-recommendation
   * question, via `setAboveChoice('undecided')` there.
   */
  const seedKey = [
    savedBatch ?? '',
    usesOwnContainer ? '1' : '0',
    savedCapacity ?? '',
    savedContainerBatch ?? '',
  ].join('|');
  const [seededFrom, setSeededFrom] = useState<string | null>(null);
  if (seededFrom !== seedKey) {
    setSeededFrom(seedKey);
    setBatchText(savedBatch !== null ? formatGrams(savedBatch) : '');
    setContainerOpen(usesOwnContainer);
    setCapacityText(usesOwnContainer && savedCapacity !== null ? String(savedCapacity) : '');
    setContainerBatchText(savedContainerBatch !== null ? formatGrams(savedContainerBatch) : '');
    setBatchError(null);
    setCapacityError(null);
  }

  if (view === null) {
    return (
      <section aria-label={copy.profile.title}>
        <h2 className={cn(type.title, color.textPrimary)}>{copy.profile.title}</h2>
        <div className={cn('mt-4 p-5', cardShell)}>
          <p className={cn(type.secondary, color.textSecondary)}>{copy.profile.noMachine}</p>
          <div className="mt-4">
            <TouchButton onClick={onSetUp}>{copy.profile.setUp}</TouchButton>
          </div>
        </div>
      </section>
    );
  }

  /* The recommendation the field is measured against — the user's own
     container proposal wins once declared (live while editing). */
  const draftCapacity = parseGramsInput(capacityText);
  const draftContainerBatch = parseGramsInput(containerBatchText);
  const liveRecommended =
    containerOpen && draftContainerBatch !== null && draftContainerBatch !== 'invalid'
      ? draftContainerBatch
      : view.recommendedGrams;

  const draftBatch = parseGramsInput(batchText);
  const currentGrams = draftBatch !== null && draftBatch !== 'invalid' ? draftBatch : null;
  const guidance = deriveBatchGuidance({
    recommendedGrams: liveRecommended,
    currentGrams,
    choice: aboveChoice,
  });
  const split =
    guidance.kind === 'custom_above' && guidance.split !== null
      ? containerSplitNotice(guidance.split.totalGrams, liveRecommended)
      : null;

  const restore = () => {
    setBatchText(liveRecommended !== null ? formatGrams(liveRecommended) : '');
    setBatchError(null);
    setAboveChoice('undecided');
    setStatus('idle');
  };

  const submit = async () => {
    setStatus('idle');
    const batch = parseGramsInput(batchText);
    if (batch === 'invalid') {
      setBatchError(copy.settings.invalidBatch);
      return;
    }
    let container: SavedCustomContainer | null = null;
    if (containerOpen) {
      const capacity = parseGramsInput(capacityText);
      if (capacity === 'invalid' || capacity === null) {
        setCapacityError(copy.settings.invalidCapacity);
        return;
      }
      const recommended = parseGramsInput(containerBatchText);
      if (recommended === 'invalid') {
        setCapacityError(copy.settings.invalidBatch);
        return;
      }
      const resolved = recommended ?? suggestRecommendedGramsForContainer(capacity);
      if (resolved === null) {
        setCapacityError(copy.settings.invalidCapacity);
        return;
      }
      container = { capacityMl: capacity, recommendedBatchGrams: resolved };
    }
    setBatchError(null);
    setCapacityError(null);
    // Saving the proposal back is not "an own setting": it stays null so the
    // profile keeps FOLLOWING the recommendation (and moves with it if the
    // machine or the container changes). Only a divergent value is the user's.
    const recommendedAfter = container?.recommendedBatchGrams ?? view.recommendedGrams;
    const own = batch !== null && batch === recommendedAfter ? null : batch;
    // The amount is never blocked — an above-recommendation value saves as-is.
    const ok = await onSave({ userDefaultGrams: own, customContainer: container });
    setStatus(ok ? 'saved' : 'failed');
  };

  return (
    <section aria-label={copy.profile.title}>
      <h2 className={cn(type.title, color.textPrimary)}>{copy.profile.title}</h2>

      <div className={cn('mt-4 p-5', cardShell)}>
        {/* This surface stores the PROFILE DEFAULT machine (owner correction). */}
        <p className={cn(type.caption, color.textMuted)}>{copy.profile.defaultLabel}</p>
        <p className={cn('mt-0.5', type.bodyStrong, color.textPrimary)}>{view.name}</p>
        {view.usesOwnContainer || view.isCustomMachine ? (
          <p className={cn('mt-1', type.caption, color.textMuted)}>{copy.settings.customContainerBadge}</p>
        ) : null}

        {/* Manufacturer data — informational, read-only (§1, §8). */}
        <div className="mt-4">
          {view.container !== null ? (
            <Row
              label={view.container.label}
              value={`${view.container.capacityMl} ${copy.settings.unitMl}`}
            />
          ) : null}
          {view.recommendedGrams !== null ? (
            <Row
              label={copy.batch.recommendedLabel}
              value={`${formatGrams(view.recommendedGrams)} ${copy.batch.recommendedUnit}`}
            />
          ) : null}
        </div>
        {view.recommendedGrams === null ? (
          <p className={cn('mt-2 max-w-prose', type.caption, color.textMuted)}>
            {copy.settings.noRecommendation}
          </p>
        ) : null}
        {view.estimatedNote !== null ? (
          <p className={cn('mt-2 max-w-prose', type.caption, color.textMuted)}>{view.estimatedNote}</p>
        ) : null}
        {view.vesselOnlyFallback ? (
          <p className={cn('mt-2 max-w-prose', type.caption, color.textMuted)}>
            {copy.profile.vesselOnlyFlag}
          </p>
        ) : null}

        {/* The user's OWN setting (§1) — always editable, never a hard limit. */}
        <div className="mt-5">
          <TextField
            label={copy.settings.userDefaultLabel}
            inputMode="decimal"
            value={batchText}
            onChange={(e) => {
              setBatchText(e.target.value);
              setBatchError(null);
              setAboveChoice('undecided');
              setStatus('idle');
            }}
            trailing={<span className={cn(type.secondary, color.textMuted)}>{copy.batch.recommendedUnit}</span>}
            {...(batchError !== null ? { error: batchError } : { hint: copy.settings.userDefaultHint })}
          />
        </div>

        {/* Above the recommendation: warn + offer choices, never block (§7).
            role="status" so a screen reader announces the as-you-type warning
            (WCAG 4.1.3 — adversarial review #10). */}
        {guidance.kind === 'custom_above' && guidance.choice === 'undecided' ? (
          <div className={cn('mt-3 px-4 py-3', radius.card, notice.risky, notice.text, type.secondary)}>
            <p role="status" className={cn('font-medium', color.textPrimary)}>{copy.batch.aboveWarning}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <TouchButton variant="secondary" onClick={() => setAboveChoice('split')}>
                {copy.batch.splitAction}
              </TouchButton>
              <TouchButton variant="quiet" onClick={() => setAboveChoice('keep_mine')}>
                {copy.batch.keepMine}
              </TouchButton>
              <TouchButton variant="quiet" onClick={restore}>
                {copy.batch.restoreShort}
              </TouchButton>
            </div>
          </div>
        ) : null}
        {split !== null ? (
          <div
            role="status"
            className={cn('mt-3 px-4 py-3', radius.card, notice.neutral, notice.text, type.secondary)}
          >
            <p className={cn('font-medium', color.textPrimary)}>{split.message}</p>
            <p className="mt-0.5">{split.detail}</p>
          </div>
        ) : null}
        {guidance.kind === 'custom' ||
        (guidance.kind === 'custom_above' && guidance.choice === 'keep_mine') ? (
          <p className={cn('mt-3', type.caption, color.textSecondary)}>{copy.batch.customInUse}</p>
        ) : null}

        {/* The user's own container (§8) — the model's figure is never edited. */}
        <div className="mt-5 border-t border-ink/10 pt-4">
          {!containerOpen ? (
            <TouchButton variant="quiet" onClick={() => setContainerOpen(true)}>
              {copy.settings.useCustomContainer}
            </TouchButton>
          ) : (
            <div>
              <p className={cn(type.bodyStrong, color.textPrimary)}>{copy.settings.customContainerTitle}</p>
              <p className={cn('mt-1 max-w-prose', type.caption, color.textMuted)}>
                {copy.settings.customContainerLead}
              </p>
              <div className="mt-3 flex flex-col gap-3">
                <TextField
                  label={copy.settings.customCapacityFieldLabel}
                  inputMode="decimal"
                  value={capacityText}
                  onChange={(e) => {
                    setCapacityText(e.target.value);
                    setCapacityError(null);
                    setStatus('idle');
                    // Offer the 0.95 proposal for the declared container; the
                    // user may overwrite it (never forced).
                    const parsed = parseGramsInput(e.target.value);
                    if (parsed !== null && parsed !== 'invalid' && containerBatchText.trim() === '') {
                      const suggested = suggestRecommendedGramsForContainer(parsed);
                      if (suggested !== null) setContainerBatchText(String(suggested));
                    }
                  }}
                  trailing={<span className={cn(type.secondary, color.textMuted)}>{copy.settings.unitMl}</span>}
                  {...(capacityError !== null ? { error: capacityError } : {})}
                />
                <TextField
                  label={copy.settings.customRecommendedFieldLabel}
                  hint={copy.settings.customRecommendedHint}
                  inputMode="decimal"
                  value={containerBatchText}
                  onChange={(e) => {
                    setContainerBatchText(e.target.value);
                    setStatus('idle');
                  }}
                  trailing={
                    <span className={cn(type.secondary, color.textMuted)}>{copy.batch.recommendedUnit}</span>
                  }
                />
              </div>
              <div className="mt-3">
                <TouchButton
                  variant="quiet"
                  onClick={() => {
                    setContainerOpen(false);
                    setCapacityText('');
                    setContainerBatchText('');
                    setCapacityError(null);
                    setStatus('idle');
                  }}
                >
                  {copy.settings.customContainerRemove}
                </TouchButton>
              </div>
            </div>
          )}
          {draftCapacity === 'invalid' && capacityError === null ? (
            <p className={cn('mt-2', type.caption, color.statusError)}>{copy.settings.invalidCapacity}</p>
          ) : null}
        </div>

        {/* Actions (§2) — explicit save, explicit restore, explicit change. */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <TouchButton onClick={() => void submit()}>{copy.settings.save}</TouchButton>
          <TouchButton variant="secondary" onClick={restore} disabled={view.recommendedGrams === null}>
            {copy.settings.restoreRecommended}
          </TouchButton>
          <TouchButton variant="quiet" onClick={onChange}>
            {copy.profile.change}
          </TouchButton>
          {view.isCustomMachine && onEditCustom ? (
            <TouchButton variant="quiet" onClick={onEditCustom}>
              {copy.profile.editCustom}
            </TouchButton>
          ) : null}
        </div>

        {/* Unambiguous status — never leave the user guessing (§2). */}
        {status === 'saved' ? (
          <p role="status" className={cn('mt-4', type.secondary, color.statusIdeal)}>
            ✓ {copy.settings.saved}
          </p>
        ) : null}
        {status === 'failed' ? (
          <p role="alert" className={cn('mt-4', type.secondary, color.statusError)}>
            {copy.settings.saveFailed}
          </p>
        ) : null}
      </div>

      {/* The next action is always offered (§3). */}
      <div className="mt-5">
        <TouchButton size="lg" onClick={onGoToRecipe}>
          {goToRecipeLabel}
        </TouchButton>
      </div>
    </section>
  );
}
