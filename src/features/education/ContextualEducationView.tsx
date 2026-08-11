import { useEffect, useRef, useState } from 'react';
import type { RecipeInput } from '@/engine';
import { educationCopy as copy } from '@/copy/education.pl';
import {
  FRESH_GELATO_EDUCATION,
  availableMachineEducationCategories,
  contextualEducationPrompts,
  genericMachineEducation,
  ingredientExample,
  machineEducationById,
  microIngredient,
  topLevelEducationOrder,
  verifiedPlantOriginsForRecipe,
  type EducationAudience,
  type EducationLessonId,
  type HeatProcessClassification,
  type IngredientExampleId,
  type MachineEducationCategory,
  type MicroIngredientId,
  type RecipeProcessEvidence,
} from '.';
import { processReasonText } from './processReasonText';
import { useRecipeProcessRuntime } from './useRecipeProcessRuntime';

type ActiveLesson = { id: EducationLessonId; focus?: string } | null;

const entryCopy = {
  ingredients: copy.entries.ingredients,
  sugar: copy.entries.behavior,
  process: copy.entries.process,
} as const;

function ArrowChain({ steps }: { steps: readonly string[] }) {
  const heat = steps.some((step) => step.toLocaleLowerCase('pl-PL').includes('podgrzej'));
  const phases = heat
    ? ['Przygotuj', 'Podgrzej', 'Schłodź', 'Mroź']
    : ['Przygotuj', 'Wlej', 'Mroź', 'Serwuj'];
  return (
    <ol className="relative grid gap-0 pl-2" data-testid="education-causal-chain">
      {steps.map((step, index) => (
        <li
          key={`${step}-${index}`}
          className="relative grid grid-cols-[2rem_1fr] gap-3 pb-3 last:pb-0"
        >
          {index < steps.length - 1 ? (
            <span className="absolute bottom-0 left-[0.94rem] top-6 w-px bg-gold/35" aria-hidden />
          ) : null}
          <span className="relative z-10 grid size-8 place-items-center rounded-full border border-gold/35 bg-education-ivory font-mono text-xs font-semibold text-gold-deep shadow-pro-sm">
            {index + 1}
          </span>
          <span className="rounded-[18px] border border-ink/9 bg-white px-3 py-3 shadow-pro-sm">
            <strong className="block text-sm text-ink">
              {phases[index] ?? `Etap ${index + 1}`}
            </strong>
            <span className="mt-1 block text-xs leading-relaxed text-stone-600">{step}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function InlineChain({ steps }: { steps: readonly string[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5" data-testid="education-inline-chain">
      {steps.map((step, index) => (
        <li key={`${step}-${index}`} className="flex items-center gap-1.5">
          <span className="rounded-lg border border-ink/10 bg-white px-2.5 py-2 text-xs leading-snug text-ink">
            {step}
          </span>
          {index < steps.length - 1 ? (
            <span className="text-xs text-stone-400" aria-hidden>
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function useLessonTop(step: number) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'start' });
  }, [step]);
  return ref;
}

function LessonProgress({ step, total }: { step: number; total: number }) {
  return (
    <div className="mb-3 flex items-center justify-between" aria-label={`${step + 1} / ${total}`}>
      <span className="font-mono text-xs tabular-nums text-stone-600">
        {step + 1} / {total}
      </span>
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className={`h-1 w-6 ${index === step ? 'bg-ink' : 'bg-stone-200'}`} />
        ))}
      </span>
    </div>
  );
}

function DeckControls({
  step,
  total,
  onStep,
  canContinue = true,
}: {
  step: number;
  total: number;
  onStep: (step: number) => void;
  canContinue?: boolean;
}) {
  return (
    <div className="mt-4 flex items-center justify-between gap-2 border-t border-ink/10 pt-3">
      <button
        type="button"
        onClick={() => onStep(Math.max(0, step - 1))}
        disabled={step === 0}
        className="min-h-11 rounded-lg px-3 text-xs font-semibold text-stone-600 disabled:invisible"
      >
        {copy.lesson.previous}
      </button>
      {step < total - 1 ? (
        <button
          type="button"
          onClick={() => onStep(step + 1)}
          disabled={!canContinue}
          title={!canContinue ? copy.process.confirmations.required : undefined}
          className="min-h-11 rounded-lg bg-ink px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-35"
        >
          {copy.lesson.next}
        </button>
      ) : null}
    </div>
  );
}

function RelativeDots({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${label}: ${value} / 3`}>
      {Array.from({ length: 3 }, (_, index) => (
        <span
          key={index}
          className={`size-2 rounded-full border border-ink/20 ${index < value ? 'bg-ink' : 'bg-white'}`}
          aria-hidden
        />
      ))}
    </span>
  );
}

function SugarLesson() {
  const [step, setStep] = useState(0);
  const lessonRef = useLessonTop(step);
  return (
    <section ref={lessonRef} data-testid="sugar-lesson">
      <LessonProgress step={step} total={3} />
      {step === 0 ? (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">{copy.sugar.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">{copy.sugar.intro}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="border border-ink/10 bg-paper p-3">
              <h3 className="text-xs font-semibold text-ink">{copy.sugar.lessTitle}</h3>
              <div className="mt-2">
                <ArrowChain steps={copy.sugar.lessSteps} />
              </div>
            </div>
            <div className="border border-ink/10 bg-education-ivory p-3">
              <h3 className="text-xs font-semibold text-ink">{copy.sugar.moreTitle}</h3>
              <div className="mt-2">
                <ArrowChain steps={copy.sugar.moreSteps} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {step === 1 ? (
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-ink">
            {copy.sugar.comparisonTitle}
          </h2>
          <p className="mt-2 text-xs leading-relaxed text-stone-500">{copy.sugar.comparisonLead}</p>
          <div className="mt-3 divide-y divide-ink/10 border-y border-ink/10">
            {copy.sugar.rows.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_auto] gap-3 py-2.5">
                <strong className="text-xs text-ink">{row.name}</strong>
                <span className="grid gap-1 text-xs text-stone-600">
                  <span className="flex items-center justify-between gap-3">
                    {copy.sugar.scaleSweetness}
                    <RelativeDots value={row.sweetness} label={copy.sugar.scaleSweetness} />
                  </span>
                  <span className="flex items-center justify-between gap-3">
                    {copy.sugar.scaleSoftening}
                    <RelativeDots value={row.softening} label={copy.sugar.scaleSoftening} />
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {step === 2 ? (
        <div>
          <h2 className="text-xl font-semibold leading-tight text-ink">{copy.sugar.conclusion}</h2>
          <details className="mt-4 border border-ink/10 bg-paper p-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-ink">
              {copy.lesson.technical}
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-stone-600">
              {copy.sugar.technicalCopy}
            </p>
          </details>
        </div>
      ) : null}
      <DeckControls step={step} total={3} onStep={setStep} />
    </section>
  );
}

function IngredientExamples({ initialFocus }: { initialFocus?: string }) {
  const initialExample: IngredientExampleId =
    initialFocus === 'milk' || initialFocus === 'pistachio' ? initialFocus : 'mango';
  const [exampleId, setExampleId] = useState<IngredientExampleId>(initialExample);
  const example = ingredientExample(exampleId);
  const [effectId, setEffectId] = useState<string>(example.effects[0].id);
  const effect =
    example.effects.find((candidate) => candidate.id === effectId) ?? example.effects[0];

  const chooseExample = (next: IngredientExampleId) => {
    setExampleId(next);
    setEffectId(ingredientExample(next).effects[0].id);
  };

  return (
    <div data-testid="ingredient-causal-lesson">
      <h2 className="text-xl font-semibold tracking-tight text-ink">{copy.ingredient.title}</h2>
      <p className="mt-1 text-xs text-stone-500">{copy.ingredient.select}</p>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {(Object.keys(copy.ingredient.examples) as IngredientExampleId[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => chooseExample(id)}
            aria-pressed={id === exampleId}
            className={`min-h-11 rounded-lg border px-2 py-2 text-xs font-semibold ${id === exampleId ? 'border-ink bg-ink text-white' : 'border-ink/10 bg-white text-ink'}`}
          >
            {ingredientExample(id).name}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {example.effects.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            onClick={() => setEffectId(candidate.id)}
            aria-pressed={candidate.id === effect.id}
            data-testid="ingredient-effect-chip"
            className={`min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold ${candidate.id === effect.id ? 'border-gold bg-education-ivory text-ink' : 'border-ink/10 bg-white text-stone-600'}`}
          >
            {candidate.label}
          </button>
        ))}
      </div>
      <div className="mt-3 border-l-2 border-gold bg-education-ivory/70 p-3">
        <ArrowChain steps={effect.steps} />
      </div>
    </div>
  );
}

function MicroIngredients({ initialFocus }: { initialFocus?: string }) {
  const initial: MicroIngredientId =
    initialFocus === 'inulin' || initialFocus === 'salt' ? initialFocus : 'stabilizer';
  const [active, setActive] = useState<MicroIngredientId>(initial);
  const item = microIngredient(active);
  return (
    <div data-testid="micro-ingredient-lesson">
      <h2 className="text-xl font-semibold tracking-tight text-ink">{copy.micro.title}</h2>
      <p className="mt-1 text-xs text-stone-500">{copy.micro.select}</p>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {(Object.keys(copy.micro.items) as MicroIngredientId[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setActive(id)}
            aria-pressed={id === active}
            className={`min-h-11 rounded-lg border px-2 py-2 text-xs font-semibold ${id === active ? 'border-ink bg-ink text-white' : 'border-ink/10 bg-white text-ink'}`}
          >
            {microIngredient(id).name}
          </button>
        ))}
      </div>
      <div className="mt-4 border border-ink/10 bg-paper p-4">
        <p className="text-base font-semibold text-ink">{item.lead}</p>
        <p className="mt-2 text-xs leading-relaxed text-stone-600">{item.detail}</p>
      </div>
    </div>
  );
}

function ENumberLesson({ input }: { input: RecipeInput }) {
  const origins = verifiedPlantOriginsForRecipe(input);
  return (
    <div data-testid="stabilizer-e-number-lesson">
      <h2 className="text-xl font-semibold tracking-tight text-ink">{copy.micro.eNumberTitle}</h2>
      <p className="mt-2 text-sm leading-relaxed text-stone-600">{copy.micro.eNumberLead}</p>
      {origins.length > 0 ? (
        <div className="mt-4 space-y-2">
          {origins.map((origin) => (
            <div
              key={`${origin.eNumber}-${origin.identity}`}
              className="border border-ink/10 bg-paper p-3"
              data-testid="plant-origin-claim"
            >
              <span className="text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase">
                {copy.micro.plantOrigin}
              </span>
              <p className="mt-1 text-sm font-semibold text-ink">
                {origin.identity} · {origin.eNumber}
              </p>
              <p className="mt-1 text-xs text-stone-600">{origin.sourcePlant}</p>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-4 border border-nonprod/30 border-l-2 border-l-nonprod bg-nonprod/[0.035] p-3">
        <span
          className="text-xs font-semibold tracking-[0.04em] text-nonprod uppercase"
          data-readiness={copy.micro.futureFormula}
        >
          {copy.micro.futureFormula}
        </span>
        <p className="mt-1 text-xs text-stone-600">{copy.micro.futureFormulaNote}</p>
      </div>
    </div>
  );
}

function IngredientsLesson({ input, initialFocus }: { input: RecipeInput; initialFocus?: string }) {
  const initialStep = initialFocus === 'stabilizer' || initialFocus === 'inulin' ? 1 : 0;
  const [step, setStep] = useState(initialStep);
  const lessonRef = useLessonTop(step);
  return (
    <section ref={lessonRef}>
      <LessonProgress step={step} total={3} />
      {step === 0 ? <IngredientExamples initialFocus={initialFocus} /> : null}
      {step === 1 ? <MicroIngredients initialFocus={initialFocus} /> : null}
      {step === 2 ? <ENumberLesson input={input} /> : null}
      <DeckControls step={step} total={3} onStep={setStep} />
    </section>
  );
}

function ProcessStatus({
  classification,
  ingredientNamesById,
  confirmed,
  onConfirm,
}: {
  classification: HeatProcessClassification;
  ingredientNamesById: ReadonlyMap<string, string>;
  confirmed: boolean;
  onConfirm: () => void;
}) {
  const statusCopy = copy.process.statuses[classification.status];
  const heat = classification.status.startsWith('heat_required');
  const cold = classification.status === 'cold_process_ok';
  return (
    <div data-testid="process-classification" data-process-status={classification.status}>
      <h2 className="text-xl font-semibold tracking-tight text-ink">{copy.process.question}</h2>
      <div
        className={`mt-3 rounded-[20px] border border-l-4 p-4 shadow-pro-sm ${classification.status === 'unknown' ? 'border-nonprod/30 border-l-nonprod bg-nonprod/[0.035]' : 'border-ink/10 border-l-gold bg-paper'}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-base text-ink">{statusCopy.title}</strong>
          {classification.status === 'unknown' ? (
            <span
              className="text-xs font-semibold tracking-[0.04em] text-nonprod uppercase"
              data-readiness={copy.process.dataMissing}
            >
              {copy.process.dataMissing}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-stone-600">{statusCopy.note}</p>
        {classification.reasons.length > 0 ? (
          <ul className="mt-3 space-y-2 border-t border-ink/10 pt-3">
            {classification.reasons.map((reason, index) => (
              <li
                key={`${reason.type}-${reason.ingredientId ?? index}`}
                className="text-xs text-stone-600"
              >
                <strong className="text-ink">{copy.process.reasonLabels[reason.type]}:</strong>{' '}
                {processReasonText(reason.ingredientId, reason.explanation, ingredientNamesById)}
              </li>
            ))}
            {classification.status === 'unknown'
              ? classification.affectedIngredientIds.slice(1).map((ingredientId) => (
                  <li key={ingredientId} className="text-xs text-stone-600">
                    <strong className="text-ink">{copy.process.reasonLabels.missing_data}:</strong>{' '}
                    {ingredientNamesById.get(ingredientId) ?? ingredientId}
                  </li>
                ))
              : null}
          </ul>
        ) : null}
      </div>
      {cold || heat ? (
        <div className="mt-3">
          <ArrowChain steps={cold ? copy.process.coldSteps : copy.process.heatSteps} />
        </div>
      ) : null}
      {heat ? (
        <p className="mt-3 rounded-[16px] border border-ink/10 p-3 text-xs leading-relaxed text-stone-600">
          {copy.process.exactParametersMissing}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onConfirm}
        aria-pressed={confirmed}
        data-testid="process-path-confirm"
        className={`mt-3 min-h-11 w-full rounded-[14px] border px-3 py-2 text-xs font-semibold ${confirmed ? 'border-status-ok/40 bg-status-ok/[0.06] text-status-ok' : 'border-ink bg-ink text-white shadow-pro-sm'}`}
      >
        {confirmed
          ? copy.process.confirmations.accepted
          : classification.status === 'cold_process_ok'
            ? copy.process.confirmations.cold
            : classification.status === 'unknown'
              ? copy.process.confirmations.unknown
              : copy.process.confirmations.heat}
      </button>
    </div>
  );
}

function MachineGuide({ machineId }: { machineId: string | null }) {
  const selectedMachine = machineEducationById(machineId);
  const initialCategory = selectedMachine?.category ?? 'fresh_gelato';
  const [category, setCategory] = useState<MachineEducationCategory>(initialCategory);
  const guide =
    selectedMachine !== null && selectedMachine.category === category
      ? selectedMachine
      : genericMachineEducation(category);
  return (
    <div data-testid="machine-guide">
      <h2 className="text-xl font-semibold tracking-tight text-ink">{copy.machine.title}</h2>
      {machineId === null ? (
        <p className="mt-1 text-xs text-stone-500">{copy.machine.unknownSelection}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {availableMachineEducationCategories().map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setCategory(id)}
            aria-pressed={category === id}
            className={`min-h-11 rounded-lg border px-2.5 py-2 text-xs font-semibold ${category === id ? 'border-ink bg-ink text-white' : 'border-ink/10 bg-white text-ink'}`}
          >
            {genericMachineEducation(id).title}
          </button>
        ))}
      </div>
      <div
        className="mt-3 border border-ink/10 bg-paper p-3"
        data-testid={
          guide === FRESH_GELATO_EDUCATION || category === 'fresh_gelato'
            ? 'fresh-gelato-guide'
            : undefined
        }
      >
        <h3 className="text-sm font-semibold text-ink">{guide.title}</h3>
        <div className="mt-2">
          <InlineChain steps={guide.steps} />
        </div>
        {guide.timing.status === 'verified' ? (
          <p className="mt-3 text-xs font-semibold text-ink">{guide.timing.text}</p>
        ) : (
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-ink/10 pt-2">
            <p className="text-xs text-stone-600">{guide.timing.text}</p>
            <span
              className="shrink-0 text-xs font-semibold tracking-[0.04em] text-nonprod uppercase"
              data-testid="timing-readiness"
              data-readiness={copy.machine.timingPending}
            >
              {copy.machine.timingPending}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function ProcessComparison() {
  const [choice, setChoice] = useState<(typeof copy.machine.timingChoices)[number]>(
    copy.machine.timingChoices[0],
  );
  const processPaths = [
    { id: 'classic', label: copy.machine.comparisonLabels[0], steps: copy.machine.classic },
    { id: 'fresh', label: copy.machine.comparisonLabels[1], steps: copy.machine.fresh },
    { id: 'home', label: copy.machine.comparisonLabels[2], steps: copy.machine.home },
  ] as const;
  const [activePath, setActivePath] = useState<(typeof processPaths)[number]['id']>('classic');
  const selectedPath = processPaths.find((path) => path.id === activePath) ?? processPaths[0];
  return (
    <div data-testid="machine-process-comparison">
      <h2 className="text-xl font-semibold tracking-tight text-ink">
        {copy.machine.comparisonTitle}
      </h2>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {processPaths.map((path) => (
          <button
            key={path.id}
            type="button"
            onClick={() => setActivePath(path.id)}
            aria-pressed={activePath === path.id}
            className={`min-h-11 rounded-lg border px-1.5 py-2 text-xs font-semibold tracking-[0.03em] uppercase ${activePath === path.id ? 'border-ink bg-ink text-white' : 'border-ink/10 bg-white text-ink'}`}
          >
            {path.label}
          </button>
        ))}
      </div>
      <div className="mt-2 border border-ink/10 bg-paper p-3">
        <InlineChain steps={selectedPath.steps} />
      </div>
      <div className="mt-4 border border-nonprod/30 border-l-2 border-l-nonprod bg-nonprod/[0.035] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">{copy.machine.timingQuestion}</h3>
          <span
            className="text-xs font-semibold tracking-[0.04em] text-nonprod uppercase"
            data-readiness={copy.machine.timingPending}
          >
            {copy.machine.timingPending}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {copy.machine.timingChoices.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setChoice(item)}
              aria-pressed={choice === item}
              className={`min-h-11 rounded-lg border px-1.5 py-2 text-xs font-semibold ${choice === item ? 'border-nonprod bg-white text-nonprod' : 'border-ink/10 bg-white text-stone-600'}`}
            >
              {item}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-600">{copy.machine.timingPendingNote}</p>
      </div>
    </div>
  );
}

function ProcessLesson({
  classification,
  ingredientNamesById,
  machineId,
}: {
  classification: HeatProcessClassification;
  ingredientNamesById: ReadonlyMap<string, string>;
  machineId: string | null;
}) {
  const [step, setStep] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const lessonRef = useLessonTop(step);
  return (
    <section ref={lessonRef}>
      <LessonProgress step={step} total={3} />
      {step === 0 ? (
        <ProcessStatus
          classification={classification}
          ingredientNamesById={ingredientNamesById}
          confirmed={confirmed}
          onConfirm={() => setConfirmed(true)}
        />
      ) : null}
      {step === 1 ? <MachineGuide machineId={machineId} /> : null}
      {step === 2 ? <ProcessComparison /> : null}
      <DeckControls step={step} total={3} onStep={setStep} canContinue={step !== 0 || confirmed} />
    </section>
  );
}

function EducationHub({
  input,
  audience,
  onOpen,
}: {
  input: RecipeInput;
  audience: EducationAudience;
  onOpen: (lesson: ActiveLesson) => void;
}) {
  const prompts = contextualEducationPrompts(input);
  return (
    <div data-testid="contextual-learning-hub">
      <h1 className="text-xl font-semibold leading-tight tracking-tight text-ink">
        {copy.heading}
      </h1>
      <p className="mt-4 text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase">
        {copy.contextLabel}
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {prompts.map((prompt) => (
          <button
            key={prompt.id}
            type="button"
            onClick={() => onOpen({ id: prompt.lessonId, focus: prompt.focus })}
            className="min-h-24 border border-ink/10 bg-paper p-3 text-left hover:border-ink/30"
            data-testid="contextual-card"
          >
            <strong className="block text-xs leading-snug text-ink">{prompt.title}</strong>
            <span className="mt-1 block text-xs leading-relaxed text-stone-600">{prompt.note}</span>
          </button>
        ))}
      </div>
      <p className="mt-5 text-xs font-semibold tracking-[0.04em] text-stone-600 uppercase">
        {copy.entriesLabel}
      </p>
      <div className="mt-2 divide-y divide-ink/10 border-y border-ink/10">
        {topLevelEducationOrder(audience).map((id) => {
          const entry = entryCopy[id as keyof typeof entryCopy];
          return (
            <button
              key={id}
              type="button"
              onClick={() => onOpen({ id })}
              className="flex min-h-14 w-full items-center justify-between gap-3 px-1 py-2 text-left"
              data-testid="education-entry"
            >
              <span>
                <strong className="block text-sm text-ink">{entry.title}</strong>
                <span className="mt-0.5 block text-xs text-stone-600">{entry.note}</span>
              </span>
              <span className="text-lg text-stone-400" aria-hidden>
                ›
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ContextualEducationView({
  input,
  machineId = null,
  audience = 'pro',
  initialLesson,
  processEvidence,
  onBack,
}: {
  input: RecipeInput;
  machineId?: string | null;
  audience?: EducationAudience;
  initialLesson?: EducationLessonId;
  processEvidence?: readonly RecipeProcessEvidence[];
  onBack: () => void;
}) {
  const [active, setActive] = useState<ActiveLesson>(() =>
    initialLesson === undefined ? null : { id: initialLesson },
  );
  const processRuntime = useRecipeProcessRuntime(input, processEvidence);
  const directInitialLesson =
    initialLesson !== undefined && active?.id === initialLesson && active.focus === undefined;

  return (
    <div
      className="mx-auto min-h-full w-full max-w-none bg-[#f7f5f0] p-4 text-ink sm:p-5"
      data-testid="profile-education-view"
    >
      <button
        type="button"
        onClick={active === null || directInitialLesson ? onBack : () => setActive(null)}
        className="mb-4 min-h-11 rounded-lg px-2 text-xs font-semibold text-ink underline underline-offset-4"
      >
        {active === null || directInitialLesson ? copy.backToRecipe : copy.backToHub}
      </button>
      {active === null ? (
        <EducationHub input={input} audience={audience} onOpen={setActive} />
      ) : active.id === 'sugar' ? (
        <SugarLesson />
      ) : active.id === 'ingredients' || active.id === 'micro' ? (
        <IngredientsLesson
          key={`${active.id}-${active.focus ?? ''}`}
          input={input}
          initialFocus={active.focus}
        />
      ) : (
        <ProcessLesson
          key={processRuntime.classification.status}
          classification={processRuntime.classification}
          ingredientNamesById={processRuntime.ingredientNamesById}
          machineId={machineId}
        />
      )}
    </div>
  );
}
