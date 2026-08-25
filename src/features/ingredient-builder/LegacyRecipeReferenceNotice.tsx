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
          : `${issues.length} historyczne produkty wymagają sprawdzenia`
      }
      description="Nie możemy jednoznacznie połączyć tej pozycji ze starej wersji receptury z aktualnym katalogiem."
      variant="attention"
      testId="legacy-recipe-reference-notice"
    >
      <ul className="mt-2 space-y-1.5">
        {issues.map((issue) => {
          const name = items.find((item) => item.id === issue.lineId)?.ingredient.name;
          return (
            <li key={issue.lineId} className="flex min-w-0 items-center justify-between gap-3">
              <span className="min-w-0 truncate font-medium text-ink">
                {name || 'Produkt historyczny'}
              </span>
              <button
                type="button"
                className="pro-focus-ring min-h-9 shrink-0 rounded-full border border-ink/15 bg-white px-3 font-semibold text-ink hover:border-ink/35"
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
