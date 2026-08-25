import type { EffectiveRecipeItem } from '@/engine';
import { WorkflowNotice } from '@/components/shared/WorkflowNotice';

export interface LegacyRecipeReferenceIssue {
  lineId: string;
  reason: string;
}

export function LegacyRecipeReferenceNotice({
  issues,
  items,
  onInspect,
}: {
  issues: readonly LegacyRecipeReferenceIssue[];
  items: readonly EffectiveRecipeItem[];
  onInspect: (lineId: string) => void;
}) {
  if (issues.length === 0) return null;

  return (
    <WorkflowNotice
      className="mt-2"
      eyebrow="Receptura historyczna"
      title={
        issues.length === 1
          ? '1 historyczny produkt wymaga sprawdzenia'
          : `${issues.length} historycznych produktów wymaga sprawdzenia`
      }
      description="Nie możemy jednoznacznie połączyć tej pozycji ze starej wersji receptury z aktualnym katalogiem."
      variant="attention"
      testId="legacy-recipe-reference-notice"
    >
      <ul className="mt-1.5 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
        {issues.map((issue) => {
          const name = items.find((item) => item.id === issue.lineId)?.ingredient.name;
          return (
            <li
              key={issue.lineId}
              className="flex min-h-8 min-w-0 items-center justify-between gap-2 border-t border-ink/[0.065] first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
            >
              <span className="min-w-0 truncate font-medium text-ink">
                {name || 'Produkt historyczny'}
              </span>
              <button
                type="button"
                className="pro-focus-ring min-h-11 shrink-0 rounded-xl border border-ink/15 bg-white px-2.5 text-[11px] font-semibold text-ink hover:border-ink/35 lg:h-7 lg:min-h-0"
                onClick={() => onInspect(issue.lineId)}
              >
                Sprawdź produkt
              </button>
            </li>
          );
        })}
      </ul>
    </WorkflowNotice>
  );
}
