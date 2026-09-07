/**
 * §42–§46 — the machine and the amount.
 *
 * Two states, and the difference matters:
 *  • a machine is ALREADY known (saved preference, or inherited from a Pro recipe) →
 *    show it as a fact with `Change`, and never ask again (§42);
 *  • no machine → offer the Home machines plus `Other machine`. Professional is not
 *    offered here at any time (§43) — `homeSelectableMachines` cannot return it.
 *
 * The amount is container-first (§45) and every gram comes from the machine authority
 * via `homeAmountAuthority` (§44) — this component computes no quantity of its own.
 */
import { useState } from 'react';
import {
  MACHINE_CATALOG,
  deriveMachineSetup,
  type HomeMachineProfile,
} from '@/features/machine-catalog';
import { cn } from '@/lib/cn';
import { homeCreatorCopy } from '../homeCreatorCopy';
import {
  capacityGuidance,
  manualAmount,
  stepContainers,
  type HomeAmount,
} from '../homeAmountAuthority';
import { homeSelectableMachines, type HomeMachineView } from '../homeMachinePresentation';
import { HomeSection } from './HomeSection';

export function HomeMachineSection({
  view,
  amount,
  recommendedBatchGrams,
  onSelectMachine,
  onOtherMachine,
  onCancelChange,
  onAmountChange,
  onChangeMachine,
  onDone,
  onBack,
}: {
  view: HomeMachineView;
  amount: HomeAmount | null;
  recommendedBatchGrams: number | null;
  onSelectMachine: (machine: HomeMachineProfile) => void;
  onOtherMachine: () => void;
  /**
   * Leave the chooser without changing anything. Offered only when there IS a machine
   * to go back to — a first-time choice has no previous state to restore, so it stays
   * a plain question.
   */
  onCancelChange?: () => void;
  onAmountChange: (amount: HomeAmount) => void;
  onChangeMachine: () => void;
  onDone: () => void;
  onBack?: (() => void) | null;
}) {
  const [manual, setManual] = useState('');
  const machines = homeSelectableMachines(MACHINE_CATALOG);
  const guidance = amount ? capacityGuidance(amount, recommendedBatchGrams) : null;
  const containers = guidance?.containers ?? 1;

  return (
    <HomeSection id="machine" onBack={onBack} data-testid="home-section-machine">
      {view.needsMachineChoice ? (
        <>
          <h2
            className="text-[22px] leading-tight font-semibold tracking-[-0.015em] sm:text-[26px]"
            style={{ color: 'var(--g-ink)' }}
          >
            {homeCreatorCopy.machine.question}
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-2.5">
            {machines.map((machine) => (
              <button
                key={machine.id}
                type="button"
                onClick={() => onSelectMachine(machine)}
                data-testid={`home-machine-${machine.id}`}
                className="flex min-h-[60px] items-center justify-between rounded-[12px] border px-5 py-3.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                style={{ borderColor: 'var(--g-line)', background: '#ffffff' }}
              >
                <span className="text-[15px] font-medium" style={{ color: 'var(--g-ink)' }}>
                  {machine.displayName ?? machine.id}
                </span>
                <span className="text-[12px]" style={{ color: 'var(--g-text-muted)' }}>
                  {deriveMachineSetup(machine).recommendedBatchGrams !== null
                    ? `${deriveMachineSetup(machine).recommendedBatchGrams} ${homeCreatorCopy.recipe.grams}`
                    : ''}
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={onOtherMachine}
              data-testid="home-machine-other"
              className="flex min-h-[60px] flex-col justify-center rounded-[12px] border border-dashed px-5 py-3.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
              style={{ borderColor: 'var(--g-line-strong)', background: 'var(--g-ivory)' }}
            >
              <span className="text-[15px] font-medium" style={{ color: 'var(--g-ink)' }}>
                {homeCreatorCopy.machine.otherMachine}
              </span>
              <span className="text-[13px]" style={{ color: 'var(--g-text-muted)' }}>
                {homeCreatorCopy.machine.otherMachineHint}
              </span>
            </button>
          </div>
          {/* Served: „Zmień" opened this list with no way out, so the only exit was to
              pick something. A change the customer started must also be abandonable. */}
          {onCancelChange && view.label !== null ? (
            <button
              type="button"
              onClick={onCancelChange}
              data-testid="home-machine-cancel-change"
              className="mt-3 min-h-[44px] rounded-full border px-4 text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
              style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
            >
              {homeCreatorCopy.draft.cancel}
            </button>
          ) : null}
        </>
      ) : (
        <>
          {/* §42/§16: the machine as a FACT, with Change — not a question. */}
          <div
            className="flex items-center justify-between gap-3 rounded-[12px] border px-5 py-4"
            style={{ borderColor: 'var(--g-line)', background: '#ffffff' }}
            data-testid="home-machine-summary"
          >
            <div className="min-w-0">
              <p
                className="text-[11px] font-bold tracking-[0.12em] uppercase"
                style={{ color: 'var(--g-text-muted)' }}
              >
                {homeCreatorCopy.machine.savedLabel}
              </p>
              <p
                className="mt-0.5 truncate text-[15px] font-medium"
                style={{ color: 'var(--g-ink)' }}
                data-testid="home-machine-label"
              >
                {view.label ?? '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={onChangeMachine}
              data-testid="home-machine-change"
              className="min-h-[44px] shrink-0 rounded-full border px-4 text-[13px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
              style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
            >
              {homeCreatorCopy.machine.change}
            </button>
          </div>

          {/* §45/§46 the amount. A Professional recipe shows a plain amount with no
              container wording; a Home machine shows the container stepper. */}
          <div className="mt-4" data-testid="home-amount">
            <p
              className="text-[11px] font-bold tracking-[0.12em] uppercase"
              style={{ color: 'var(--g-text-muted)' }}
            >
              {homeCreatorCopy.machine.amount}
            </p>
            {view.amount.kind === 'containers' && amount ? (
              <div className="mt-2 flex items-center gap-3">
                <div
                  className="inline-flex items-center overflow-hidden rounded-full border"
                  style={{ borderColor: 'var(--g-line)' }}
                >
                  <button
                    type="button"
                    aria-label="−"
                    data-testid="home-containers-minus"
                    onClick={() => {
                      const next = stepContainers(containers, -1, recommendedBatchGrams);
                      if (next) onAmountChange(next);
                    }}
                    className="flex h-11 w-11 items-center justify-center text-[18px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                    style={{ color: 'var(--g-ink)' }}
                  >
                    −
                  </button>
                  <span
                    className="min-w-[112px] px-2 text-center text-[14px] font-medium"
                    data-testid="home-containers-value"
                    style={{ color: 'var(--g-ink)' }}
                  >
                    {containers}{' '}
                    {containers === 1
                      ? homeCreatorCopy.machine.container
                      : homeCreatorCopy.machine.containers}
                  </span>
                  <button
                    type="button"
                    aria-label="+"
                    data-testid="home-containers-plus"
                    onClick={() => {
                      const next = stepContainers(containers, 1, recommendedBatchGrams);
                      if (next) onAmountChange(next);
                    }}
                    className="flex h-11 w-11 items-center justify-center text-[18px] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
                    style={{ color: 'var(--g-ink)' }}
                  >
                    +
                  </button>
                </div>
                <span
                  className="font-mono text-[14px]"
                  data-testid="home-amount-grams"
                  style={{ color: 'var(--g-text-secondary)' }}
                >
                  {amount.totalGrams} {homeCreatorCopy.recipe.grams}
                </span>
              </div>
            ) : (
              <p
                className="mt-1 font-mono text-[18px]"
                data-testid="home-amount-plain"
                style={{ color: 'var(--g-ink)' }}
              >
                {view.amount.totalGrams} {homeCreatorCopy.recipe.grams}
              </p>
            )}

            {/* §46: an exact amount is kept exactly, then annotated with guidance. */}
            <div className="mt-3 flex items-center gap-2">
              <input
                inputMode="numeric"
                value={manual}
                onChange={(event) => setManual(event.target.value.replace(/[^\d]/g, ''))}
                placeholder={homeCreatorCopy.machine.amountManual}
                aria-label={homeCreatorCopy.machine.amountManual}
                data-testid="home-amount-manual"
                className="h-11 flex-1 rounded-[10px] border bg-white px-3 font-mono text-[14px] outline-none"
                style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
              />
              <button
                type="button"
                onClick={() => {
                  const next = manualAmount(Number(manual));
                  if (next) {
                    onAmountChange(next);
                    setManual('');
                  }
                }}
                disabled={manual.trim() === ''}
                data-testid="home-amount-manual-apply"
                className={cn(
                  'h-11 shrink-0 rounded-full border px-4 text-[13px]',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40 disabled:opacity-40',
                )}
                style={{ borderColor: 'var(--g-line)', color: 'var(--g-ink)' }}
              >
                {homeCreatorCopy.machine.done}
              </button>
            </div>

            {guidance && !guidance.withinSingleContainer ? (
              <p
                className="mt-2 text-[12px]"
                data-testid="home-capacity-guidance"
                style={{ color: 'var(--g-text-muted)' }}
              >
                {amount?.totalGrams} {homeCreatorCopy.recipe.grams} · {guidance.containers}{' '}
                {homeCreatorCopy.machine.containers}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onDone}
            data-testid="home-machine-done"
            className="mt-8 inline-flex min-h-[52px] w-full items-center justify-center rounded-full px-6 text-[15px] font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
            style={{ background: 'var(--g-ink)', color: '#ffffff' }}
          >
            {homeCreatorCopy.machine.done}
          </button>
        </>
      )}
    </HomeSection>
  );
}
