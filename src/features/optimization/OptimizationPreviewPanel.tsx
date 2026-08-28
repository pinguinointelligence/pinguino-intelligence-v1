/**
 * OptimizationPreviewPanel (Spine Slice 10) — a PURE, reusable display of a
 * pre-computed optimization preview. It NEVER calls the engine, NEVER saves, and
 * shows only what the display policy permits (Free/Demo: high-level recommendation
 * + direction; Pro: exact correction plan + grams + before/after; DEV: adds a
 * debug trace). It takes an already-computed `OptimizationPreviewView` — the
 * caller runs the preview.
 */
import { SectionLabel } from '@/components/shared/SectionLabel';
import { Card } from '@/components/ui/Card';
import { recommendationFor, type OptimizationDisplayPolicy } from './optimizationPreviewPolicy';
import type { OptimizationPreviewView } from './optimizationPreviewRunner';
import type { BaseEngineMetrics } from '@/spine';

const DECISION_TONE: Record<string, string> = {
  optimized: 'text-emerald-300',
  no_action_needed: 'text-emerald-300',
  tradeoff: 'text-amber-300',
  impossible: 'text-rose-300',
  blocked: 'text-rose-300',
};

const FRIENDLY_LABELS: Readonly<Record<string, string>> = {
  optimized: 'Gotowa bezpieczna korekta',
  no_action_needed: 'Korekta niepotrzebna',
  tradeoff: 'Korekta z kompromisem',
  impossible: 'Brak bezpiecznej korekty',
  blocked: 'Ocena zablokowana',
  increase_npac: 'zwiększ NPAC',
  decrease_npac: 'zmniejsz NPAC',
  increase_pod: 'zwiększ POD',
  decrease_pod: 'zmniejsz POD',
  reduce_pod: 'zmniejsz POD',
  increase_solids: 'Zwiększ części stałe',
  decrease_solids: 'Zmniejsz części stałe',
  increase_water: 'Zwiększ wodę',
  decrease_water: 'Zmniejsz wodę',
  increase_fat: 'Zwiększ tłuszcz',
  decrease_fat: 'Zmniejsz tłuszcz',
  increase_ice_fraction: 'Zwiększ udział lodu',
  decrease_ice_fraction: 'Zmniejsz udział lodu',
  reduce_lactose_sanding: 'Ogranicz krystalizację laktozy',
  increase_aerating_protein: 'Zwiększ białko wspierające napowietrzenie',
  adjust_fruit_ratio: 'Dopasuj udział owoców',
  adjust_plant_base_ratio: 'Dopasuj bazę roślinną',
  adjust_chocolate_ratio: 'Dopasuj udział czekolady',
  adjust_cocoa_fat_balance: 'Dopasuj równowagę kakao i tłuszczu',
  restore_stabilizer: 'Przywróć stabilizator',
  milk: 'Mleko',
  cream: 'Śmietanka',
  skimmed_milk_powder: 'Odtłuszczone mleko w proszku',
  sucrose: 'Sacharoza',
  dextrose: 'Dekstroza',
  inulin_fiber: 'Inulina lub błonnik',
  stabilizer: 'Stabilizator',
  water: 'Woda',
  fruit: 'Owoce',
  hero_flavor_ingredient: 'Główny składnik smakowy',
  oat_drink: 'Napój owsiany',
  soy_drink: 'Napój sojowy',
  almond_drink: 'Napój migdałowy',
  rice_drink: 'Napój ryżowy',
  coconut_milk_cream: 'Mleczko lub śmietanka kokosowa',
  plant_fat: 'Tłuszcz roślinny',
  plant_protein: 'Białko roślinne',
  whey_protein_concentrate: 'Koncentrat białka serwatkowego',
  milk_protein_concentrate: 'Koncentrat białek mleka',
  high_protein_dairy: 'Wysokobiałkowy produkt mleczny',
  dark_chocolate: 'Ciemna czekolada',
  milk_chocolate: 'Czekolada mleczna',
  cocoa_powder: 'Kakao',
  cocoa_mass: 'Miazga kakaowa',
  cocoa_butter: 'Masło kakaowe',
  chocolate_paste: 'Pasta czekoladowa',
  npac: 'NPAC',
  pod: 'POD',
  ice_fraction: 'Udział lodu',
  total_solids: 'Części stałe',
  fat: 'Tłuszcz',
  lactose: 'Laktoza',
};
const humanize = (value: string): string => FRIENDLY_LABELS[value] ?? 'zmiana receptury';
const PROFILE_LABEL: Readonly<Record<string, string>> = {
  standard_gelato: 'Gelato klasyczne',
  sorbet: 'Sorbet',
  vegan_gelato: 'Gelato wegańskie',
  chocolate_gelato: 'Gelato czekoladowe',
  protein_gelato: 'Gelato proteinowe',
};
const fmt = (v: number | null | undefined): string =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : '—';

