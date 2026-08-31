import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { CONFIG_VERSION, ENGINE_VERSION, type RecipeInput } from '@/engine';
import { recipeCapabilitiesFor } from '@/features/pro-core/proCoreCapabilities';
import { resolveRecipesRepository } from '@/features/pro-core/proCoreRecipeRepo';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { useAuthStore } from '@/stores/authStore';
import {
  buildDerivedRecipe,
  canDerive,
  derivationRpcArgs,
  type DerivationRefusal,
  type DerivationSource,
} from '@/features/community/domain/recipeDerivation';
import type { LineageRelation } from '@/features/community/domain/lineage';
import {
  getPublicationFull,
  openReceivedShare,
  openShare,
  recordDerivation,
} from '@/services/community';
import { customerErrorMessage } from '@/copy/customerError';

export type DerivationState =
  | { readonly status: 'idle' }
  | { readonly status: 'working' }
  | { readonly status: 'done'; readonly recipeId: string }
  | {
      readonly status: 'failed';
      readonly reason: DerivationRefusal | 'save_failed';
      readonly message?: string;
    };

export interface DerivationTarget {
  readonly source: DerivationSource;
  /** For a share source: the token, when the caller has one. */
  readonly shareToken?: string | null;
  readonly sourceTitle: string;
  readonly sourceCreatorDisplayName: string;
}

/**
 * „Użyj tej receptury" and „Stwórz moją wersję", end to end (§20–§22, §65, §66).
 *
 * The whole flow in one place, in order:
 *
 *   1. RE-READ the source from the server. The page the user is looking at
 *      holds only the demo-safe projection — it has no grams by construction —
 *      so the formulation is fetched now, through the entitlement-gated RPC.
 *      A user who is not entitled gets a typed refusal here, not a broken save.
 *   2. CREATE an independent recipe through the EXISTING persistence path
 *      (`RecipesRepository.createRecipe` → `create_recipe_with_v1`), which
 *      writes the recipe, its meta and its immutable V1 in one transaction.
 *      Nothing about recipe saving or versioning was changed for this feature.
 *   3. STAMP lineage + the usage event via `gellatti_record_derivation_v1`.
 *      Idempotent per derived recipe, so a retry cannot count twice.
 *   4. OPEN the new recipe in the editor.
 *
 * THE SOURCE IS NEVER WRITTEN TO. Step 1 is a read; steps 2–4 touch only the
 * new recipe and the append-only attribution tables.
 *
 * DOUBLE-CLICK: `inFlight` is a ref, not state, so the guard is effective on
 * the very next synchronous click rather than after a re-render.
 *
 * PARTIAL FAILURE IS HONEST: if step 3 fails after step 2 succeeded, the user
 * KEEPS their recipe (it is real and saved) and the failure is surfaced. We
 * never delete a saved recipe to tidy up bookkeeping, and never report a
 * success that did not happen.
 */
