import { useState } from 'react';
import { ReadinessFrame } from '@/features/design-review/ReadinessMarker';
import { CorrectionPanel } from '@/features/corrections/CorrectionPanel';
import { NutritionCostScorePanel } from '@/features/pi-panel/NutritionCostScorePanel';
import type { CorrectionResult, RecipeInput, RecipeResult } from '@/engine';
import { buildUserMonitorSummaryCards } from '@/features/user-monitor';
import { useRecipeStore } from '@/stores/recipeStore';
import { WorkbenchSettingsLine } from './WorkbenchSettingsLine';
import { MonitorPanelContent } from './MonitorPanelContent';
import {
  buildMonitorAssessment,
  buildMonitorPrimarySignal,
  monitorScoreView,
} from './monitorSummaryView';

export type ProContextTab = 'recipe' | 'monitor' | 'production';
export type CockpitTab = 'profile' | 'monitor' | 'production' | 'summary';

const TABS: readonly { id: CockpitTab; label: string }[] = [
  { id: 'profile', label: 'Profil receptury' },
  { id: 'monitor', label: 'Monitor' },
  { id: 'production', label: 'Produkcja' },
  { id: 'summary', label: 'Podsumowanie' },
];

const directionDetails = {
  limitation: 'Odczyt działa, ale wybór celu nie jest jeszcze podłączony do pełnej reformulacji.',
  calculationImpact: 'Zmiana wyboru nie zmienia liczb ani propozycji PI.',
  remaining: 'Podłączyć cztery cele do zatwierdzonych targetów solvera.',
};

const impactDetails = {
  limitation: 'Wpływ rekomendacji na sześć osi nie jest jeszcze liczony jako osobna symulacja.',
  calculationImpact:
    'Wyświetlane rekomendacje pozostają prawdziwymi propozycjami solvera, bez fikcyjnych delt osi.',
  remaining: 'Dodać zweryfikowany before/after dla osi użytkowych.',
};

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

