import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { EmptyState } from '@/components/shared/EmptyState';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { Card } from '@/components/ui/Card';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { useAccess } from '@/access/useAccess';
import { communityCopy } from '@/copy/community';
import { AttributionByline } from '@/features/community/ui/AttributionByline';
import { DemoRecipePreview } from '@/features/community/ui/DemoRecipePreview';
import { UnlockCta } from '@/features/community/ui/UnlockCta';
import { useAsyncResource } from '@/features/community/ui/useAsyncResource';
import { useDocumentMetadata } from '@/features/community/ui/useDocumentMetadata';
import { directShareMetadata } from '@/features/community/domain/shareUrls';
import { unlockBenefits } from '@/features/community/domain/unlockBenefits';
import { withContinuation } from '@/features/community/domain/shareContinuation';
import {
  openReceivedShare,
  openShare,
  resolveShare,
  type ShareResolution,
} from '@/services/community';

/**
 * `/share/:token` — the direct-share landing page (§14).
 *
 * This is the page the whole conversion loop runs through, so it does the
 * twelve steps of §14 in order rather than showing „Subscription required":
 *
 *   logged out → resolve the share safely, say WHAT was sent and BY WHOM,
 *                offer sign in / sign up, carrying the token forward;
 *   signed in  → `openShare` files it under „Udostępnione mi", records
 *                Partner acquisition evidence server-side, and returns either
 *                the Demo projection or the full recipe;
 *   not paid   → the recipe IS the demo: real ingredients, real structure,
 *                no grams, with an unlock CTA that returns here after payment;
 *   paid       → no paywall at all — the recipe opens.
 *
 * `noindex` is applied here AND at the edge (`public/_headers`), because a
 * crawler that does not run JavaScript would never see this component (§11).
 */
export function SharedRecipePage() {
  const copy = communityCopy;
  // One component serves two routes: `/share/:token` (the link somebody sent)
  // and `/received/:shareLinkId` (reopening it later from the library, where
  // the recipient no longer has the token). Same page, same entitlement
  // branch — only the way access is PROVEN differs.
  const { token = '', shareLinkId = '' } = useParams();
  const access = useAccess();
  const navigate = useNavigate();
  useDocumentMetadata(useMemo(() => directShareMetadata(), []));

  // Signed in → OPEN (records the recipient + Partner attribution evidence).
  // Logged out → RESOLVE (records nothing about the visitor at all).
  // The key includes the auth state so signing in re-runs the open, which is
  // what files the recipe under „Udostępnione mi".
  const resource = useAsyncResource<ShareResolution>(
    `${shareLinkId || token}:${access.isSignedIn ? 'in' : 'out'}`,
    () =>
      shareLinkId
        ? openReceivedShare(shareLinkId)
        : access.isSignedIn
          ? openShare(token)
          : resolveShare(token),
  );
  const state: ShareResolution | null =
    resource.status === 'ready'
      ? resource.data
      : resource.status === 'failed'
        ? { ok: false, reason: 'not_found' }
        : null;

  if (state === null) {
    return (
      <DestinationSurface title="…">
        <p className="text-sm text-stone-400">…</p>
      </DestinationSurface>
    );
  }

  if (!state.ok) {
    const message =
      state.reason === 'revoked'
        ? copy.share.revoked
        : state.reason === 'expired'
          ? copy.share.expired
          : copy.share.notFound;
    return (
      <DestinationSurface title={copy.share.dialogTitle}>
        <EmptyState title={message} />
      </DestinationSurface>
    );
  }

  const entitled = state.entitlement === 'full';

  return (
    <DestinationSurface eyebrow={copy.roles.sharedBy} title={state.title}>
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-8">
          <AttributionByline
            creatorDisplayName={state.created_by.display_name}
            creatorHandle={state.created_by.handle}
            sharedByDisplayName={state.shared_by_is_creator ? null : state.shared_by?.display_name}
          />

          <p className="text-sm text-stone-500">{copy.share.versionNote(state.version_number)}</p>

          {/* Both branches render from the SAME payload shape. The entitled
              branch simply has `recipe_input` present; the Demo branch never
              received it. */}
          <DemoRecipePreview recipe={state.recipe} />

          {entitled ? (
            <Card className="flex flex-col gap-4">
              <SectionLabel>Pełna receptura</SectionLabel>
              <p className="text-sm text-stone-500">
                Masz aktywny plan — możesz otworzyć tę recepturę w edytorze i zapisać własną kopię.
                Oryginał autora pozostaje bez zmian.
              </p>
              <div className="flex flex-wrap gap-3">
                <button type="button" className={buttonClasses('primary')}>
                  {copy.actions.useThisRecipe}
                </button>
                <button type="button" className={buttonClasses('ghost')}>
                  {copy.actions.createMyVersion}
                </button>
              </div>
            </Card>
          ) : null}
        </div>

        <aside className="flex flex-col gap-6">
          {entitled ? null : access.isSignedIn ? (
            <UnlockCta
              target={
                token ? { kind: 'share', token } : { kind: 'recipes' }
              }
              isSignedIn
              benefits={unlockBenefits(access.tier)}
            />
          ) : (
            // Logged out: sign in or sign up FIRST, carrying the token, so the
            // exact share survives authentication (§14 steps 3–5).
            <Card className="flex flex-col gap-5">
              <div>
                <SectionLabel>{copy.demo.badge}</SectionLabel>
                <h2 className="mt-2 text-xl leading-tight font-medium text-ink">
                  {copy.demo.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-stone-500">{copy.demo.body}</p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  className={buttonClasses('primary')}
                  onClick={() =>
                    navigate(withContinuation('/account', { kind: 'share', token }))
                  }
                >
                  {copy.actions.createAccount}
                </button>
                <button
                  type="button"
                  className={buttonClasses('ghost')}
                  onClick={() =>
                    navigate(withContinuation('/account', { kind: 'share', token }))
                  }
                >
                  {copy.actions.signIn}
                </button>
              </div>
            </Card>
          )}
        </aside>
      </div>
    </DestinationSurface>
  );
}
