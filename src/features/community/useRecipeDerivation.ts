import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { CONFIG_VERSION, ENGINE_VERSION } from '@/engine';
import { resolveRecipesRepository } from '@/features/pro-core/proCoreRecipeRepo';
import { useProCorePersona } from '@/features/pro-core/useProCorePersona';
import { useAuthStore } from '@/stores/authStore';
import {
  buildDerivedRecipe,
  canDerive,
  type DerivationRefusal,
  type DerivationSource,
} from '@/features/community/domain/recipeDerivation';
import type { LineageRelation } from '@/features/community/domain/lineage';
import { presentLoadedRecipeInHome } from '@/features/home-creator/homeLoadedRecipe';
import { readRecipeCompositionMetadata } from '@/features/recipe-composition/recipeCompositionPersistence';
import { savedToRecipeInput } from '@/features/recipes/recipePayload';
import type { CommunityRecipeProvenance } from '@/features/recipes/recipeProvenance';
import { adoptWorkingCopy } from '@/features/recipes/workingCopy';
import { getPublicationFull, openReceivedShare, openShare } from '@/services/community';
import { customerErrorMessage } from '@/copy/customerError';

export type DerivationState =
  | { readonly status: 'idle' }
  | { readonly status: 'working' }
  | { readonly status: 'done' }
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
 * „Zrób te lody" and „Stwórz moją wersję" on a Community recipe, end to end.
 *
 * The whole flow in one place, in order:
 *
 *   1. RE-READ the source from the server. The page the user is looking at holds only the
 *      demo-safe projection — it has no grams by construction — so the formulation is fetched
 *      now, through the entitlement-gated RPC. A customer who is not entitled gets a typed
 *      refusal here, never a broken recipe.
 *   2. OPEN it as the customer's WORKING COPY through `adoptWorkingCopy` — the same adoption an
 *      official Gellatti recipe uses: an unsaved draft with no saved link, carrying the source
 *      version's resolved ProductBehavior composition and its Community provenance.
 *   3. SHOW it where the customer works — the PRO editor for Pro, HOME for everyone else.
 *
 * Lineage and the usage event are stamped when the working copy FIRST becomes the customer's
 * recipe: the canonical save (`useCanonicalRecipeSave.createNew`) reads the provenance, saves
 * with source `imported` and calls `gellatti_record_derivation_v1` (idempotent per derived
 * recipe). Opening therefore never spends the customer's recipe allowance and never counts a
 * "use" that was only a look.
 *
 * THE SOURCE IS NEVER WRITTEN TO. Step 1 is a read; steps 2–3 touch only the local draft.
 *
 * DOUBLE-CLICK: `inFlight` is a ref, not state, so the guard is effective on the very next
 * synchronous click rather than after a re-render.
 */
export interface DerivationOptions {
  /**
   * Where the working copy is shown once it is loaded.
   *
   * Default: the customer's workspace — the PRO editor for Pro, HOME for everyone else. HOME's
   * own match popup passes its opener, because it is already on the page that shows it. This
   * is a seam, not a second derivation: steps 1–2 are identical for every caller.
   */
  readonly openWorkingCopy?: () => void | Promise<void>;
}

