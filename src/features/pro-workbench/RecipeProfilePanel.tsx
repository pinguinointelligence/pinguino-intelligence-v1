import { useState } from 'react';
import { ReadinessFrame } from '@/features/design-review/ReadinessMarker';
import { NutritionCostScorePanel } from '@/features/pi-panel/NutritionCostScorePanel';
import type { CorrectionResult, RecipeInput, RecipeResult } from '@/engine';
import { ContextualEducationView } from '@/features/education/ContextualEducationView';
import { useRecipeStore } from '@/stores/recipeStore';
import { WorkbenchSettingsLine } from './WorkbenchSettingsLine';
import { ProfileDirectionAxes } from './ProfileDirectionAxes';
import { MonitorPanelContent } from './MonitorPanelContent';
import { buildMonitorAssessment, monitorScoreView } from './monitorSummaryView';
import { ProductionCockpit } from '@/features/production-workspace/ProductionCockpit';
import type { ProductionWorkspaceView } from '@/features/production-workspace/useProductionWorkspace';

export type ProContextTab = 'recipe' | 'monitor' | 'production';
export type CockpitTab = 'profile' | 'monitor' | 'production' | 'summary';

const TABS: readonly { id: CockpitTab; label: string }[] = [
  { id: 'profile', label: 'Profil receptury' },
  { id: 'monitor', label: 'Monitor' },
  { id: 'production', label: 'Produkcja' },
  { id: 'summary', label: 'Podsumowanie' },
];

