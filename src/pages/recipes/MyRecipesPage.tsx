import { useState } from 'react';
import { useNavigate } from 'react-router';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { EmptyState } from '@/components/shared/EmptyState';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { AppShell } from '@/features/shell/AppShell';
import {
  APP_PAGE_BLOCK,
  APP_PAGE_MEASURE,
  APP_PAGE_WORKSPACE,
} from '@/features/shell/shellGeometry';
import { savedToRecipeInput, type SavedRecipe } from '@/features/recipes/recipePayload';
import { formatSavedRecipeDate } from '@/features/recipes/savedRecipeDate';
import {
  readSavedRecipeMetadata,
  savedRecipeMetadataLabels,
  type SavedRecipeMetadataLabels,
} from '@/features/recipes/savedRecipeMetadata';
import {
  RecipeVersionSelector,
  resolveSelectedVersion,
} from '@/features/recipes/RecipeVersionSelector';
import { useDeleteRecipe, useSavedRecipes } from '@/features/recipes/useSavedRecipes';
import { RecipeCommunityActions } from '@/features/community/ui/RecipeCommunityActions';
import { useCreatorProfile } from '@/features/community/useCreatorProfile';
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

  /**
   * Which immutable version each row will open. Local UI state ONLY — see RecipeVersionSelector:
   * choosing v1 here never restores, never touches the parent and never writes anything.
   */
  const [pickedVersionByRecipeId, setPickedVersionByRecipeId] = useState<Record<string, number>>(
    {},
  );
  const [openError, setOpenError] = useState<string | null>(null);

  const onOpen = async (row: SavedRecipe, requestedVersionNumber: number | null) => {
    setOpenError(null);
    try {
      const input = savedToRecipeInput(row.recipe_input);
      // Link to the aggregate so the next save appends a NEW VERSION (not a copy). A legacy orphan
      // row (no aggregate/meta) links only its name → the next save creates a fresh aggregate.
      let aggregate: SavedRecipeAggregate | null = null;
      let openedVersion: RecipeVersion | null = null;
      let repoReachable = true;
      try {
        const repo = resolveRecipesRepository().repository;
        aggregate = repo ? await repo.getRecipe(row.id) : null;
        const wanted = requestedVersionNumber ?? aggregate?.latestVersionNumber ?? null;
        openedVersion =
          repo && aggregate && wanted !== null ? await repo.getVersion(row.id, wanted) : null;
      } catch {
        aggregate = null;
        openedVersion = null;
        repoReachable = false;
      }
      // A specific historical version was asked for and could not be read. Opening the LATEST
      // instead would silently show different grams than the user selected, so refuse and say so.
      const askedForHistory =
        requestedVersionNumber !== null &&
        aggregate !== null &&
        requestedVersionNumber !== aggregate.latestVersionNumber;
      if (askedForHistory && !openedVersion) {
        setOpenError(r.versionSelector.openFailed(requestedVersionNumber));
        return;
      }
      if (!repoReachable && requestedVersionNumber !== null && requestedVersionNumber > 1) {
        setOpenError(r.versionSelector.historyUnavailable);
        return;
      }
      const openedInput = openedVersion?.recipeInput ?? input;
      loadRecipeInput(
        openedInput,
        aggregate
          ? {
              savedId: row.id,
              savedName: row.name,
              versionNumber: openedVersion?.versionNumber ?? aggregate.latestVersionNumber,
              latestVersionNumber: aggregate.latestVersionNumber,
              versionId: openedVersion?.versionId ?? null,
              versionDate: openedVersion?.createdAt ?? aggregate.updatedAt,
              composition:
                openedVersion?.productComposition ??
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
      setOpenError(r.versionSelector.openFailedGeneric);
    }
  };

  const rows = recipesQuery.data ?? [];
  // Whether this account has a Creator profile decides only what the PUBLISH
  // dialog says first — the database refuses a publication without one either
  // way (`creator_profile_required`).
  const hasCreatorProfile = useCreatorProfile(authed);
  /** A refreshed list resets to the newest version; a pick for a version that no longer exists
   * falls back to the newest rather than pointing at something that is gone. */
  const selectedVersion = (row: SavedRecipe): number | null =>
    resolveSelectedVersion(
      row.versions ?? [],
      pickedVersionByRecipeId[row.id],
      row.latest_version_number,
    );

  return (
    <div className="pb-16" data-testid="recipes-mine">
      <div className="flex items-end justify-between gap-4">
        <div>
          <SectionLabel>{r.title}</SectionLabel>
          <p className="mt-2 text-sm text-stone-500">
            Otwieraj zapisane wersje bez zmiany ich receptury źródłowej.
          </p>
        </div>
        <span className="font-mono text-xs text-stone-500">
          {rows.length > 0 ? `${rows.length} receptur` : null}
        </span>
      </div>

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
        <ApplicationState className="mt-6" kind="loading" title={r.loading} />
      ) : rows.length === 0 ? (
        <EmptyState className="mt-6" title={r.empty} />
      ) : (
        <>
          {openError ? (
            <p
              role="alert"
              className="mt-6 rounded-xl border border-terracotta/40 bg-terracotta/10 p-3 text-sm text-stone-700"
            >
              {openError}
            </p>
          ) : null}
          <ul className="mt-5 space-y-2.5">
            {rows.map((row) => (
              <li
                key={row.id}
                className="overflow-hidden rounded-[12px] border border-ink/12 bg-white shadow-pro-e0"
              >
                <div className="grid min-w-0 items-center gap-4 px-4 py-3 lg:grid-cols-[minmax(220px,1.45fr)_repeat(5,minmax(84px,0.62fr))]">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-ink">{row.name}</p>
                    {row.description ? (
                      <p className="mt-0.5 truncate text-xs text-stone-500">{row.description}</p>
                    ) : null}
                  </div>
                  <Cell label={r.columns.product} value={rowLabels(row).productType} />
                  <Cell label={r.columns.serving} value={rowLabels(row).mode} />
                  <Cell label={r.columns.engine} value={rowLabels(row).engine} />
                  <Cell label={r.columns.batch} value={rowLabels(row).batch} />
                  <Cell
                    label={r.columns.updated}
                    value={formatSavedRecipeDate(row.latest_version_at ?? row.updated_at)}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/8 bg-[#faf9f6] px-4 py-2.5">
                  <span className="flex flex-col">
                    <span className="text-[0.6rem] tracking-label text-stone-400 uppercase">
                      {r.columns.version}
                    </span>
                    <span className="-ml-1.5 mt-0.5">
                      <RecipeVersionSelector
                        versions={row.versions ?? []}
                        selected={selectedVersion(row) ?? 1}
                        onSelect={(versionNumber) =>
                          setPickedVersionByRecipeId((current) => ({
                            ...current,
                            [row.id]: versionNumber,
                          }))
                        }
                        recipeName={row.name}
                      />
                    </span>
                  </span>
                  <button
                    type="button"
                    className={buttonClasses('primary', 'sm')}
                    onClick={() => void onOpen(row, selectedVersion(row))}
                  >
                    {r.open}
                  </button>
                  {/* Both Community loops start here (§4, §7, §10): sharing binds
                    the SELECTED immutable version, publishing makes it
                    discoverable. Two separate acts, never one. */}
                  <RecipeCommunityActions
                    recipeId={row.id}
                    versionNumber={selectedVersion(row) ?? row.latest_version_number ?? 1}
                    recipeName={row.name}
                    hasCreatorProfile={hasCreatorProfile}
                  />
                  <button
                    type="button"
                    className="ml-auto min-h-9 px-2 text-xs text-stone-500 underline decoration-stone-300 underline-offset-4 transition-colors hover:text-status-risky"
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
        </>
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
    <div className="pro-studio-radius-system theme-pro-light">
      <AppShell>
        <div className={`${APP_PAGE_WORKSPACE} ${APP_PAGE_BLOCK}`}>
          <div className={APP_PAGE_MEASURE}>
            <MyRecipesContent />
          </div>
        </div>
      </AppShell>
    </div>
  );
}
