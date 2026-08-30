import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { cn } from '@/lib/cn';
import { marketProfile } from './marketProfiles';
import {
  DRAFT_LABEL_PENDING_LABEL,
  type DraftLabelPreview,
} from './draftLabelPreview';

/**
 * The workbench's DRAFT label — preview first, then what is still missing.
 *
 * OWNER DECISION (2026-08-30): before Production completes the reader sees the
 * label they are making, not a panel telling them to go elsewhere. Everything
 * shown here is read from the live recipe and the saved label profile; anything
 * only a completed run can supply is listed as outstanding rather than filled
 * in. The final PDF stays unavailable until that run exists — a draft is never
 * printable as a final label.
 *
 * Presentation only: no regulatory or nutrition maths happens here.
 */
export function DraftLabelCard({
  draft,
  logoUrl,
}: {
  draft: DraftLabelPreview;
  logoUrl: string | null;
}) {
  const profile = marketProfile(draft.market);
  const nutrition = draft.nutritionPer100g;
  const gram = (value: number) => `${value.toFixed(1)} g`;

  return (
    <div className="space-y-3" data-testid="draft-label-card">
      {/* ── 1. THE LABEL ────────────────────────────────────────────────── */}
      <Card padding="none" className="overflow-hidden">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--g-line)] p-4 sm:p-5">
          <div className="min-w-0">
            <span className="block text-[10px] leading-[1.25] font-bold tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">
              Etykieta · projekt
            </span>
            <h3 className="mt-1 text-[22px] leading-[1.2] font-bold tracking-[-0.025em] text-[var(--g-ink)]">
              {draft.productName ?? 'Receptura bez nazwy'}
            </h3>
            <p className="mt-1 text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
              {profile.label} · {draft.labelLanguages.join(', ').toUpperCase()}
            </p>
          </div>
          {logoUrl ? (
            <img src={logoUrl} alt="" className="size-12 shrink-0 object-contain" />
          ) : null}
        </header>

        <div className="grid gap-5 p-4 sm:p-5 md:grid-cols-2">
          <section>
            <span className="block text-[10px] leading-[1.25] font-bold tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">
              Składniki · wg masy
            </span>
            {draft.ingredients.length > 0 ? (
              <ol className="mt-2 space-y-1">
                {draft.ingredients.map((line) => (
                  <li
                    key={line.id}
                    className="flex items-baseline justify-between gap-3 text-[12px] leading-[1.5]"
                  >
                    <span className="min-w-0 text-[var(--g-ink)]">{line.name}</span>
                    <span className="shrink-0 font-mono tabular-nums text-[var(--g-text-secondary)]">
                      {line.percent === null ? '—' : `${line.percent.toFixed(1)} %`}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
                Dodaj składniki, żeby zobaczyć listę.
              </p>
            )}
          </section>

          <section>
            <span className="block text-[10px] leading-[1.25] font-bold tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">
              Wartości odżywcze · 100 g
            </span>
            {nutrition ? (
              <dl className="mt-2 space-y-1 text-[12px] leading-[1.5]">
                {(
                  [
                    ['Energia', `${Math.round(nutrition.kcal)} kcal`],
                    ['Tłuszcz', gram(nutrition.fat_g)],
                    [
                      'w tym kwasy nasycone',
                      nutrition.saturated_fat_g === null
                        ? '—'
                        : gram(nutrition.saturated_fat_g),
                    ],
                    ['Węglowodany', gram(nutrition.carbohydrate_g)],
                    ['w tym cukry', gram(nutrition.sugars_g)],
                    ['Białko', gram(nutrition.protein_g)],
                    ['Sól', gram(nutrition.salt_g)],
                  ] as const
                ).map(([term, value]) => (
                  <div key={term} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[var(--g-text-secondary)]">{term}</dt>
                    <dd className="font-mono tabular-nums text-[var(--g-ink)]">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-2 text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
                Wartości pojawią się, gdy składniki będą miały dane odżywcze.
              </p>
            )}
            {draft.plannedBatchG !== null ? (
              <p className="mt-3 text-[12px] leading-[1.5] text-[var(--g-text-secondary)]">
                Planowana partia:{' '}
                <span className="font-mono tabular-nums text-[var(--g-ink)]">
                  {Math.round(draft.plannedBatchG)} g
                </span>
              </p>
            ) : null}
          </section>
        </div>

        {draft.businessName || draft.operatorName ? (
          <footer className="border-t border-[var(--g-line)] px-4 py-3 text-[11px] leading-[1.5] text-[var(--g-text-secondary)] sm:px-5">
            {[draft.businessName, draft.operatorName, draft.operatorAddress]
              .filter(Boolean)
              .join(' · ')}
          </footer>
        ) : null}
      </Card>

      {/* ── 2. ONLY WHAT IS STILL MISSING ───────────────────────────────── */}
      <div
        className="rounded-[12px] border-l-2 border-[var(--g-orange)] bg-[var(--g-ivory)] p-[18px]"
        data-testid="draft-label-pending"
      >
        <span className="block text-[10px] leading-[1.25] font-bold tracking-[0.08em] text-[var(--g-text-secondary)] uppercase">
          Do finalnej etykiety brakuje
        </span>
        <ul className="mt-2 space-y-1">
          {draft.pending.map((id) => (
            <li
              key={id}
              className="flex gap-2 text-[12px] leading-[1.5] text-[var(--g-ink)]"
              data-testid={`draft-label-pending-${id}`}
            >
              <span aria-hidden className="text-[var(--g-orange)]">
                •
              </span>
              {DRAFT_LABEL_PENDING_LABEL[id]}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] leading-[1.6] text-[var(--g-text-secondary)]">
          Te dane powstają dopiero w Produkcji. Do tego czasu etykieta pozostaje projektem.
        </p>
      </div>

      {/* ── 3. ACTIONS ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled
          className={cn(buttonClasses('primary', 'sm'), 'cursor-not-allowed opacity-45')}
          data-testid="draft-label-print"
        >
          Drukuj finalną etykietę
        </button>
        <Link
          to="/labels"
          className={buttonClasses('ghost', 'sm')}
          data-testid="label-settings-home-link"
        >
          Zmień ustawienia
        </Link>
      </div>
    </div>
  );
}