function NutritionAndCost({ result }: { result: RecipeResult }) {
  const nutrition = result.nutrition_per_100g;
  const costs = result.costs;
  const nutritionRows = nutrition
    ? [
        ['Energia', `${nutrition.kcal.toFixed(0)} kcal`],
        ['Tłuszcz', `${nutrition.fat_g.toFixed(1)} g`],
        ['Węglowodany', `${nutrition.carbohydrate_g.toFixed(1)} g`],
        ['w tym cukry', `${nutrition.sugars_g.toFixed(1)} g`],
        ['Białko', `${nutrition.protein_g.toFixed(1)} g`],
        ['Błonnik', `${nutrition.fiber_g.toFixed(1)} g`],
        ['Sól', `${nutrition.salt_g.toFixed(2)} g`],
      ]
    : [];

  return (
    <div
      className="grid grid-cols-2 divide-x divide-ink/10 border-t border-ink/10"
      data-testid="profile-nutrition-cost"
    >
      <section className="p-3">
        <p className="text-[10px] font-semibold tracking-[0.08em] text-stone-500 uppercase">
          Nutrition · na 100 g
        </p>
        {nutritionRows.length ? (
          <dl className="mt-2 space-y-1">
            {nutritionRows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2 text-[10px]">
                <dt className="text-stone-600">{label}</dt>
                <dd className="font-mono tabular-nums text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-xs text-stone-500">Brak danych odżywczych</p>
        )}
      </section>
      <section className="p-3">
        <p className="text-[10px] font-semibold tracking-[0.08em] text-stone-500 uppercase">
          Koszt
        </p>
        {costs?.complete ? (
          <dl className="mt-2 space-y-1 text-[10px]">
            <div className="flex justify-between gap-2">
              <dt>Partia</dt>
              <dd className="font-mono tabular-nums">{costs.total_cost?.toFixed(2)} €</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>1 kg</dt>
              <dd className="font-mono tabular-nums">{costs.cost_per_kg?.toFixed(2)} €</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Porcja 80 g</dt>
              <dd className="font-mono tabular-nums">{costs.cost_per_serving_80g?.toFixed(2)} €</dd>
            </div>
          </dl>
        ) : (
          <div className="mt-2">
            <p className="text-xs font-semibold text-attention">Koszt niepełny</p>
            <p className="mt-1 text-[10px] text-stone-500">
              Brakuje cen dla {costs?.missing_cost_ingredient_ids.length ?? result.items.length}{' '}
              składników.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function ProfileScoreCard({
  result,
  input,
  onOpenEducation,
}: {
  result: RecipeResult;
  input: RecipeInput;
  onOpenEducation: () => void;
}) {
  const score = monitorScoreView(result, input).match;
  const assessment = buildMonitorAssessment(result);

  return (
    <button
      type="button"
      onClick={onOpenEducation}
      className="flex w-full items-center gap-3 border-b border-ink/10 px-3 py-2 text-left hover:bg-stone-50"
      data-testid="profile-score-card"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-status-ideal font-mono text-base font-semibold tabular-nums text-status-ideal">
        {score.display}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm text-ink">{score.label}</strong>
        <span className="bracket-note mt-0.5 block text-[11px] leading-snug text-stone-500">
          {assessment.headline}
        </span>
      </span>
      <span className="text-xl text-stone-500" aria-hidden>
        ›
      </span>
    </button>
  );
}

function ProfileContent({
  result,
  input,
  onOpenEducation,
}: {
  result: RecipeResult;
  input: RecipeInput;
  onOpenEducation: () => void;
}) {
  return (
    <div data-testid="pro-context-recipe">
      <ProfileScoreCard result={result} input={input} onOpenEducation={onOpenEducation} />
      <div className="p-2">
        <WorkbenchSettingsLine
          actualBatchG={result.total_batch_g}
          actualProteinPercent={result.percentages.protein_percent}
        />
      </div>
      <ProfileDirectionAxes result={result} />
      <NutritionAndCost result={result} />
    </div>
  );
}

function ProductionPanel({ production }: { production?: ProductionWorkspaceView }) {
  if (production) {
    return (
      <div data-testid="pro-context-production">
        <ProductionCockpit production={production} />
      </div>
    );
  }

  return (
    <div data-testid="pro-context-production">
      <div className="m-3 border border-status-error/30 bg-status-error/[0.035] p-3" role="alert">
        <h3 className="text-xs font-semibold text-status-error">
          Nie udało się uruchomić sesji produkcji
        </h3>
        <p className="mt-1 text-[10px] leading-relaxed text-stone-600">
          Wróć do Profilu receptury i otwórz Produkcję ponownie. Receptura nie została zmieniona.
        </p>
      </div>
    </div>
  );
}

function SummaryPanel({ result }: { result: RecipeResult }) {
  const version = useRecipeStore((state) => state.currentVersionNumber);
  return (
    <div className="space-y-2 p-3" data-testid="pro-context-summary">
      <section className="border border-ink/10 p-3">
        <h3 className="text-sm font-semibold text-ink">Skład receptury</h3>
        <p className="mt-2 text-[11px] leading-relaxed text-stone-600">
          {result.items.map((item) => item.ingredient.name).join(', ') || 'Brak składników'}
        </p>
      </section>
      <NutritionCostScorePanel result={result} />
      <ReadinessFrame
        state="W PRZYGOTOWANIU"
        title="Alergeny i deklaracja"
        compact
        details={{
          limitation: 'Dane etykiety nie są jeszcze podłączone do aktualnej receptury.',
          calculationImpact: 'Nie wpływa na obliczenia techniczne.',
          remaining:
            'Zweryfikować dane składników i zbudować deklarację bez niepotwierdzonych claimów.',
        }}
      >
        <p className="text-[10px] text-stone-600">
          Nie deklarujemy „bez alergenów”, „bez glutenu” ani innych oznaczeń bez zweryfikowanych
          danych składników.
        </p>
      </ReadinessFrame>
      <ReadinessFrame
        state="TESTOWE / NIEPRODUKCYJNE"
        title="Wpływ receptury na etykietę"
        compact
        details={{
          limitation: 'Obecny eksport etykiety korzysta z danych przykładowych.',
          calculationImpact: 'Nie wpływa na recepturę.',
          remaining:
            'Podłączyć bieżącą recepturę, ilość netto, przechowywanie, pochodzenie i eksport.',
        }}
      >
        <dl className="space-y-1 text-[10px]">
          <div className="flex justify-between">
            <dt>Ilość netto</dt>
            <dd className="font-mono">{result.total_batch_g.toFixed(0)} g</dd>
          </div>
          <div className="flex justify-between">
            <dt>Wersja</dt>
            <dd>{version ? `v${version}` : 'wersja robocza'}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Eksport / druk</dt>
            <dd className="text-nonprod">niepodłączone</dd>
          </div>
        </dl>
      </ReadinessFrame>
    </div>
  );
}

export function RecipeProfilePanel({
  activeTab,
  onTabChange,
  result,
  servingTemperatureC,
  corrections,
  input,
  production,
}: {
  activeTab: CockpitTab;
  onTabChange: (tab: CockpitTab) => void;
  result: RecipeResult;
  servingTemperatureC: number;
  corrections: CorrectionResult;
  input: RecipeInput;
  production?: ProductionWorkspaceView;
}) {
  const [educationOpen, setEducationOpen] = useState(false);
  const machineId = useRecipeStore((state) => state.machineId);
  return (
    <div data-testid="pro-profile-panel" className="min-h-full bg-white text-ink">
      <nav
        aria-label="Kokpit aktualnej receptury"
        className="grid grid-cols-4 border-b border-ink/10"
        data-testid="pro-context-tabs"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            data-testid={`pro-context-${tab.id}-tab`}
            onClick={() => {
              setEducationOpen(false);
              onTabChange(tab.id);
            }}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={`border-b-2 px-1 py-2 text-[10px] font-semibold transition-colors ${activeTab === tab.id ? 'border-ink text-ink' : 'border-transparent text-stone-500 hover:text-ink'}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === 'profile' && educationOpen ? (
        <ContextualEducationView
          input={input}
          machineId={machineId}
          audience="pro"
          onBack={() => setEducationOpen(false)}
        />
      ) : null}
      {activeTab === 'profile' && !educationOpen ? (
        <ProfileContent
          result={result}
          input={input}
          onOpenEducation={() => setEducationOpen(true)}
        />
      ) : null}
      {activeTab === 'monitor' ? (
        <div className="p-3" data-testid="pro-context-monitor">
          <MonitorPanelContent
            result={result}
            servingTemperatureC={servingTemperatureC}
            corrections={corrections}
            input={input}
            onOpenProfile={() => onTabChange('profile')}
          />
        </div>
      ) : null}
      {activeTab === 'production' ? <ProductionPanel production={production} /> : null}
      {activeTab === 'summary' ? <SummaryPanel result={result} /> : null}
    </div>
  );
}
