/**
 * Rail focal — the deep-charcoal score card (Design Lock), ACCEPTANCE
 * ADDENDUM (2) public contract (owner decision 2026-07-24, supersedes the
 * §15.1 blended headline):
 *
 *  - the headline INTEGER is „Dopasowanie techniczne" 1–10 — TECHNICAL
 *    recipe-fit derived from the engine's band/technical dimension via the
 *    `recipeTechnicalFit` adapter. When ALL native approved technological
 *    bands are in range it shows EXACTLY 10/10; it degrades honestly with
 *    violations; provisional profiles are capped below 10 and carry
 *    „Ocena częściowa / prowizoryczna".
 *  - cost and subjective flavor are SEPARATE labeled dimensions (small rows
 *    below the headline) — never mixed into the technical integer, still
 *    integer-only (no fake precision), honest „Brak danych kosztowych".
 *  - Screen readers get both the number and the verdict (§21.5); the tooltip
 *    says 10/10 = all native bands in range, not a laboratory guarantee.
 *
 * Reads the already-computed engine scores; never recomputes. Null-safe for
 * empty recipes (honest „Brak danych" path).
 */
import { SectionLabel } from '@/components/shared/SectionLabel';
import { CharcoalPanel } from '@/components/ui/CharcoalPanel';
import { copy } from '@/copy/en';
import type { ProductMode, RecipeResult } from '@/engine';
import { TECHNICAL_FIT_TOOLTIPS, commercialDimensions, recipeTechnicalFit } from '@/features/recipe-score';

const o = copy.studio.overall;

export function OverallScoreCard({
  result,
  mode,
}: {
  result: RecipeResult;
  mode: ProductMode;
}) {
  const fit = recipeTechnicalFit(result);
  const dimensions = commercialDimensions(result.scores);
  const modeName = copy.studio.goal.modes[mode].name;

  // Owner P0 (score truthfulness): show ASSESSMENT COVERAGE honestly. An
  // indicator without a band (uncalibrated for this profile × temperature —
  // e.g. provisional sorbet cells) is EXCLUDED from the assessed count and the
  // card carries a partial-assessment note. Bands are never invented here.
  const banded = result.indicators.filter((i) => i.band != null);
  const total = result.indicators.length;
  const partial = total > 0 && banded.length < total;
  const fallbackBands = result.indicators.some(
    (i) => i.category_fallback === true || i.temperature_fallback === true,
  );

  return (
    <CharcoalPanel padding="lg">
      <div className="flex items-center justify-between gap-4">
        <SectionLabel tone="ivory">{o.eyebrow}</SectionLabel>
        <span className="text-[0.625rem] tracking-label text-ivory-soft uppercase">
          {modeName} {o.modeSuffix}
        </span>
      </div>

      {fit.score === null ? (
        <div className="mt-3" aria-label={fit.ariaText}>
          <span className="font-mono text-2xl font-medium text-ivory/60">{fit.display}</span>
          <p className="mt-2 text-sm leading-relaxed text-ivory-soft">{fit.label}</p>
        </div>
      ) : (
        <div
          className="mt-3 flex items-baseline gap-3"
          aria-label={fit.ariaText}
          title={TECHNICAL_FIT_TOOLTIPS[fit.tooltipKey]}
        >
          <span className="font-mono text-[40px] font-medium leading-none tracking-tight tabular-nums text-ivory">
            {fit.display}
          </span>
          <span className="text-sm font-medium text-ivory">{fit.label}</span>
        </div>
      )}

      {fit.score !== null && (partial || fallbackBands || fit.provisional) ? (
        <p className="mt-2 text-xs leading-relaxed text-ivory-soft" data-testid="score-coverage">
          {o.coverage(banded.length, total)}
          {partial || fallbackBands || fit.provisional ? ` ${o.partialNote}` : ''}
        </p>
      ) : null}

      {/* ACCEPTANCE ADDENDUM (2): flavor/cost as SEPARATE labeled dimensions —
          clearly outside the technical headline, integer-only, honest no-data. */}
      {fit.score !== null ? (
        <div
          className="mt-3 space-y-1 border-t border-ivory/10 pt-3"
          data-testid="score-dimensions"
        >
          <p className="text-[0.625rem] tracking-label text-ivory-soft uppercase">
            {o.dimensionsHeading}
          </p>
          <div className="flex items-baseline justify-between gap-3 text-xs text-ivory-soft">
            <span>{o.flavorDimension}</span>
            <span className="font-mono tabular-nums">{dimensions.flavor.display}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3 text-xs text-ivory-soft">
            <span>{o.costDimension}</span>
            <span className="font-mono tabular-nums">
              {dimensions.cost.score === null ? o.costNoData : dimensions.cost.display}
            </span>
          </div>
        </div>
      ) : null}
    </CharcoalPanel>
  );
}
