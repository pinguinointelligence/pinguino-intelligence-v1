/**
 * THE batch process presentation (DESIGN V3.0 IV D–I, II/III, XIII, §13–14) — ONE
 * implementation for every host: HOME production now, the Produkcja area („Partie”,
 * Etap 2) and PRO later. „Produkcja · krok X z N”, the recipe name, the step bar, the
 * numbered steps of the preparation plan with the one being done open, the weighed rows
 * with the ✓ at the right edge, „Coś poszło nie tak?”, the thumb-zone dock with ONE black
 * action, and the „Korekta partii” / „Co się stało?” sheets.
 *
 * It reads a `ProductionProcessController` and writes nothing itself. The host brings its
 * frame: the way back, a host action beside „Coś poszło nie tak?” (HOME: „Zapisz”), and
 * the layer its sheets open in.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { educationCopy } from '@/copy/education.pl';
import { PreparationIllustrationImage } from '@/features/education/PreparationIllustrationImage';
import { productionProgress, productionStepForGrams } from '../productionSession';
import { carbonatedProductsForRecipe } from '../productionDegassing';
import { productionProcessCopy as copy } from './productionProcessCopy';
import {
  formatProductionGrams,
  latestConfirmedLine,
  type ProductionProcessController,
} from './productionProcessSteps';
import {
  ProcessColumn,
  ProcessCurrentStep,
  ProcessDock,
  ProcessDoneSummary,
  ProcessFutureStep,
  ProcessNoMix,
  ProcessStepBar,
  ProcessStepBox,
  ProcessStepText,
  ProcessTick,
  ProcessWeighCurrent,
  ProcessWeighList,
  ProcessWeighRow,
} from './ProductionProcessParts';
import {
  ProcessCorrectionSheet,
  ProcessTroubleSheet,
  type ProcessSheetFrame,
} from './ProductionProcessSheets';

const GRAMS_EPSILON = 0.000_001;
/** A shown difference: the same 0.05 g the PRO row treats as exact. */
const SHOWN_DIFFERENCE_G = 0.05;

const signedGrams = (delta: number): string =>
  `${delta > 0 ? '+' : '−'}${formatProductionGrams(Math.abs(delta))}`;

