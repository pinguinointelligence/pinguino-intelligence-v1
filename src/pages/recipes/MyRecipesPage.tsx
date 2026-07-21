import { useNavigate } from 'react-router';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { AppShell } from '@/features/shell/AppShell';
import { savedToRecipeInput, type SavedRecipe } from '@/features/recipes/recipePayload';
import { useDeleteRecipe, useSavedRecipes } from '@/features/recipes/useSavedRecipes';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { resolveRecipesRepository } from '@/features/pro-core/proCoreRecipeRepo';

const r = copy.recipes;

const labelFor = (table: Record<string, { readonly label: string }>, key: string | null): string =>
  (key ? table[key]?.label : undefined) ?? key ?? '—';

const PRODUCT_LABELS = copy.productTypes as Record<string, { readonly label: string }>;
/** Serving labels + legacy storage ids (AUDIT #19 / SPEC §11.2): rows saved before
 * the vocabulary split may carry 'storage-minus-18' in `serving_profile` — they
 * must keep displaying honestly, labeled as STORAGE, never as a serving choice. */
const SERVING_LABELS = { ...copy.storageProfiles, ...copy.servingProfiles } as Record<
  string,
  { readonly label: string }
>;

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[0.6rem] tracking-label text-stone-400 uppercase">{label}</span>
      <span className="text-sm text-ink">{value}</span>
    </span>
  );
}

export function MyRecipesPage() {
  const navigate = useNavigate();
  const available = useAuthStore((state) => state.available);
  const status = useAuthStore((state) => state.status);
  const openAuthModal = useAuthModalStore((state) => state.open);
  const loadRecipeInput = useRecipeStore((state) => state.loadRecipeInput);

  const authed = status === 'authed';
  const recipesQuery = useSavedRecipes(authed);
  const deleteRecipe = useDeleteRecipe();

  const onOpen = async (row: SavedRecipe) => {
    try {
      const input = savedToRecipeInput(row.recipe_input);
      // Link to the aggregate so the next save appends a NEW VERSION (not a copy). A legacy orphan
      // row (no aggregate/meta) links only its name → the next save creates a fresh aggregate.
      let aggregate = null;
      try {
        const repo = resolveRecipesRepository().repository;
        aggregate = repo ? await repo.getRecipe(row.id) : null;
      } catch {
        aggregate = null;
      }
      loadRecipeInput(
        input,
        aggregate
          ? { savedId: row.id, savedName: row.name, versionNumber: aggregate.latestVersionNumber }
          : { savedId: null, savedName: row.name, versionNumber: null },
      );
      navigate('/studio');
    } catch {
      // A malformed saved recipe cannot be loaded — leave the user on the list.
    }
  };

  const rows = recipesQuery.data ?? [];

  return (
    <AppShell maxWidthClass="max-w-4xl">
      <div className="mx-auto max-w-4xl px-6 pb-24 pt-2">
        <SectionLabel>{r.title}</SectionLabel>

        {!available ? (
          <p className="mt-6 text-sm leading-relaxed text-stone-500">{r.unavailable}</p>
        ) : !authed ? (
          <div className="mt-6 flex items-center gap-4">
            <p className="text-sm leading-relaxed text-stone-600">{r.signInToView}</p>
            <button type="button" className={buttonClasses('primary', 'sm')} onClick={openAuthModal}>
              {r.signInCta}
            </button>
          </div>
        ) : recipesQuery.isLoading ? (
          <p className="mt-6 text-sm text-stone-500">{r.loading}</p>
        ) : rows.length === 0 ? (
          <p className="mt-6 text-sm leading-relaxed text-stone-500">{r.empty}</p>
        ) : (
          <ul className="mt-6 divide-y divide-ink/5">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="truncate text-base text-ink">{row.name}</p>
                  {row.description ? (
                    <p className="mt-0.5 truncate text-xs text-stone-500">{row.description}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-5">
                  <Cell label={r.columns.product} value={labelFor(PRODUCT_LABELS, row.product_type)} />
                  <Cell label={r.columns.serving} value={labelFor(SERVING_LABELS, row.serving_profile)} />
                  <Cell label={r.columns.engine} value={row.active_engine_label} />
                  <Cell label={r.columns.batch} value={`${row.batch_grams} g`} />
                  <Cell
                    label={r.columns.updated}
                    value={new Date(row.updated_at).toLocaleDateString('pl-PL')}
                  />
                  <button type="button" className={buttonClasses('primary', 'sm')} onClick={() => void onOpen(row)}>
                    {r.open}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-stone-500 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-status-risky"
                    onClick={() => {
                      if (window.confirm(r.confirmDelete)) deleteRecipe.mutate(row.id);
                    }}
                  >
                    {r.delete}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {/* S2 UX: version history is NOT duplicated here. Moje receptury shows ONE list of recipe
            aggregates; a recipe's immutable version history lives in the PINGÜINO Pro „Wersje" tab,
            scoped to the opened recipe. */}
      </div>
    </AppShell>
  );
}