export function useRecipeDerivation(target: DerivationTarget) {
  const navigate = useNavigate();
  const persona = useProCorePersona();
  const ownerId = useAuthStore((state) => state.user?.id ?? null);
  const repoState = useMemo(() => resolveRecipesRepository(), []);
  const [state, setState] = useState<DerivationState>({ status: 'idle' });
  const inFlight = useRef(false);

  const derive = useCallback(
    async (relation: LineageRelation): Promise<void> => {
      const gate = canDerive({
        isEntitled: true, // the server decides; this only blocks obvious no-ops
        inFlight: inFlight.current,
        sourceAvailable: Boolean(repoState.repository) && Boolean(ownerId),
      });
      if (!gate.ok) {
        if (gate.reason !== 'already_in_flight') {
          setState({ status: 'failed', reason: gate.reason });
        }
        return;
      }

      inFlight.current = true;
      setState({ status: 'working' });
      try {
        // 1. Read the source formulation through the entitlement-gated RPC.
        const full = await readSource(target);
        if (!full.ok) {
          setState({ status: 'failed', reason: full.reason });
          return;
        }

        const payload = buildDerivedRecipe({
          relation,
          source: target.source,
          recipeInput: full.recipeInput,
          sourceTitle: target.sourceTitle,
          sourceCreatorDisplayName: target.sourceCreatorDisplayName,
          engineVersion: full.engineVersion ?? ENGINE_VERSION,
          configVersion: full.configVersion ?? CONFIG_VERSION,
          totalBatchG: full.totalBatchG,
        });

        // 2. The existing atomic create-with-v1 path. Independent recipe,
        //    owned by THIS user, with its own immutable V1.
        const { recipe } = await repoState.repository!.createRecipe({
          ownerUserId: ownerId!,
          title: payload.title,
          notes: payload.notes,
          recipeInput: payload.recipeInput as RecipeInput,
          // Carry the source's resolved ProductBehavior snapshots. A copy keeps the
          // lines it copied, so it keeps their product authority — inventing or
          // nulling it is what made every ingredient-bearing recipe undecidable to
          // the guard.
          productComposition: full.productComposition as never,
          trace: {
            engineVersion: payload.engineVersion,
            configVersion: payload.configVersion,
            mapperDatasetVersion: null,
          },
          // 'imported' is the honest source label for a snapshot that came
          // from somebody else's published or shared version.
          source: 'imported',
          by: ownerId!,
          capabilities: recipeCapabilitiesFor(persona),
        });

        // 3. Attribution. A failure here must not cost the user their recipe.
        try {
          await recordDerivation(derivationRpcArgs(target.source, relation, recipe.recipeId));
        } catch {
          setState({
            status: 'failed',
            reason: 'save_failed',
            message:
              'Receptura została zapisana, ale nie udało się zachować informacji o źródle. ' +
              'Sama receptura jest bezpieczna — spróbuj ponownie później.',
          });
          return;
        }

        setState({ status: 'done', recipeId: recipe.recipeId });
        // 4. Open it.
        navigate('/pro/recipe');
      } catch (cause) {
        setState({
          status: 'failed',
          reason: 'save_failed',
          message: customerErrorMessage(cause, 'community'),
        });
      } finally {
        inFlight.current = false;
      }
    },
    [navigate, ownerId, persona, repoState.repository, target],
  );

  return {
    state,
    /** „Użyj tej receptury" — an independent copy. */
    useThisRecipe: useCallback(() => derive('copy'), [derive]),
    /** „Stwórz moją wersję" — an independent copy declared as a remix. */
    createMyVersion: useCallback(() => derive('remix'), [derive]),
    isWorking: state.status === 'working',
  };
}

type SourceRead =
  | {
      ok: true;
      recipeInput: unknown;
      /**
       * The source version's product composition — its RESOLVED ProductBehavior
       * snapshots, keyed by line id.
       *
       * Without it every copy of a recipe that HAS ingredient lines was refused by
       * `assert_recipe_behavior_authority_all_lines_v1`, which requires a resolved
       * snapshot per line ("no new version/run may be written until every line is
       * reconstructed and RESOLVED"). The guard was right; the read simply never
       * returned the composition, so `null` was passed and every line looked
       * unresolved. `buildDerivedRecipe` passes `recipeInput` through unchanged, so
       * the line ids still match and the snapshots apply exactly.
       */
      productComposition: unknown;
      engineVersion?: string;
      configVersion?: string;
      totalBatchG: number;
    }
  | { ok: false; reason: DerivationRefusal };

/**
 * Fetch the source formulation. Both branches go through an RPC that checks
 * paid access server-side, so „not entitled" is the server's answer, never the
 * client's guess.
 */
async function readSource(target: DerivationTarget): Promise<SourceRead> {
  if (target.source.kind === 'publication') {
    const result = await getPublicationFull(target.source.publicationId);
    if (!result.ok) {
      return {
        ok: false,
        reason: result.reason === 'entitlement_required' ? 'not_entitled' : 'source_unavailable',
      };
    }
    return {
      ok: true,
      recipeInput: result.recipe_input,
      productComposition: result.product_composition ?? null,
      engineVersion: result.engine_version,
      configVersion: result.config_version,
      totalBatchG: result.total_batch_g,
    };
  }

  const result = target.shareToken
    ? await openShare(target.shareToken)
    : await openReceivedShare(target.source.shareLinkId);
  if (!result.ok) return { ok: false, reason: 'source_unavailable' };
  if (result.entitlement !== 'full' || result.recipe_input === undefined) {
    return { ok: false, reason: 'not_entitled' };
  }
  return {
    ok: true,
    recipeInput: result.recipe_input,
    // KNOWN REMAINING GAP, stated rather than hidden: `gellatti_open_share_v1` and
    // `gellatti_open_received_share_v1` do not return `product_composition` (verified
    // 2026-08-31), so a SHARE of a recipe with ingredient lines still hits the same
    // authority refusal the publication path just escaped. Fixing it means changing
    // those two RPCs and re-proving the share flow, which is a separate task — this
    // `null` is deliberate and documented, not an oversight.
    productComposition: null,
    engineVersion: result.engine_version,
    configVersion: result.config_version,
    totalBatchG: result.total_batch_g ?? 0,
  };
}
