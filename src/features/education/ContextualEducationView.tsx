import { useState } from 'react';
import type { RecipeInput } from '@/engine';
import { Button } from '@/components/ui/Button';
import { educationCopy as copy } from '@/copy/education.pl';
import {
  FRESH_GELATO_EDUCATION,
  machineEducationById,
  type EducationAudience,
  type EducationLessonId,
  type RecipeProcessEvidence,
} from '.';
import { processReasonText } from './processReasonText';
import { useRecipeProcessRuntime } from './useRecipeProcessRuntime';

type KnowledgeView = 'summary' | 'process' | 'advanced';

interface RecipeIngredientFact {
  id: string;
  name: string;
  summary: string;
  detail: string;
}

const positive = (value: number | null | undefined): boolean => (value ?? 0) > 0;

/** Qualitative education derived only from the open recipe's structured facts. */
function recipeIngredientFacts(input: RecipeInput): RecipeIngredientFact[] {
  return input.items
    .filter((item) => item.planned_grams > 0)
    .map((item) => {
      const ingredient = item.ingredient;
      const composition = ingredient.composition;
      if (ingredient.category === 'fruit') {
        return {
          id: item.id,
          name: ingredient.name,
          summary: 'Owoc wnosi wodę i naturalne cukry do tej receptury.',
          detail: positive(composition.fiber_percent)
            ? 'Zawiera też błonnik. Wszystkie te składniki wpływają na odczucie i ilość zamarzającej wody.'
            : 'Ich znaczenie jest oceniane razem z pozostałymi składnikami receptury.',
        };
      }
      if (ingredient.category === 'dairy' || ingredient.flags?.is_dairy === true) {
        const contributions = [
          positive(composition.water_percent) ? 'wodę' : null,
          positive(composition.lactose_percent) ? 'laktozę' : null,
          positive(composition.protein_percent) ? 'białko' : null,
          positive(composition.fat_percent) ? 'tłuszcz' : null,
        ].filter((value): value is string => value !== null);
        return {
          id: item.id,
          name: ingredient.name,
          summary: `Ten produkt mleczny wnosi ${contributions.join(', ') || 'części stałe'} do mieszanki.`,
          detail: 'Te elementy wspólnie wpływają na strukturę i odczucie gotowego produktu.',
        };
      }
      if (ingredient.category === 'sugar') {
        return {
          id: item.id,
          name: ingredient.name,
          summary: 'Ten cukier wpływa jednocześnie na słodycz i zamarzanie wody.',
          detail:
            'Różne cukry nie działają identycznie, dlatego receptura ocenia je jako część całej mieszanki.',
        };
      }
      if (ingredient.category === 'stabilizer') {
        return {
          id: item.id,
          name: ingredient.name,
          summary: 'Mała ilość stabilizatora pomaga kontrolować wodę i kryształki lodu.',
          detail:
            'Dokładne działanie zależy od konkretnego produktu i potwierdzonego procesu przygotowania.',
        };
      }
      if (positive(composition.fat_percent) || positive(composition.protein_percent)) {
        return {
          id: item.id,
          name: ingredient.name,
          summary: 'Ten składnik wnosi tłuszcz lub białko, które budują części stałe mieszanki.',
          detail: 'Ich efekt jest oceniany w kontekście całej receptury, nie osobno.',
        };
      }
      return {
        id: item.id,
        name: ingredient.name,
        summary: 'Ten składnik jest częścią bilansu wody i części stałych receptury.',
        detail: 'Gellatti ocenia jego zatwierdzone dane razem z pozostałymi składnikami.',
      };
    });
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

function KnowledgeHome({ onOpen }: { onOpen: (view: KnowledgeView) => void }) {
  const entries: readonly { id: KnowledgeView; title: string; note: string }[] = [
    {
      id: 'summary',
      title: 'Twoja receptura w skrócie',
      note: 'Najważniejsze fakty o składnikach, które są teraz w recepturze.',
    },
    {
      id: 'process',
      title: 'Jak ją przygotować',
      note: 'Proces dla wybranego profilu i maszyny — bez ponownego wybierania urządzenia.',
    },
    {
      id: 'advanced',
      title: 'Dowiedz się więcej',
      note: 'Woda, cukry, tłuszcz i inne tematy istotne dla tej mieszanki.',
    },
  ];
  return (
    <div data-testid="contextual-learning-hub">
      <p className="text-[10px] font-semibold tracking-[0.1em] text-stone-500 uppercase">
        Wiedza o recepturze
      </p>
      <h1 className="mt-1 text-xl font-semibold leading-tight tracking-tight text-ink">
        Odpowiedź najpierw. Szczegóły wtedy, gdy ich potrzebujesz.
      </h1>
      <div className="mt-4 divide-y divide-ink/10 border-y border-ink/10">
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => onOpen(entry.id)}
            className="pro-focus-ring flex min-h-16 w-full items-center justify-between gap-4 px-1 py-3 text-left"
            data-testid="education-entry"
          >
            <span>
              <strong className="block text-sm text-ink">{entry.title}</strong>
              <span className="mt-0.5 block text-xs leading-relaxed text-stone-600">
                {entry.note}
              </span>
            </span>
            <span aria-hidden className="text-lg text-stone-400">
              ›
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RecipeSummary({ input }: { input: RecipeInput }) {
  const facts = recipeIngredientFacts(input);
  return (
    <section data-testid="actual-recipe-knowledge">
      <h2 className="text-xl font-semibold tracking-tight text-ink">Twoja receptura w skrócie</h2>
      <p className="mt-1 text-xs leading-relaxed text-stone-600">
        Poniżej są składniki z otwartej receptury — bez przykładowych smaków i bez zgadywania.
      </p>
      <div className="mt-4 divide-y divide-ink/10 border-y border-ink/10">
        {facts.map((fact) => (
          <article key={fact.id} className="py-3">
            <h3 className="text-sm font-semibold text-ink">{fact.name}</h3>
            <p className="mt-1 text-xs leading-relaxed text-stone-700">{fact.summary}</p>
            <details className="mt-1.5">
              <summary className="pro-focus-ring inline-flex min-h-10 cursor-pointer items-center text-xs font-semibold text-stone-600 underline underline-offset-4">
                Dowiedz się więcej
              </summary>
              <p className="pb-1 text-xs leading-relaxed text-stone-600">{fact.detail}</p>
            </details>
          </article>
        ))}
      </div>
      <p className="mt-4 rounded-[12px] bg-education-ivory/65 px-3 py-2.5 text-xs leading-relaxed text-stone-700">
        Temperatura serwowania {input.target_temperature_c}°C zmienia wymagany bilans zamarzania.
        Zmiana ustawienia wymaga ponownego przeliczenia receptury.
      </p>
    </section>
  );
}

function ProcessKnowledge({
  input,
  machineId,
  machineLabel,
  processEvidence,
}: {
  input: RecipeInput;
  machineId: string | null;
  machineLabel: string | null;
  processEvidence?: readonly RecipeProcessEvidence[];
}) {
  const runtime = useRecipeProcessRuntime(input, processEvidence);
  const classification = runtime.classification;
  const statusCopy = copy.process.statuses[classification.status];
  const heat = classification.status.startsWith('heat_required');
  const cold = classification.status === 'cold_process_ok';
  const guide = machineEducationById(machineId) ?? FRESH_GELATO_EDUCATION;
  const steps = heat ? copy.process.heatSteps : cold ? copy.process.coldSteps : guide.steps;

  return (
    <section data-testid="process-knowledge" data-process-status={classification.status}>
      <h2 className="text-xl font-semibold tracking-tight text-ink">Jak ją przygotować</h2>
      <div className="mt-3 rounded-[12px] bg-education-ivory/65 px-3 py-2.5">
        <p className="text-[10px] font-semibold tracking-[0.1em] text-stone-500 uppercase">
          Proces tej receptury
        </p>
        <h3 className="mt-1 text-sm font-semibold text-ink">
          {heat ? 'Ta receptura wymaga podgrzania.' : statusCopy.title}
        </h3>
        {heat ? <p className="mt-1 text-xs font-semibold text-ink">{statusCopy.title}</p> : null}
        <p className="mt-1 text-xs leading-relaxed text-stone-600">{statusCopy.note}</p>
        {runtime.loading ? (
          <p className="mt-2 text-xs text-stone-500">Sprawdzam potwierdzone dane procesu…</p>
        ) : null}
        {classification.reasons.length > 0 ? (
          <ul className="mt-2 space-y-1.5 border-t border-ink/10 pt-2">
            {classification.reasons.map((reason, index) => (
              <li
                key={`${reason.type}-${reason.ingredientId ?? index}`}
                className="text-xs text-stone-700"
              >
                {processReasonText(
                  reason.ingredientId,
                  reason.explanation,
                  runtime.ingredientNamesById,
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-4" data-testid="selected-machine-guide">
        <p className="text-[10px] font-semibold tracking-[0.1em] text-stone-500 uppercase">
          Wybrana maszyna
        </p>
        <h3 className="mt-1 text-sm font-semibold text-ink">{machineLabel ?? guide.title}</h3>
        <ol className="mt-3 divide-y divide-ink/10 border-y border-ink/10">
          {steps.map((step, index) => (
            <li key={`${step}-${index}`} className="grid grid-cols-[1.75rem_1fr] gap-2 py-2.5">
              <span className="font-mono text-xs font-semibold text-stone-500">{index + 1}</span>
              <span className="text-xs leading-relaxed text-ink">{step}</span>
            </li>
          ))}
        </ol>
        {guide.timing.status === 'verified' ? (
          <p className="mt-3 text-xs font-semibold text-ink">{guide.timing.text}</p>
        ) : (
          <p className="mt-3 text-xs leading-relaxed text-stone-600" data-testid="timing-readiness">
            Dokładny czas i temperatura nie są podane bez zatwierdzonego źródła.
          </p>
        )}
      </div>
    </section>
  );
}

interface AdvancedTopic {
  id: string;
  title: string;
  body: string;
}

function advancedTopics(input: RecipeInput): AdvancedTopic[] {
  const items = input.items.filter((item) => item.planned_grams > 0);
  const has = (field: keyof RecipeInput['items'][number]['ingredient']['composition']) =>
    items.some((item) => positive(item.ingredient.composition[field] as number | null));
  const topics: AdvancedTopic[] = [];
  if (has('water_percent'))
    topics.push({
      id: 'water',
      title: 'Woda',
      body: 'Część wody zamarza. Pozostałe składniki i temperatura wpływają na to, ile lodu powstaje.',
    });
  if (has('sugar_percent'))
    topics.push({
      id: 'sugars',
      title: 'Cukry',
      body: 'Cukry wpływają na słodycz i zamarzanie, ale różne rodzaje nie działają identycznie.',
    });
  if (has('fat_percent'))
    topics.push({
      id: 'fat',
      title: 'Tłuszcz',
      body: 'Tłuszcz wnosi części stałe i wpływa na odczucie kremowości całej mieszanki.',
    });
  if (has('protein_percent'))
    topics.push({
      id: 'protein',
      title: 'Białko',
      body: 'Białko jest częścią struktury. Jego efekt zależy od źródła i pozostałych składników.',
    });
  if (items.some((item) => item.ingredient.category === 'stabilizer'))
    topics.push({
      id: 'stabilizer',
      title: 'Stabilizator',
      body: 'Stabilizator może pomagać kontrolować wodę i wzrost kryształków. Proces musi odpowiadać produktowi.',
    });
  if (items.some((item) => item.ingredient.category === 'fruit'))
    topics.push({
      id: 'fruit',
      title: 'Owoce',
      body: 'Owoce wnoszą jednocześnie wodę, naturalne cukry i — zależnie od produktu — błonnik.',
    });
  if (has('alcohol_percent'))
    topics.push({
      id: 'alcohol',
      title: 'Alkohol',
      body: 'Alkohol silnie wpływa na zamarzanie, dlatego jest oceniany w kontekście całej receptury.',
    });
  return topics;
}

function AdvancedKnowledge({ input }: { input: RecipeInput }) {
  const topics = advancedTopics(input);
  return (
    <section data-testid="advanced-recipe-knowledge">
      <p className="text-[10px] font-semibold tracking-[0.1em] text-stone-500 uppercase">
        Wiedza Pro
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-ink">Dowiedz się więcej</h2>
      <div className="mt-4 divide-y divide-ink/10 border-y border-ink/10">
        {topics.map((topic) => (
          <details key={topic.id} className="py-2.5">
            <summary className="pro-focus-ring flex min-h-10 cursor-pointer items-center justify-between text-sm font-semibold text-ink">
              {topic.title}
              <span aria-hidden className="text-stone-400">
                ⌄
              </span>
            </summary>
            <p className="pb-2 text-xs leading-relaxed text-stone-600">{topic.body}</p>
            {topic.id === 'sugars' ? (
              <div className="grid gap-1.5 border-t border-ink/8 pt-2 text-xs text-stone-600">
                {copy.sugar.rows.map((row) => (
                  <div key={row.id} className="flex flex-wrap items-center justify-between gap-3">
                    <span className="font-medium text-ink">{row.name}</span>
                    <span className="flex items-center gap-3">
                      <RelativeDots value={row.sweetness} label={copy.sugar.scaleSweetness} />
                      <RelativeDots value={row.softening} label={copy.sugar.scaleSoftening} />
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </details>
        ))}
      </div>
    </section>
  );
}

const initialViewForLesson = (lesson: EducationLessonId | undefined): KnowledgeView | null => {
  if (lesson === undefined) return null;
  if (lesson === 'process' || lesson === 'machine') return 'process';
  if (lesson === 'sugar') return 'advanced';
  return 'summary';
};

export function ContextualEducationView({
  input,
  machineId = null,
  machineLabel = null,
  audience = 'pro',
  initialLesson,
  processEvidence,
  onBack,
}: {
  input: RecipeInput;
  machineId?: string | null;
  machineLabel?: string | null;
  audience?: EducationAudience;
  initialLesson?: EducationLessonId;
  processEvidence?: readonly RecipeProcessEvidence[];
  onBack: () => void;
}) {
  void audience;
  const initialView = initialViewForLesson(initialLesson);
  const [active, setActive] = useState<KnowledgeView | null>(initialView);
  const directInitialLesson = initialLesson !== undefined && active === initialView;

  return (
    <div
      className="mx-auto min-h-full w-full max-w-none bg-[#f7f5f0] p-4 text-ink sm:p-5"
      data-testid="profile-education-view"
    >
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={active === null || directInitialLesson ? onBack : () => setActive(null)}
      >
        {active === null || directInitialLesson ? copy.backToRecipe : copy.backToHub}
      </Button>
      {active === null ? (
        <KnowledgeHome onOpen={setActive} />
      ) : active === 'summary' ? (
        <RecipeSummary input={input} />
      ) : active === 'process' ? (
        <ProcessKnowledge
          input={input}
          machineId={machineId}
          machineLabel={machineLabel}
          processEvidence={processEvidence}
        />
      ) : (
        <AdvancedKnowledge input={input} />
      )}
    </div>
  );
}
