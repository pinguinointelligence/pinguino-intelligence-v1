/**
 * DEV-ONLY PI Recipe Monitor preview (route: /dev/pi-monitor).
 *
 * Runs the PI Monitor over deterministic sample recipes: it maps each recipe onto
 * the four customer axes vs the golden range, applies the fixture's stepped wishes,
 * and recalculates through the REAL pipeline (the sanctioned optimization runner →
 * Base Engine + correction solver + Temperature Regulator rerun). It renders the
 * customer panel per fixture (Demo qualitative vs Home/Pro exact grams, plus the
 * ingredient-resolution block). It writes NOTHING and persists NOTHING — no product
 * DB, no Mapper, no external backend, no recipe save.
 *
 * Boundaries (PiMonitorDevPage.security.test.ts): DEV-only route + NotFound; no DB
 * client / service write / recipe save / pac-pod write / status activation / deep
 * engine import.
 */
import { NotFoundPage } from '@/pages/NotFoundPage';
import {
  PiMonitorPanel,
  PI_MONITOR_FIXTURES,
  evaluateRecalcGate,
  monitorRecipe,
  realPiRecalculationRunner,
  recalculateWithPi,
  type PiMonitorFixture,
} from '@/features/pi-monitor';

function FixtureCard({ fixture }: { fixture: PiMonitorFixture }) {
  // The current monitor reading uses the base intent (no wishes) so it reflects
  // the recipe as-is; the recalc applies the fixture's stepped wishes.
  const monitorRun = realPiRecalculationRunner({ intent: fixture.baseIntent, recipeDraft: fixture.recipe });
  const monitor = monitorRecipe({
    metrics: monitorRun.beforeMetrics,
    category: monitorRun.category,
    servingTemperatureC: monitorRun.servingTemperatureC,
    persona: fixture.persona,
  });
  const gate = evaluateRecalcGate(fixture.resolution);
  const result = recalculateWithPi({
    baseIntent: fixture.baseIntent,
    recipeDraft: fixture.recipe,
    axisIntents: fixture.axisIntents,
    resolution: fixture.resolution,
    persona: fixture.persona,
    runner: realPiRecalculationRunner,
  });

  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] uppercase tracking-wide text-ivory/40">{fixture.label}</p>
      <PiMonitorPanel monitor={monitor} axisIntents={fixture.axisIntents} gate={gate} result={result} />
    </div>
  );
}

export function PiMonitorDevPage() {
  if (!import.meta.env.DEV) return <NotFoundPage />;

  return (
    <div className="min-h-screen bg-[#1a1a1a] px-6 py-12 text-ivory">
      <div className="mx-auto max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-wide text-ivory/40">DEV · internal</p>
        <h1 className="mt-3 text-2xl font-light tracking-tight">PI Recipe Monitor</h1>
        <p className="mt-2 text-xs leading-relaxed text-ivory/50">
          Deterministic sample recipes mapped onto the four customer axes vs the golden range, then
          recalculated through the REAL pipeline (optimization runner → Base Engine + correction solver +
          Temperature Regulator rerun). Preview only — nothing is saved, no product DB / Mapper / external
          backend is touched, no recipe is mutated.
        </p>
        <div className="mt-8 space-y-10">
          {PI_MONITOR_FIXTURES.map((fixture) => (
            <FixtureCard key={fixture.id} fixture={fixture} />
          ))}
        </div>
      </div>
    </div>
  );
}