export function ProductionProcess({
  controller,
  name,
  machineId,
  back,
  hostAction,
  sheetFrame,
  testId,
}: {
  controller: ProductionProcessController;
  name: string;
  /** The machine the batch runs on (for the machine step's evidence attribute). */
  machineId: string | null;
  /** The host's way back, above the eyebrow. */
  back: ReactNode;
  /** The host's action beside „Coś poszło nie tak?” (HOME: „Zapisz”). */
  hostAction?: ReactNode;
  sheetFrame: ProcessSheetFrame;
  testId: string;
}) {
  const { session, steps, currentIndex, allDone, pendingTopUps, correction, canReopen, error } =
    controller;
  const [openLineId, setOpenLineId] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [troubleOpen, setTroubleOpen] = useState(false);
  const troubleSuccessor = useRef<(() => HTMLElement | null) | null>(null);

  // A new step starts at the top of the frame (the design's „floor” reset).
  const shownStep = useRef<number | null>(null);
  useEffect(() => {
    if (shownStep.current !== null && shownStep.current !== currentIndex) {
      document.getElementById('preparation')?.scrollIntoView?.({ block: 'start' });
    }
    shownStep.current = currentIndex;
  }, [currentIndex]);

  const currentStep = steps[currentIndex] ?? null;
  const isLastStep = currentIndex === steps.length - 1;
  const lineById = new Map(
    [...session.lines, ...session.addonLines].map((line) => [line.lineId, line] as const),
  );
  const progress = productionProgress(session);
  const decisionNeeded = correction !== null;

  /* ---------- the latest deviation's outcome, on its row ---------- */
  const latestDeviated = latestConfirmedLine(
    session.lines.filter(
      (line) =>
        line.confirmed && Math.abs(line.physicalAddedGrams - line.plannedGrams) > GRAMS_EPSILON,
    ),
  );
  const decisionWord = session.lastDeviationDecision
    ? session.lastDeviationDecision.strategy === 'leave_as_is'
      ? copy.resultAccepted
      : copy.planCorrected
    : null;

  const confirmLine = (line: Parameters<typeof controller.confirmLine>[0]) => {
    controller.confirmLine(line);
    setOpenLineId(null);
  };
  const reopenLine = (line: Parameters<typeof controller.reopenLine>[0]) => {
    controller.reopenLine(line);
    setOpenLineId(line.lineId);
  };

  /* ---------- the current step ---------- */
  const stepNumber = currentIndex + 1;
  const total = steps.length;
  let body: ReactNode = null;
  let dock: { lead: string; detail: string; action: string; onAction: () => void } | null = null;
  let activeFieldLineId: string | null = null;

  if (currentStep?.kind === 'weigh') {
    const planLines = currentStep.lines.filter((planLine) => lineById.has(planLine.lineId));
    const topUps = currentStep.scope === 'base' ? pendingTopUps : [];
    const activeTopUp = topUps[0] ?? null;
    const unconfirmed = planLines.filter((planLine) => !lineById.get(planLine.lineId)!.confirmed);
    const activePlanLine = activeTopUp
      ? null
      : (unconfirmed.find((planLine) => planLine.lineId === openLineId) ?? unconfirmed[0] ?? null);
    const sharedInstruction =
      new Set(planLines.map((planLine) => planLine.instruction)).size === 1
        ? (planLines[0]?.instruction ?? null)
        : null;
    const remaining = unconfirmed.length + topUps.length;

    const rows: ReactNode[] = [];
    topUps.forEach((task, index) => {
      const current = index === 0;
      const delta = task.draftDeltaG - task.authorizedDeltaG;
      const row = (
        <ProcessWeighRow
          key={task.taskId}
          rowKey={task.taskId}
          name={task.ingredientName}
          sub={copy.topUpWeighed(formatProductionGrams(task.physicalBaselineG))}
          subTone={current ? 'current' : 'later'}
          grams={`+${formatProductionGrams(task.authorizedDeltaG)}`}
          emphasis={current}
          tick={
            <ProcessTick
              state={current ? 'current' : 'later'}
              label={copy.confirmAdded(task.ingredientName)}
              onClick={() => controller.confirmTopUp(task)}
              testId={`process-tick-${task.taskId}`}
            />
          }
        />
      );
      if (!current) {
        rows.push(row);
        return;
      }
      activeFieldLineId = task.taskId;
      rows.push(
        <ProcessWeighCurrent
          key={task.taskId}
          row={row}
          lineId={task.taskId}
          name={task.ingredientName}
          guidance={null}
          value={task.draftDeltaG}
          min={0}
          step={productionStepForGrams(task.authorizedDeltaG)}
          deviation={
            Math.abs(delta) > SHOWN_DIFFERENCE_G
              ? {
                  text: copy.difference(
                    signedGrams(delta),
                    formatProductionGrams(task.authorizedDeltaG),
                  ),
                  next: copy.differenceNext,
                }
              : null
          }
          onChange={(grams) => controller.setTopUpDraft(task, grams)}
          onTypingChange={setTyping}
        />,
      );
    });

    for (const planLine of planLines) {
      const line = lineById.get(planLine.lineId)!;
      if (line.confirmed) {
        const differs = Math.abs(line.physicalAddedGrams - line.plannedGrams) > GRAMS_EPSILON;
        const sub = differs
          ? [
              copy.addedAmount(formatProductionGrams(line.physicalAddedGrams)),
              latestDeviated?.lineId === line.lineId ? decisionWord : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : copy.added;
        rows.push(
          <ProcessWeighRow
            key={line.lineId}
            rowKey={line.lineId}
            name={line.name}
            sub={sub}
            subTone="done"
            grams={formatProductionGrams(line.physicalAddedGrams)}
            tick={
              <ProcessTick
                state="done"
                label={copy.reopenAdded(line.name)}
                onClick={canReopen ? () => reopenLine(line) : undefined}
                testId={`process-tick-${line.lineId}`}
              />
            }
          />,
        );
        continue;
      }
      const current = planLine.lineId === activePlanLine?.lineId;
      const correctionMode = line.recordCorrectionCount > 0;
      const row = (
        <ProcessWeighRow
          key={line.lineId}
          rowKey={line.lineId}
          name={line.name}
          sub={current ? (correctionMode ? copy.correctingRecord : copy.weighNow) : copy.later}
          subTone={current ? 'current' : 'later'}
          grams={formatProductionGrams(line.targetGrams)}
          emphasis={current}
          onOpen={current ? undefined : () => setOpenLineId(line.lineId)}
          tick={
            <ProcessTick
              state={current ? 'current' : 'later'}
              label={copy.confirmAdded(line.name)}
              onClick={() => confirmLine(line)}
              testId={`process-tick-${line.lineId}`}
            />
          }
        />
      );
      if (!current) {
        rows.push(row);
        continue;
      }
      activeFieldLineId = line.lineId;
      const delta = line.draftActualGrams - line.targetGrams;
      const ownInstruction =
        planLine.instruction !== sharedInstruction ? planLine.instruction : null;
      rows.push(
        <ProcessWeighCurrent
          key={line.lineId}
          row={row}
          lineId={line.lineId}
          name={line.name}
          guidance={
            ownInstruction || planLine.note ? (
              <p
                className="mb-2 text-[13px] leading-[1.4] text-[#3b3833]"
                data-testid="process-line-guidance"
              >
                {ownInstruction ? (
                  <span className="block font-semibold">{ownInstruction}</span>
                ) : null}
                {planLine.note ? (
                  <span className="block text-[#5f5a52]" data-testid="process-line-note">
                    {planLine.note}
                  </span>
                ) : null}
              </p>
            ) : null
          }
          value={line.draftActualGrams}
          min={correctionMode ? 0 : line.physicalAddedGrams}
          step={productionStepForGrams(line.targetGrams)}
          deviation={
            Math.abs(delta) > SHOWN_DIFFERENCE_G
              ? {
                  text: copy.difference(
                    signedGrams(delta),
                    formatProductionGrams(line.targetGrams),
                  ),
                  // Toppings never start a batch correction (they do not change the base).
                  next: currentStep.scope === 'base' ? copy.differenceNext : null,
                }
              : null
          }
          onChange={(grams) => controller.setLineDraft(line, grams)}
          onTypingChange={setTyping}
        />,
      );
    }

    body = (
      <div
        data-testid={currentStep.scope === 'addon' ? 'process-topping-step' : 'process-base-step'}
      >
        {/* H4-4: weighing and topping show their own owner image as soon as one is
            approved; until then the step stands on its text, as it does today. */}
        {currentStep.illustration ? (
          <PreparationIllustrationImage
            illustration={currentStep.illustration}
            sizes="168px"
            className="mb-3 w-full max-w-[168px]"
          />
        ) : null}
        <ProcessStepText text={sharedInstruction}>
          {currentStep.scope === 'addon' ? <ProcessNoMix /> : null}
        </ProcessStepText>
        <ProcessWeighList>{rows}</ProcessWeighList>
      </div>
    );

    if (activeTopUp) {
      dock = {
        lead: copy.dockNow(activeTopUp.ingredientName),
        detail: [
          copy.dockTopUp(formatProductionGrams(activeTopUp.authorizedDeltaG)),
          remaining > 1 ? copy.dockThen(remaining - 1) : copy.dockLastInStep,
        ].join(' · '),
        action: copy.next,
        onAction: () => controller.confirmTopUp(activeTopUp),
      };
    } else if (activePlanLine) {
      const line = lineById.get(activePlanLine.lineId)!;
      dock = {
        lead: copy.dockNow(line.name),
        detail: [
          copy.dockPlan(formatProductionGrams(line.targetGrams)),
          remaining > 1 ? copy.dockThen(remaining - 1) : copy.dockLastInStep,
        ].join(' · '),
        action: copy.next,
        onAction: () => confirmLine(line),
      };
    } else {
      dock = {
        lead: `${copy.dockStep(stepNumber, total)} · ${copy.dockWeighed}`,
        detail: currentStep.title,
        action: allDone ? copy.finish : copy.next,
        onAction: allDone ? controller.complete : () => undefined,
      };
    }
  } else if (currentStep) {
    const step = currentStep;
    if (step.kind === 'before') {
      body = (
        <div data-testid="process-before-start">
          <ProcessStepText text={step.details.join(' · ')} note={step.timing} />
        </div>
      );
    } else if (step.kind === 'degas') {
      body = (
        <div data-testid="process-degassing">
          <ProcessStepText text={copy.degasLead}>
            <ul className="mt-1 text-[14px] text-[#3b3833]">
              {carbonatedProductsForRecipe(session.plannedInput, session.plannedComposition).map(
                (product) => (
                  <li key={product.productId}>• {product.name}</li>
                ),
              )}
            </ul>
          </ProcessStepText>
        </div>
      );
    } else if (step.kind === 'heat') {
      body = (
        <div data-testid="process-heat-step">
          {/* H4-4: shown the moment an owner image for this step kind is approved. */}
          {step.illustration ? (
            <PreparationIllustrationImage
              illustration={step.illustration}
              sizes="168px"
              className="mb-3 w-full max-w-[168px]"
            />
          ) : null}
          <ProcessStepText text={step.details[0] ?? null} note={step.details.slice(1).join(' ')} />
          <ProcessStepBox testId="process-heat-products">
            <span>
              {educationCopy.preparation.heat.lead} {step.productNames.join(', ')}
            </span>
          </ProcessStepBox>
          {step.afterCoolingNames.length > 0 ? (
            <ProcessStepBox label={educationCopy.preparation.heat.afterCoolingTitle}>
              <span>{step.afterCoolingNames.join(', ')}</span>
            </ProcessStepBox>
          ) : null}
        </div>
      );
    } else {
      body = (
        <div data-testid="process-machine-step" data-machine-id={machineId ?? undefined}>
          {step.illustration ? (
            <PreparationIllustrationImage
              illustration={step.illustration}
              sizes="168px"
              className="mb-3 w-full max-w-[168px]"
            />
          ) : null}
          <ol className="mb-1 grid gap-1 px-1 text-[16px] leading-[1.3] font-semibold text-[var(--g-ink)]">
            {step.details.map((detail, index) => (
              <li key={`${index}:${detail}`}>
                {step.details.length > 1 ? `${index + 1}. ` : ''}
                {detail}
              </li>
            ))}
          </ol>
          {/* The shared plan decides which timing belongs here (a verified bowl pre-freeze
              was already its own step before start). */}
          {step.timing ? (
            <p className="px-1 text-[13px] leading-[1.4] text-[#5f5a52]">{step.timing}</p>
          ) : null}
          {step.asideNames.length > 0 ? (
            <ProcessStepBox tone="no-mix" testId="process-set-aside">
              <ProcessNoMix inBox />
              <span>{copy.setAside(step.asideNames.join(', '))}</span>
            </ProcessStepBox>
          ) : null}
        </div>
      );
    }
    dock = {
      lead: copy.dockStep(stepNumber, total),
      detail: step.title,
      action: isLastStep ? copy.finish : step.kind === 'degas' ? copy.degasDone : copy.next,
      onAction: () => {
        controller.finishStep(step);
        if (isLastStep) controller.complete();
      },
    };
  }

  const weighingRowId =
    currentStep?.kind === 'weigh' && activeFieldLineId !== null ? activeFieldLineId : null;
  /** „Zważyłem inną ilość”: the sheet closes onto the amount of the row being weighed. */
  const focusWeighedAmount = () => {
    troubleSuccessor.current = () =>
      weighingRowId === null
        ? null
        : document.querySelector<HTMLInputElement>(
            `[data-testid="process-field-${weighingRowId}"] input`,
          );
    setTroubleOpen(false);
  };

  return (
    <ProcessColumn testId={testId}>
      <div className="flex min-h-11 items-center">{back}</div>
      <p
        className="mt-2 text-[11px] leading-none font-bold tracking-[0.12em] text-[#a29d94] uppercase"
        data-testid="process-eyebrow"
      >
        {copy.eyebrow(stepNumber, total)}
      </p>
      <h2 className="mt-1.5 text-[24px] leading-[1.2] font-semibold tracking-[-0.02em] text-[var(--g-ink)]">
        {name}
      </h2>
      {progress.targetChanged ? (
        <p
          className="mt-1 text-[12.5px] leading-[1.3] text-[#65635f]"
          data-testid="process-batch-changed"
        >
          {copy.batchChanged(
            formatProductionGrams(progress.currentPlanMassG),
            formatProductionGrams(progress.originalTargetMassG),
          )}
        </p>
      ) : null}
      <ProcessStepBar total={total} current={currentIndex} />

      <ol className="grid gap-2" data-testid="process-steps">
        {currentIndex > 0 ? (
          <ProcessDoneSummary names={steps.slice(0, currentIndex).map((step) => step.title)} />
        ) : null}
        {currentStep ? (
          <ProcessCurrentStep
            number={stepNumber}
            total={total}
            title={currentStep.title}
            kind={currentStep.kind}
          >
            {body}
          </ProcessCurrentStep>
        ) : null}
        {steps.slice(currentIndex + 1).map((step, offset) => (
          <ProcessFutureStep
            key={step.id}
            number={currentIndex + offset + 2}
            title={step.title}
            detail={step.kind === 'weigh' ? step.lines.map((line) => line.name).join(' · ') : null}
          />
        ))}
      </ol>

      <div className="mt-4 flex items-center justify-between gap-2.5">
        <button
          type="button"
          onClick={() => setTroubleOpen(true)}
          data-testid="process-trouble-open"
          className="rounded-full bg-white px-3.5 py-2.5 text-[13.5px] leading-none font-semibold text-[#3b3833] shadow-[inset_0_0_0_1px_#e4e0d9] focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/40"
        >
          {copy.trouble}
        </button>
        {hostAction}
      </div>

      {error ? (
        <p className="mt-4 text-sm" role="alert" style={{ color: 'var(--g-attention-ink)' }}>
          {error}
        </p>
      ) : null}

      {dock ? (
        <ProcessDock
          lead={dock.lead}
          detail={dock.detail}
          action={dock.action}
          onAction={dock.onAction}
          disabled={decisionNeeded}
          typing={typing}
        />
      ) : null}

      {correction ? (
        <ProcessCorrectionSheet
          frame={sheetFrame}
          correction={correction}
          onSelect={controller.selectDecision}
          onApply={controller.applyDecision}
          onBack={() => {
            const reopened = controller.backFromCorrection();
            if (reopened) setOpenLineId(reopened);
          }}
        />
      ) : null}

      {troubleOpen && !decisionNeeded ? (
        <ProcessTroubleSheet
          frame={sheetFrame}
          onWeighedDifferent={weighingRowId !== null ? focusWeighedAmount : null}
          onBack={() => {
            troubleSuccessor.current = null;
            setTroubleOpen(false);
          }}
          returnFocus={() => troubleSuccessor.current?.() ?? null}
        />
      ) : null}
    </ProcessColumn>
  );
}
