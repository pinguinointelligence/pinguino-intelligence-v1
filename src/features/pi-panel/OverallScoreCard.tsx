/**
 * Rail focal — the deep-charcoal score card (Design Lock), now the §15.1 PUBLIC
 * score (UIUX Slice D, owner decision + audit #9):
 *
 *  - „Dopasowanie receptury" as an INTEGER 1–10 with the exact §15.1 verdict —
 *    never „X / 100", never a percent, never decimals. The engine's 0–100
 *    float stays internal; rounding happens only in the recipe-score adapter.
 *  - The raw technical/flavor/cost sub-scores are REMOVED from the public
 *    card: §15.1 bans certificate-style precision and §22 keeps scoring
 *    internals out of the presentation (the §14.2/9 Expert module shows the
 *    original technical values — POD/PAC/NPAC/ice — instead).
 *  - Screen readers get both the number and the verdict (§21.5); the tooltip
 *    says 10/10 is not a laboratory guarantee (§15.2).
 *
 * Reads the already-computed engine scores; never recomputes. Null-safe for
 * empty recipes (honest „Brak danych" path).
 */
import { SectionLabel } from '@/components/shared/SectionLabel';
import { CharcoalPanel } from '@/components/ui/CharcoalPanel';
import { copy } from '@/copy/en';
import type { ProductMode, RecipeResult } from '@/engine';
import { MATCH_SCORE_TOOLTIPS, recipeMatchScore } from '@/features/recipe-score';

const o = copy.studio.overall;

export function OverallScoreCard({
  result,
  mode,
}: {
  result: RecipeResult;
  mode: ProductMode;
}) {
  const match = recipeMatchScore(result.scores);
  const modeName = copy.studio.goal.modes[mode].name;

  return (
    <CharcoalPanel padding="lg">
      <div className="flex items-center justify-between gap-4">
        <SectionLabel tone="ivory">{o.eyebrow}</SectionLabel>
        <span className="text-[0.625rem] tracking-label text-ivory-soft uppercase">
          {modeName} {o.modeSuffix}
        </span>
      </div>

      {match.score === null ? (
        <div className="mt-3" aria-label={match.ariaText}>
          <span className="font-mono text-2xl font-medium text-ivory/40">{match.display}</span>
          <p className="mt-2 text-sm leading-relaxed text-ivory-soft">{match.label}</p>
        </div>
      ) : (
        <div
          className="mt-3 flex items-baseline gap-3"
          aria-label={match.ariaText}
          title={MATCH_SCORE_TOOLTIPS[match.tooltipKey]}
        >
          <span className="font-mono text-[40px] font-medium leading-none tracking-tight tabular-nums text-ivory">
            {match.display}
          </span>
          <span className="text-sm font-medium text-ivory">{match.label}</span>
        </div>
      )}
    </CharcoalPanel>
  );
}