export function useRecipeDerivation(target: DerivationTarget, options: DerivationOptions = {}) {
  const navigate = useNavigate();
  const persona = useProCorePersona();
  const ownerId = useAuthStore((state) => state.user?.id ?? null);
  const repoState = useMemo(() => resolveRecipesRepository(), []);
  const [state, setState] = useState<DerivationState>({ status: 'idle' });
  const inFlight = useRef(false);

  const openWorkingCopy = options.openWorkingCopy;
  const derive = useCallback(
    // Returns the TERMINAL state it reached. Callers must branch on this value,
    // never on `state` after awaiting: `state` is React state, so a handler that
    // read it back would still see the value from its own render and mistake a
    // success for a no-op.
    async (relation: LineageRelation): Promise<DerivationState> => {
      const gate = canDerive({
        isEntitled: true, // the server decides; this only blocks obvious no-ops
        inFlight: inFlight.current,
        sourceAvailable: Boolean(repoState.repository) && Boolean(ownerId),
      });
      if (!gate.ok) {
        const refused: DerivationState =
          gate.reason === 'already_in_flight'
            ? { status: 'working' }
            : { status: 'failed', reason: gate.reason };
        if (gate.reason !== 'already_in_flight') setState(refused);
        return refused;
      }

      inFlight.current = true;
      setState({ status: 'working' });
      try {
        // 1. Read the source formulation through the entitlement-gated RPC.
        const full = await readSource(target);
        if (!full.ok) {
          const refused: DerivationState = { status: 'failed', reason: full.reason };
          setState(refused);
          return refused;
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
        const input = savedToRecipeInput(payload.recipeInput);

        // 2. The customer's working copy. The source's resolved ProductBehavior snapshots
        //    come with it: a copy keeps the lines it copied, so it keeps their product
        //    authority — nulling it is what made every ingredient-bearing copy undecidable
        //    to `assert_recipe_behavior_authority_all_lines_v1`.
        adoptWorkingCopy({
          input,
          name: payload.title,
          composition: readRecipeCompositionMetadata(
            full.productComposition,
            input.items.map((item) => item.id),
            input.items.filter((item) => item.lock_type === 'main').map((item) => item.id),
          ),
          provenance: communityProvenance(target, relation, full.versionNumber),
        });

        const done: DerivationState = { status: 'done' };
        setState(done);
        // 3. Show it where this customer works.
        if (openWorkingCopy) await openWorkingCopy();
        else if (persona === 'pro') navigate('/pro/recipe');
        else {
          presentLoadedRecipeInHome({
            label: payload.title,
            publicationId:
              target.source.kind === 'publication' ? target.source.publicationId : null,
          });
          navigate('/home');
        }
        return done;
      } catch (cause) {
        const refused: DerivationState = {
          status: 'failed',
          reason: 'save_failed',
          message: customerErrorMessage(cause, 'community'),
        };
        setState(refused);
        return refused;
      } finally {
        inFlight.current = false;
      }
    },
    [navigate, openWorkingCopy, ownerId, persona, repoState.repository, target],
  );

  return {
    state,
    /** „Zrób te lody" — the customer's own working copy of this recipe. */
    useThisRecipe: useCallback(() => derive('copy'), [derive]),
    /** „Stwórz moją wersję" — the same working copy, declared as a remix. */
    createMyVersion: useCallback(() => derive('remix'), [derive]),
    isWorking: state.status === 'working',
  };
}

function communityProvenance(
  target: DerivationTarget,
  relation: LineageRelation,
  sourceVersionNumber: number | null,
): CommunityRecipeProvenance {
  return {
    schemaVersion: 1,
    kind: 'community',
    relation,
    publicationId: target.source.kind === 'publication' ? target.source.publicationId : null,
    shareLinkId: target.source.kind === 'share' ? target.source.shareLinkId : null,
    sourceTitle: target.sourceTitle,
    sourceCreatorDisplayName: target.sourceCreatorDisplayName,
    sourceVersionNumber,
  };
}

type SourceRead =
  | {
      ok: true;
      recipeInput: unknown;
      /**
       * The source version's product composition — its RESOLVED ProductBehavior
       * snapshots, keyed by line id. `buildDerivedRecipe` passes `recipeInput` through
       * unchanged, so the line ids still match and the snapshots apply exactly.
       */
      productComposition: unknown;
      engineVersion?: string;
      configVersion?: string;
      totalBatchG: number;
      versionNumber: number | null;
    }
  | { ok: false; reason: DerivationRefusal };

const versionNumberOf = (result: object): number | null =>
  'version_number' in result && typeof result.version_number === 'number'
    ? result.version_number
    : null;

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
      versionNumber: versionNumberOf(result),
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
    // 2026-08-31), so a SHARE of a recipe with ingredient lines opens without its resolved
    // snapshots and its first save asks for the usual revalidation. Fixing it means changing
    // those two RPCs and re-proving the share flow, which is a separate task — this `null`
    // is deliberate and documented, not an oversight.
    productComposition: null,
    engineVersion: result.engine_version,
    configVersion: result.config_version,
    totalBatchG: result.total_batch_g ?? 0,
    versionNumber: versionNumberOf(result),
  };
}
