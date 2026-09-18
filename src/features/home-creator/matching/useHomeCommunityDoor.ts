/**
 * §37 — the ONE door through which HOME opens a Community recipe: the suggestions layer
 * („Wybierz” on its Community card) and „Receptury → Community” („Rozpocznij recepturę”).
 *
 * Nothing is decided here. The canonical `useRecipeDerivation` re-reads the source through
 * the entitlement-gated RPC, opens the customer's working copy and later records lineage;
 * HOME only asks a GUEST to sign in first (a derivation is saved to an account — exactly
 * as the official-recipe path does) and presents the working copy on its own page.
 *
 * §37/§38: derivation, lineage and root attribution are entirely `useRecipeDerivation` +
 * the canonical save's `recordDerivation`. There is no HOME lineage code.
 */
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useRecipeDerivation } from '@/features/community/useRecipeDerivation';
import { useAuthStore } from '@/stores/authStore';
import { homeCreatorCopy } from '../homeCreatorCopy';
import { presentLoadedRecipeInHome } from '../homeLoadedRecipe';

/** The canonical address of a Community publication (a `CommunityMatch` is one). */
export interface HomeCommunityDoorTarget {
  readonly publicationId: string;
  readonly handle: string;
  readonly slug: string;
  readonly title: string;
  readonly creatorDisplayName: string;
}

export interface HomeCommunityDoor {
  /** A derivation is in flight. */
  readonly busy: boolean;
  /** A refusal in customer language (`useRecipeDerivation` already words it). */
  readonly message: string | null;
  /**
   * Open the target as the customer's working copy. `true` only when the canonical
   * derivation completed — a guest (asked to sign in) or a typed refusal is `false`.
   */
  readonly open: () => Promise<boolean>;
}

export function useHomeCommunityDoor(
  target: HomeCommunityDoorTarget | null,
  options: {
    /** Keep the customer's idea chips (a match chosen FROM the idea) or start a fresh draft. */
    readonly keepIdea: boolean;
  },
): HomeCommunityDoor {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const openAuthModal = useAuthModalStore((state) => state.open);
  // The target is addressed by publication, exactly as the Community page does.
  const derivation = useRecipeDerivation(
    {
      source: {
        kind: 'publication',
        publicationId: target?.publicationId ?? '',
        handle: target?.handle ?? '',
        slug: target?.slug ?? '',
      },
      sourceTitle: target?.title ?? '',
      sourceCreatorDisplayName: target?.creatorDisplayName ?? '',
    },
    {
      // The canonical derivation loads the working copy into the shared store; HOME is
      // already the page that shows it, so it only presents it — no navigation.
      openWorkingCopy: () =>
        presentLoadedRecipeInHome({
          label: target?.title ?? null,
          publicationId: target?.publicationId ?? null,
          keepIdea: options.keepIdea,
        }),
    },
  );

  return {
    busy: derivation.state.status === 'working',
    message:
      derivation.state.status === 'failed'
        ? (derivation.state.message ?? homeCreatorCopy.match.couldNotOpen)
        : null,
    open: async () => {
      if (target === null) return false;
      // A derivation is saved to an account. A guest is asked to sign in first and the
      // choice stays on screen — exactly as the official-recipe path does.
      if (!userId) {
        openAuthModal();
        return false;
      }
      // §37: the ORIGINAL is never modified — this creates an editable derivation
      // through the canonical authority. ONLY a completed derivation counts: a typed
      // refusal (not entitled, source unavailable, save failed) stays where it was and
      // says so. Branch on the RETURNED outcome, never on `derivation.state` after the
      // await (served QA 2026-08-31: an unconditional close marked the recipe ready
      // with ZERO lines).
      const outcome = await Promise.resolve(derivation.useThisRecipe());
      return outcome.status === 'done';
    },
  };
}
