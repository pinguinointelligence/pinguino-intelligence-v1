import { Card } from '@/components/ui/Card';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { communityCopy } from '@/copy/community';
import type { DemoSafeRecipe } from '@/features/community/domain/demoSafeRecipe';
import { cn } from '@/lib/cn';

/**
 * The safe minimal Demo preview (§15, §17).
 *
 * The final Gellatti Demo UI is NOT finished. This component exists so the
 * Community and sharing architecture does not wait for it, and so that when
 * the real Demo arrives it plugs into a contract whose security has already
 * been settled: it accepts `DemoSafeRecipe` and NOTHING else.
 *
 * That type has no gram field, so there is no prop through which this
 * component could render one even by mistake — the security decision was made
 * at the database, and the type system carries it the rest of the way (§16).
 *
 * It is deliberately not an empty paywall (§17): the recipient sees the real
 * ingredient list, the real structure and the real machine context, and
 * understands „to jest ta receptura, którą mi wysłano".
 */
export function DemoRecipePreview({
  recipe,
  className,
}: {
  recipe: DemoSafeRecipe;
  className?: string;
}) {
  const copy = communityCopy;
  return (
    <Card className={cn('flex flex-col gap-6', className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionLabel>{copy.demo.badge}</SectionLabel>
          <p className="mt-2 text-base font-medium text-ink">{copy.demo.title}</p>
          <p className="mt-1 max-w-md text-sm leading-relaxed text-stone-500">{copy.demo.body}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-ink/10 pt-5 sm:grid-cols-4">
        {recipe.category ? (
          <Field label="Kategoria" value={recipe.category} />
        ) : null}
        {recipe.target_temperature_c !== undefined ? (
          <Field label="Temperatura" value={`${recipe.target_temperature_c}°C`} />
        ) : null}
        {recipe.target_batch_grams !== undefined ? (
          <Field label="Partia" value={`${recipe.target_batch_grams} g`} />
        ) : null}
        <Field label="Składników" value={String(recipe.line_count)} />
      </dl>

      <div className="border-t border-ink/10 pt-5">
        <SectionLabel>Skład</SectionLabel>
        <ul className="mt-3 flex flex-col divide-y divide-ink/5">
          {recipe.items.map((item, index) => (
            <li
              key={`${item.name}-${index}`}
              className="flex items-baseline justify-between gap-4 py-2.5"
            >
              <span className="text-sm text-ink">
                {item.name}
                {item.is_main ? (
                  <span className="ml-2 text-xs tracking-label uppercase text-stone-400">Main</span>
                ) : null}
              </span>
              {/* The gram column exists visually, and is honest about WHY it is
                  empty. The value is not hidden here — it was never sent. */}
              <span className="font-mono text-xs text-stone-300" aria-label={copy.demo.gramsHidden}>
                ·····
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-stone-400">{copy.demo.gramsHidden}</p>
      </div>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs tracking-label uppercase text-stone-400">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{value}</dd>
    </div>
  );
}