function DirectionControls({ result }: { result: RecipeResult }) {
  const [choices, setChoices] = useState<Record<string, string>>({
    sweetness: 'Optymalne',
    softness: 'Optymalne',
    creaminess: 'Optymalne',
    flavor: 'Optymalne',
  });
  const axes = buildUserMonitorSummaryCards(result);
  const structure = axes.find((axis) => axis.id === 'struktura')?.reading;
  const stability = axes.find((axis) => axis.id === 'stabilnosc')?.reading;
  const structureLabel =
    structure?.side === 'below' ? 'Lekka' : structure?.side === 'above' ? 'Zwarta' : 'Zbalansowana';
  const stabilityLabel =
    stability?.side === 'below'
      ? 'Wymaga uwagi'
      : stability?.side === 'above'
        ? 'Bardzo stabilna'
        : 'Stabilna';
  const controls = [
    {
      id: 'sweetness',
      label: 'Słodycz',
      options: ['Mniej słodkie', 'Optymalne', 'Bardziej słodkie'],
    },
    { id: 'softness', label: 'Miękkość', options: ['Twardsze', 'Optymalne', 'Bardziej miękkie'] },
    {
      id: 'creaminess',
      label: 'Kremowość',
      options: ['Mniej kremowe', 'Optymalne', 'Bardziej kremowe'],
    },
    {
      id: 'flavor',
      label: 'Intensywność smaku',
      options: ['Delikatniejsze', 'Optymalne', 'Intensywniejsze'],
    },
  ];

  return (
    <ReadinessFrame
      state="W PRZYGOTOWANIU"
      details={directionDetails}
      title="Kierunek receptury"
      compact
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-2" data-testid="profile-direction-controls">
        {controls.map((control) => (
          <label key={control.id} className="min-w-0">
            <span className="mb-1 block text-[9px] font-semibold tracking-[0.08em] text-stone-500 uppercase">
              {control.label}
            </span>
            <select
              value={choices[control.id]}
              onChange={(event) =>
                setChoices((current) => ({ ...current, [control.id]: event.currentTarget.value }))
              }
              className="h-8 w-full rounded-sm border border-nonprod/30 bg-white px-2 text-[11px] text-ink focus:border-nonprod/55 focus:outline-none"
              data-testid={`profile-direction-${control.id}`}
            >
              {control.options.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <div
        className="mt-2 grid grid-cols-2 gap-2 border-t border-nonprod/15 pt-2"
        data-testid="profile-readonly-axes"
      >
        <div>
          <span className="text-[9px] text-stone-500">Struktura · odczyt</span>
          <strong className="block text-xs text-ink">{structureLabel}</strong>
        </div>
        <div>
          <span className="text-[9px] text-stone-500">Stabilność · odczyt</span>
          <strong className="block text-xs text-ink">{stabilityLabel}</strong>
        </div>
      </div>
    </ReadinessFrame>
  );
}

function ProfileContent({
  result,
  onOpenEducation,
}: {
  result: RecipeResult;
  onOpenEducation: () => void;
}) {
  const score = monitorScoreView(result).match;
  const assessment = buildMonitorAssessment(result);

  return (
    <div data-testid="pro-context-recipe">
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
      <div className="space-y-2 p-2">
        <DirectionControls result={result} />
        <WorkbenchSettingsLine actualBatchG={result.total_batch_g} />
      </div>
      <NutritionAndCost result={result} />
    </div>
  );
}

function EducationalCockpit({
  result,
  corrections,
  onBack,
}: {
  result: RecipeResult;
  corrections: CorrectionResult;
  onBack: () => void;
}) {
  const score = monitorScoreView(result).match;
  const assessment = buildMonitorAssessment(result);
  const signal = buildMonitorPrimarySignal(result);
  const axes = buildUserMonitorSummaryCards(result);
  const incomplete = result.total_batch_g <= 0;

  return (
    <div className="p-3" data-testid="profile-education-view">
      <button
        type="button"
        onClick={onBack}
        className="mb-2 text-[11px] font-semibold text-ink underline underline-offset-4"
      >
        ← Wróć do profilu
      </button>
      <div
        className="relative mx-auto aspect-square max-w-[360px] rounded-full border border-ink/10 bg-stone-50"
        data-testid="education-ice-cockpit"
      >
        <img
          src="/images/ice-cockpit-bg.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full rounded-full object-cover object-center opacity-[0.16]"
          data-testid="education-ice-cockpit-background"
        />
        <div className="absolute inset-[22%] z-[1] grid place-items-center rounded-full border-[10px] border-stone-200/90 bg-white/95 text-center shadow-[0_8px_28px_rgba(16,17,19,0.06)]">
          <div>
            <span className="block text-[9px] font-semibold tracking-[0.12em] text-stone-500 uppercase">
              Wynik jakości
            </span>
            <strong className="mt-1 block font-mono text-4xl font-semibold text-status-ideal">
              {score.display}
            </strong>
            <span className="mt-1 block text-[10px] font-semibold text-ink">{score.label}</span>
          </div>
        </div>
        {axes.map((axis, index) => {
          const angle = (index / axes.length) * Math.PI * 2 - Math.PI / 2;
          const left = 50 + Math.cos(angle) * 42;
          const top = 50 + Math.sin(angle) * 42;
          return (
            <div
              key={axis.id}
              className="absolute z-[1] w-24 -translate-x-1/2 -translate-y-1/2 border border-ink/10 bg-white/95 px-2 py-1.5 shadow-[0_4px_14px_rgba(16,17,19,0.05)]"
              style={{ left: `${left}%`, top: `${top}%` }}
            >
              <span className="block text-[8px] font-semibold tracking-[0.08em] text-stone-500 uppercase">
                {axis.label}
              </span>
              <span className="mt-0.5 block truncate text-[9px] font-semibold text-ink">
                {axis.reading.text}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 space-y-2">
        <details open className="border border-status-ideal/25 bg-status-ideal/[0.035] p-2">
          <summary className="cursor-pointer text-xs font-semibold text-ink">
            Dlaczego {score.display}?
          </summary>
          <p className="mt-1 text-[11px] text-stone-600">
            {assessment.headline} {assessment.reasonText}
          </p>
        </details>
        <details className="border border-status-error/25 bg-status-error/[0.025] p-2">
          <summary className="cursor-pointer text-xs font-semibold text-ink">
            Co obniża wynik?
          </summary>
          <p className="mt-1 text-[11px] text-stone-600">{signal.text}</p>
        </details>
        <details open className="border border-gold/25 bg-gold/[0.035] p-2">
          <summary className="cursor-pointer text-xs font-semibold text-ink">
            Jak osiągnąć 10/10?
          </summary>
          <div className="mt-2">
            <CorrectionPanel corrections={corrections} recipeIncomplete={incomplete} />
          </div>
        </details>
        <ReadinessFrame
          state="W PRZYGOTOWANIU"
          details={impactDetails}
          title="Wpływ zmian na strukturę i odczucie"
          compact
        >
          <p className="text-[10px] text-stone-600">
            Nie pokazujemy fikcyjnych wartości „+0,15”. Tutaj pojawią się wyłącznie zweryfikowane
            różnice przed/po.
          </p>
        </ReadinessFrame>
        <p className="border border-ink/10 p-2 text-[10px] leading-relaxed text-stone-600">
          Symulacja została wykonana przez PINGÜINO Engine na podstawie aktualnych składników i
          ustawień receptury.
        </p>
      </div>
    </div>
  );
}

function ProductionPanel() {
  return (
    <div data-testid="pro-context-production">
      <ReadinessFrame
        className="m-3"
        state="W PRZYGOTOWANIU"
        title="Produkcja"
        details={{
          limitation: 'Design gotowy. Logika produkcyjna nie jest jeszcze podłączona.',
          calculationImpact:
            'Faktyczne ilości aktualizują szkic, ale nie zapisują przebiegu produkcji.',
          remaining: 'Podłączyć repozytorium, statusy, zdarzenia i solver ratunku partii.',
        }}
      >
        <ol className="space-y-2 text-xs text-stone-600">
          <li>1. Odważ składnik zgodnie z planem.</li>
          <li>2. Wpisz faktyczną ilość w tabeli po lewej.</li>
          <li>
            3. Przy odchyleniu wybierz: zachowaj partię, zwiększ partię, przelicz pozostałe albo
            zgłoś brak.
          </li>
        </ol>
        <button
          type="button"
          disabled
          className="mt-3 w-full rounded-sm bg-nonprod px-3 py-2 text-xs font-semibold text-white opacity-65"
        >
          Przelicz produkcję · W PRZYGOTOWANIU
        </button>
      </ReadinessFrame>
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
}: {
  activeTab: CockpitTab;
  onTabChange: (tab: CockpitTab) => void;
  result: RecipeResult;
  servingTemperatureC: number;
  corrections: CorrectionResult;
  input: RecipeInput;
}) {
  const [educationOpen, setEducationOpen] = useState(false);
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
            {tab.id === 'production' ? <span className="ml-1 text-nonprod">•</span> : null}
          </button>
        ))}
      </nav>

      {activeTab === 'profile' && educationOpen ? (
        <EducationalCockpit
          result={result}
          corrections={corrections}
          onBack={() => setEducationOpen(false)}
        />
      ) : null}
      {activeTab === 'profile' && !educationOpen ? (
        <ProfileContent result={result} onOpenEducation={() => setEducationOpen(true)} />
      ) : null}
      {activeTab === 'monitor' ? (
        <div className="p-3" data-testid="pro-context-monitor">
          <MonitorPanelContent
            result={result}
            servingTemperatureC={servingTemperatureC}
            corrections={corrections}
            input={input}
          />
        </div>
      ) : null}
      {activeTab === 'production' ? <ProductionPanel /> : null}
      {activeTab === 'summary' ? <SummaryPanel result={result} /> : null}
    </div>
  );
}
