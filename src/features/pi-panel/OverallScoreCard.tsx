import { MetricValue } from '@/components/shared/MetricValue';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { CharcoalPanel } from '@/components/ui/CharcoalPanel';
import { copy } from '@/copy/en';
import type { ProductMode, RecipeResult } from '@/engine';

const o = copy.studio.overall;
const m = copy.studio.metrics;

/**
 * Rail focal — the single deep-charcoal contrast block (Design Lock). Reads the
 * already-computed engine scores; never recomputes. Null-safe for empty recipes.
 */
export function OverallScoreCard({
  result,
  mode,
}: {
  result: RecipeResult;
  mode: ProductMode;
}) {
  const scores = result.scores;
  const modeName = copy.studio.goal.modes[mode].name;

  return (
    <CharcoalPanel padding="lg">
      <div className="flex items-center justify-between gap-4">
        <SectionLabel tone="ivory">{o.eyebrow}</SectionLabel>
        <span className="text-[0.625rem] tracking-label text-ivory-soft uppercase">
          {modeName} {o.modeSuffix}
        </span>
      </div>

      {scores === null ? (
        <p className="mt-4 text-sm leading-relaxed text-ivory-soft">{o.empty}</p>
      ) : (
        <>
          <div className="mt-3 flex items-end gap-1">
            <MetricValue value={scores.overall} precision={0} size="lg" className="text-ivory" />
            <span className="mb-1 text-sm text-ivory-soft">/ 100</span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3 border-t border-ivory/15 pt-4">
            <SubScore label={m.technical} value={scores.technical} />
            <SubScore label={m.flavor} value={scores.flavor} />
            <SubScore label={m.cost} value={scores.cost} />
          </div>
        </>
      )}
    </CharcoalPanel>
  );
}

function SubScore({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <span className="block text-[0.625rem] tracking-label text-ivory-soft uppercase">
        {label}
      </span>
      {value === null ? (
        <span className="mt-1 block font-mono text-sm text-ivory-soft">—</span>
      ) : (
        <MetricValue value={value} precision={0} size="sm" className="mt-1 block text-ivory" />
      )}
    </div>
  );
}
