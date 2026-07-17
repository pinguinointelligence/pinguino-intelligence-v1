/**
 * §4 „Dopasuj ilość” — the short step between picking a machine and saving it
 * (owner hotfix 2026-07-17: „Po kliknięciu Ninja CREAMi Deluxe nie finalizuj
 * wszystkiego bez pytania”).
 *
 * Shows the manufacturer container (read-only) and PINGÜINO's proposal, and
 * lets the user set their OWN default right away — the proposal is prefilled,
 * an above-recommendation value warns but never blocks the save.
 */
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { color, notice, radius, type } from '@/features/customer-shell/ui/tokens';
import { TextField } from '@/features/customer-shell/ui/TextField';
import { TouchButton } from '@/features/customer-shell/ui/TouchButton';
import { machineOnboardingCopy as copy } from '../machineOnboardingCopy';
import { containerSplitNotice, formatGrams } from '../machineViews';
import { deriveBatchGuidance, type AboveRecommendationChoice } from '../batchGuidance';
import { parseGramsInput } from '../machineSettingsView';

interface MachineAdjustBatchStepProps {
  machineName: string;
  /** The manufacturer container figure, or null when none is known. */
  containerMl: number | null;
  /** PINGÜINO's proposal for this machine, or null (honest — user decides). */
  recommendedGrams: number | null;
  /** ESTIMATED note for user-declared capacity, or null. */
  estimatedNote?: string | null;
  /** Label of the primary action (context-dependent — see the onboarding props). */
  submitLabel: string;
  /** The user's own default, or null = follow the recommendation. */
  onSubmit: (userDefaultGrams: number | null) => void;
}

export function MachineAdjustBatchStep({
  machineName,
  containerMl,
  recommendedGrams,
  estimatedNote = null,
  submitLabel,
  onSubmit,
}: MachineAdjustBatchStepProps) {
  const [text, setText] = useState(recommendedGrams !== null ? formatGrams(recommendedGrams) : '');
  const [error, setError] = useState<string | null>(null);
  const [aboveChoice, setAboveChoice] = useState<AboveRecommendationChoice>('undecided');

  const draft = parseGramsInput(text);
  const currentGrams = draft !== null && draft !== 'invalid' ? draft : null;
  const guidance = deriveBatchGuidance({ recommendedGrams, currentGrams, choice: aboveChoice });
  const split =
    guidance.kind === 'custom_above' && guidance.split !== null
      ? containerSplitNotice(guidance.split.totalGrams, recommendedGrams)
      : null;

  const submit = () => {
    const value = parseGramsInput(text);
    if (value === 'invalid') {
      setError(copy.settings.invalidBatch);
      return;
    }
    // Never blocked: an above-recommendation amount is the user's call.
    onSubmit(value);
  };

  return (
    <section aria-label={copy.settings.adjustTitle}>
      <h1 className={cn(type.title, color.textPrimary)}>{copy.settings.adjustTitle}</h1>
      <p className={cn('mt-2 max-w-prose', type.secondary, color.textSecondary)}>
        {copy.settings.adjustLead}
      </p>

      <div className="mt-5">
        <p className={cn(type.bodyStrong, color.textPrimary)}>{machineName}</p>
        {containerMl !== null ? (
          <p className={cn('mt-1', type.secondary, color.textSecondary)}>
            {copy.settings.manufacturerCapacityLabel}: {containerMl} {copy.settings.unitMl}
          </p>
        ) : null}
        {recommendedGrams !== null ? (
          <p className={cn('mt-1', type.secondary, color.textSecondary)}>
            {copy.batch.recommendedLabel}:{' '}
            <span className={color.textPrimary}>
              {formatGrams(recommendedGrams)} {copy.batch.recommendedUnit}
            </span>
          </p>
        ) : (
          <p className={cn('mt-1 max-w-prose', type.secondary, color.textSecondary)}>
            {copy.settings.noRecommendation}
          </p>
        )}
        {estimatedNote !== null ? (
          <p className={cn('mt-1 max-w-prose', type.caption, color.textMuted)}>{estimatedNote}</p>
        ) : null}
      </div>

      <div className="mt-5">
        <TextField
          label={copy.settings.userDefaultLabel}
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
            setAboveChoice('undecided');
          }}
          trailing={<span className={cn(type.secondary, color.textMuted)}>{copy.batch.recommendedUnit}</span>}
          {...(error !== null ? { error } : { hint: copy.settings.userDefaultHint })}
        />
      </div>

      {guidance.kind === 'custom_above' && guidance.choice === 'undecided' ? (
        <div className={cn('mt-3 px-4 py-3', radius.card, notice.risky, notice.text, type.secondary)}>
          {/* role="status" — announce the as-you-type warning (WCAG 4.1.3). */}
          <p role="status" className={cn('font-medium', color.textPrimary)}>{copy.batch.aboveWarning}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <TouchButton variant="secondary" onClick={() => setAboveChoice('split')}>
              {copy.batch.splitAction}
            </TouchButton>
            <TouchButton variant="quiet" onClick={() => setAboveChoice('keep_mine')}>
              {copy.batch.keepMine}
            </TouchButton>
            <TouchButton
              variant="quiet"
              onClick={() => {
                setText(recommendedGrams !== null ? formatGrams(recommendedGrams) : '');
                setAboveChoice('undecided');
              }}
            >
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

      <div className="mt-6">
        <TouchButton size="lg" onClick={submit}>
          {submitLabel}
        </TouchButton>
      </div>
    </section>
  );
}
