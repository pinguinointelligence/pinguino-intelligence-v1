import { useNavigate } from 'react-router';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { AppShell } from '@/features/shell/AppShell';
import { savedToRecipeInput, type SavedRecipe } from '@/features/recipes/recipePayload';
import { formatSavedRecipeDate } from '@/features/recipes/savedRecipeDate';
import {
  readSavedRecipeMetadata,
  savedRecipeMetadataLabels,
  type SavedRecipeMetadataLabels,
} from '@/features/recipes/savedRecipeMetadata';
import { useDeleteRecipe, useSavedRecipes } from '@/features/recipes/useSavedRecipes';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { resolveRecipesRepository } from '@/features/pro-core/proCoreRecipeRepo';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { readRecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import type {
  RecipeVersion,
  SavedRecipe as SavedRecipeAggregate,
} from '@/features/pro-core/recipeContracts';

const r = copy.recipes;

/**
 * One row's TYP / TRYB / SILNIK / ILOŚĆ, read from the state the save actually persisted
 * (`recipe_input`) rather than from the denormalized columns the canonical save path never wrote —
 * see `savedRecipeMetadata.ts` for the defect this replaces.
 */
const rowLabels = (row: SavedRecipe): SavedRecipeMetadataLabels =>
  savedRecipeMetadataLabels(
    readSavedRecipeMetadata(row.recipe_input, {
      product_type: row.product_type,
      serving_profile: row.serving_profile,
      batch_grams: row.batch_grams,
    }),
    row.active_engine_label ?? null,
  );

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[0.6rem] tracking-label text-stone-400 uppercase">{label}</span>
      <span className="text-sm text-ink">{value}</span>
    </span>
  );
}

export function MyRecipesContent() {
  const navigate = useNavigate();
  const persona = useProCorePersona();
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
      let aggregate: SavedRecipeAggregate | null = null;
      let latestVersion: RecipeVersion | null = null;
      try {
        const repo = resolveRecipesRepository().repository;
        aggregate = repo ? await repo.getRecipe(row.id) : null;
        latestVersion =
          repo && aggregate
            ? await repo.getVersion(row.id, aggregate.latestVersionNumber)
            : null;
      } catch {
        aggregate = null;
        latestVersion = null;
      }
      const openedInput = latestVersion?.recipeInput ?? input;
      loadRecipeInput(
        openedInput,
        aggregate
          ? {
              savedId: row.id,
              savedName: row.name,
              versionNumber: aggregate.latestVersionNumber,
              versionId: latestVersion?.versionId ?? null,
              versionDate: latestVersion?.createdAt ?? aggregate.updatedAt,
              composition:
                latestVersion?.productComposition ??
                readRecipeCompositionMetadata(
                  row.product_composition,
                  openedInput.items.map((item) => item.id),
                  openedInput.items
                    .filter((item) => item.lock_type === 'main')
                    .map((item) => item.id),
                ),
            }
          : {
              savedId: null,
              savedName: row.name,
              versionNumber: null,
              versionDate: null,
              composition: readRecipeCompositionMetadata(
                row.product_composition,
                openedInput.items.map((item) => item.id),
                openedInput.items
                  .filter((item) => item.lock_type === 'main')
                  .map((item) => item.id),
              ),
            },
      );
      navigate(persona === 'pro' ? '/pro/recipe' : '/home');
    } catch {
      // A malformed saved recipe cannot be loaded — leave the user on the list.
    }
  };

  const rows = recipesQuery.data ?? [];

  return (
    <div className="pb-16 pt-2" data-testid="recipes-mine">
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
                <Cell label={r.columns.product} value={rowLabels(row).productType} />
                <Cell label={r.columns.serving} value={rowLabels(row).mode} />
                <Cell label={r.columns.engine} value={rowLabels(row).engine} />
                <Cell label={r.columns.batch} value={rowLabels(row).batch} />
                <Cell
                  label={r.columns.updated}
                  value={formatSavedRecipeDate(row.latest_version_at ?? row.updated_at)}
                />
                <button
                  type="button"
                  className={buttonClasses('primary', 'sm')}
                  onClick={() => void onOpen(row)}
                >
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
  );
}

/** Legacy standalone wrapper. The canonical customer route embeds the same content in /recipes. */
export function MyRecipesPage() {
  return (
    <AppShell maxWidthClass="max-w-4xl">
      <div className="mx-auto max-w-4xl px-6 pb-24 pt-2">
        <MyRecipesContent />
      </div>
    </AppShell>
  );
}