function MetricRow({
  label,
  before,
  after,
}: {
  label: string;
  before: number | null | undefined;
  after: number | null | undefined;
}) {
  return (
    <div className="flex justify-between gap-4 font-mono text-[11px] text-ivory/60">
      <span className="text-ivory/60">{label}</span>
      <span>
        {fmt(before)} <span className="text-ivory/60">→ {fmt(after)}</span>
      </span>
    </div>
  );
}

export function OptimizationPreviewPanel({
  view,
  policy,
}: {
  view: OptimizationPreviewView;
  policy: OptimizationDisplayPolicy;
}) {
  const b = view.beforeMetrics;
  const a = view.afterMetrics;
  const metricRows: Array<[string, keyof BaseEngineMetrics]> = [
    ['NPAC', 'npac'],
    ['POD', 'pod'],
    ['Udział lodu', 'iceFraction'],
    ['Części stałe', 'solids'],
    ['Woda', 'water'],
  ];

  return (
    <Card padding="lg">
      <SectionLabel>Podgląd optymalizacji</SectionLabel>

      <div className="mt-4 flex items-baseline justify-between gap-3">
        <span
          className={`text-sm font-medium ${DECISION_TONE[view.finalDecision] ?? 'text-ivory'}`}
        >
          {humanize(view.finalDecision)}
        </span>
        <span className="font-mono text-[11px] text-ivory/60">
          {PROFILE_LABEL[view.productProfile] ?? 'Receptura'} · {view.servingTemperatureC}°C
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ivory/60">
        {recommendationFor(view.finalDecision)}
      </p>

      {/* Temperature-aware target instrumentation — label only, safe in every tier. */}
      <p className="mt-2 font-mono text-[11px] text-ivory/60">
        Zakres docelowy
        {view.targetGuidance.solverTargetAligned
          ? ' · zgodny z wybranym profilem'
          : ' · wymaga weryfikacji dla tej temperatury'}
      </p>

      {/* Shadow (non-live) engine-band-vs-regulator-band comparison — visibility only. */}
      {(() => {
        const npac = view.bandComparison.comparisons.find((c) => c.metric === 'npac');
        if (!npac || !npac.engineBand || !npac.shadowBand) return null;
        return (
          <p className="mt-1 font-mono text-[11px] text-ivory/60">
            Porównanie zakresu NPAC · bieżący {npac.engineBand[0]}–{npac.engineBand[1]} / dodatkowy{' '}
            {npac.shadowBand[0]}–{npac.shadowBand[1]}
            {npac.aligned ? ' · zgodne' : ` · różnica środka ${npac.centerDelta?.toFixed(1)}`}
          </p>
        );
      })()}

      {/* Slice 13 comparison line. Safe in every tier — no grams, no ingredient
          names. Since CONFIG 0.6.0 the engine bands ARE temperature-aware, so for
          seeded cells this comparison is expected to read "same correction". */}
      {view.solverTargetInjection.active ? (
        <p className="mt-1 font-mono text-[11px] text-ivory/60">
          Dodatkowe porównanie zakresu:{' '}
          {view.solverTargetInjection.correctionChanged
            ? 'zmieniłoby korektę'
            : 'bez zmiany korekty'}
          {view.solverTargetInjection.newViolationsUnderRegulator.length > 0
            ? ' · wykryto dodatkowe odchylenia'
            : ''}
          <span className="text-ivory/60"> · tylko informacyjnie</span>
        </p>
      ) : null}

      {/* Slice 14: regulator-shadow REAL gram solve (preview only). Safe summary in every tier —
          decision + whether it differs from / improves on the engine-seeded solve; no grams here. */}
      {view.regulatorShadowSolve.active ? (
        <p className="mt-1 font-mono text-[11px] text-ivory/60">
          Dodatkowe przeliczenie: {humanize(view.regulatorShadowSolve.decision)}
          {view.solveComparison.correctionDiffers ? ' · inna korekta' : ' · ta sama korekta'}
          {view.solveComparison.regulatorShadowImproved
            ? ' · wynik lepszy po ponownym sprawdzeniu'
            : ''}
        </p>
      ) : null}

      {/* Directional recommendation — safe in every tier (no grams, no ingredient names). */}
      {view.correctionGoals.length > 0 ? (
        <p className="mt-3 text-xs leading-relaxed text-ivory/65">
          <span className="text-ivory/60">Kierunek: </span>
          {view.correctionGoals.map(humanize).join(' · ')}
        </p>
      ) : null}

      {/* Pro: the exact correction plan (target metric + lever ingredient classes). */}
      {policy.showCorrectionDetail && view.proposedCorrections.length > 0 ? (
        <div className="mt-3 space-y-1 border-t border-ivory/10 pt-3">
          <p className="font-mono text-[11px] text-ivory/60">Plan korekty</p>
          {view.proposedCorrections.map((p) => (
            <div
              key={p.goal}
              className="flex justify-between gap-3 font-mono text-[11px] text-ivory/70"
            >
              <span>{humanize(p.goal)}</span>
              <span className="text-ivory/60">
                {p.affectedIngredientClasses.map(humanize).join(' / ')}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Pro: the solver's exact added grams — engine-seeded (live target) then regulator-shadow. */}
      {policy.showExactGrams && view.proposedAdjustments.length > 0 ? (
        <p className="mt-3 font-mono text-[11px] text-sky-300/80">
          Gellatti proponuje:{' '}
          {view.proposedAdjustments
            .map((x) => `${x.ingredient} ${x.grams.toFixed(1)} g`)
            .join(', ')}
        </p>
      ) : null}
      {policy.showExactGrams &&
      view.regulatorShadowSolve.active &&
      view.regulatorShadowSolve.proposedAdjustments.length > 0 ? (
        <p className="mt-1 font-mono text-[11px] text-sky-300/80">
          Dodatkowe porównanie proponuje:{' '}
          {view.regulatorShadowSolve.proposedAdjustments
            .map((x) => `${x.ingredient} ${x.grams.toFixed(1)} g`)
            .join(', ')}
          <span className="text-ivory/60"> · tylko podgląd</span>
        </p>
      ) : null}

      {/* Pro (technical view): numeric before/after metrics. */}
      {policy.showBeforeAfterMetrics && a ? (
        <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1 border-t border-ivory/10 pt-3 sm:grid-cols-2">
          {metricRows.map(([label, key]) => (
            <MetricRow key={key} label={label} before={b[key]} after={a[key]} />
          ))}
        </div>
      ) : null}

      {/* Pro (technical view): the engine-seeded → regulator-shadow solver target comparison. */}
      {policy.showBeforeAfterMetrics && view.solverTargetInjection.comparisons.length > 0 ? (
        <div className="mt-3 space-y-1 border-t border-ivory/10 pt-3">
          <p className="font-mono text-[11px] text-ivory/60">
            Zakres bieżący → dodatkowy (tylko podgląd)
          </p>
          {view.solverTargetInjection.comparisons.map((c) => (
            <div
              key={c.metric}
              className="flex justify-between gap-3 font-mono text-[11px] text-ivory/70"
            >
              <span className="text-ivory/60">
                {humanize(c.metric)} = {fmt(c.value)}
              </span>
              <span>
                {c.engineBand ? `${c.engineBand[0]}–${c.engineBand[1]}` : '—'}
                <span className="text-ivory/60">
                  {' '}
                  → {c.regulatorBand[0]}–{c.regulatorBand[1]}
                </span>
                {c.shadowViolation && !c.engineViolation ? (
                  <span className="text-amber-300/80"> · poza dodatkowym zakresem</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Free / Demo: the redaction affordance. */}
      {!policy.showExactGrams ? (
        <p className="mt-3 text-[11px] leading-relaxed text-ivory/60">
          Dokładne gramy i pełny plan korekty są dostępne w Gellatti Pro.
        </p>
      ) : null}

      {/* DEV-only debug trace — additive, never relaxes customer redaction. */}
      {policy.showTrace ? (
        <div className="mt-4 space-y-0.5 rounded bg-black/30 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-ivory/60">
          <div>
            DEV trace · rerun {view.rerunState} · optimizer {view.optimizerDecision} · flow{' '}
            {view.flowDecision}
          </div>
          {view.targetGuidance.target ? (
            <div>
              regulator target · {view.targetGuidance.target.regulatorProfile} · npac{' '}
              {view.targetGuidance.target.npacBand[0]}–{view.targetGuidance.target.npacBand[1]}
              {view.targetGuidance.npacTargetDivergence != null
                ? ` · Δcenter ${view.targetGuidance.npacTargetDivergence.toFixed(1)}`
                : ''}
            </div>
          ) : null}
          {view.bandComparison.comparisons.some((c) => !c.aligned && c.shadowBand) ? (
            <div>
              divergent shadow bands:{' '}
              {view.bandComparison.comparisons
                .filter((c) => !c.aligned && c.shadowBand)
                .map(
                  (c) =>
                    `${c.metric}(eng ${c.engineBand ? c.engineBand.join('–') : '—'}→reg ${c.shadowBand!.join('–')})`,
                )
                .join(', ')}
            </div>
          ) : null}
          {view.solverTargetInjection.active ? (
            <div>
              solver target injection ({view.solverTargetMode}) · engine{' '}
              {view.solverTargetInjection.trace.engineSeededCount} viol → regulator-shadow{' '}
              {view.solverTargetInjection.trace.regulatorShadowCount} viol
              {view.solverTargetInjection.correctionChanged ? ' · CHANGED' : ' · same'}
            </div>
          ) : (
            <div>solver target injection: blocked ({view.solverTargetInjection.blockedReason})</div>
          )}
          <div>
            rozwiązanie gramów · start z obliczeń {view.engineSeededSolve.decision} (
            {view.engineSeededSolve.proposedAdjustments.length} działań w g)
            {view.regulatorShadowSolve.active
              ? ` → regulator-shadow ${view.regulatorShadowSolve.decision} (${view.regulatorShadowSolve.proposedAdjustments.length}g-actions)${view.solveComparison.correctionDiffers ? ' · DIFFERS' : ' · same'}${view.solveComparison.regulatorShadowImproved ? ' · improves' : ''}`
              : ` · regulator-shadow blocked (${view.regulatorShadowSolve.blockedReason})`}
          </div>
          {view.rerun ? (
            <div>
              regulator {view.rerun.before.status} (score {view.rerun.before.score}) →{' '}
              {view.rerun.after.status} (score {view.rerun.after.score})
            </div>
          ) : null}
          {view.rejectedCorrections.length > 0 ? (
            <div>
              rejected: {view.rejectedCorrections.map((r) => `${r.goal}:${r.reason}`).join(', ')}
            </div>
          ) : null}
          {view.hardBlockers.length > 0 ? (
            <div className="text-rose-300/70">blockers: {view.hardBlockers.join(', ')}</div>
          ) : null}
          {view.warnings.length > 0 ? <div>Warnings: {view.warnings.join(', ')}</div> : null}
        </div>
      ) : null}
    </Card>
  );
}
