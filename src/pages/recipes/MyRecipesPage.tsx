import { useNavigate } from 'react-router';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { AppMenu } from '@/features/shell/AppMenu';
import { savedToRecipeInput, type SavedRecipe } from '@/features/recipes/recipePayload';
import { useDeleteRecipe, useSavedRecipes } from '@/features/recipes/useSavedRecipes';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';

const r = copy.recipes;

const labelFor = (table: Record<string, { readonly label: string }>, key: string | null): string =>
  (key ? table[key]?.label : undefined) ?? key ?? '—';

const PRODUCT_LABELS = copy.productTypes as Record<string, { readonly label: string }>;
const SERVING_LABELS = copy.servingProfiles as Record<string, { readonly label: string }>;

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

  const onOpen = (row: SavedRecipe) => {
    try {
      const input = savedToRecipeInput(row.recipe_input);
      loadRecipeInput(input, row.id, row.name);
      navigate('/studio');
    } catch {
      // A malformed saved recipe cannot be loaded — leave the user on the list.
    }
  };

  const rows = recipesQuery.data ?? [];

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
        <AppMenu />
        <span className="text-[0.7rem] font-light tracking-wordmark text-stone-400">{copy.brand.name}</span>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-24 pt-6">
        <SectionLabel>{r.title}</SectionLabel>

        {!available ? (
          <p className="mt-6 text-sm leading-relaxed text-stone-500">{r.unavailable}</p>
        ) : !authed ? (
          <div className="mt-6 flex items-center gap-4">
            <p className="text-sm leading-relaxed text-stone-600">{r.signInToView}</p>
            <button type="button" className={buttonClasses('primary', 'sm')} onClick={openAuthModal}>
              {copy.menu.signIn}
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
                    value={new Date(row.updated_at).toLocaleDateString()}
                  />
                  <button type="button" className={buttonClasses('primary', 'sm')} onClick={() => onOpen(row)}>
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
      </main>
    </div>
  );
}
