import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { DestinationSurface } from '@/components/shared/DestinationSurface';
import { ApplicationState } from '@/components/shared/ApplicationState';
import { EmptyState } from '@/components/shared/EmptyState';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { Card } from '@/components/ui/Card';
import { SectionLabel } from '@/components/shared/SectionLabel';
import { useAccess } from '@/access/useAccess';
import { communityCopy } from '@/copy/community';
import { AttributionByline } from '@/features/community/ui/AttributionByline';
import { DemoRecipePreview } from '@/features/community/ui/DemoRecipePreview';
import { UnlockCta } from '@/features/community/ui/UnlockCta';
import { UseRecipeActions } from '@/features/community/ui/UseRecipeActions';
import { useAsyncResource } from '@/features/community/ui/useAsyncResource';
import { useDocumentMetadata } from '@/features/community/ui/useDocumentMetadata';
import { directShareMetadata } from '@/features/community/domain/shareUrls';
import { resolveRecipeImage } from '@/features/community/domain/recipeImageAuthority';
import { unlockBenefits } from '@/features/community/domain/unlockBenefits';
import { withContinuation } from '@/features/community/domain/shareContinuation';
import {
  fetchSharePhoto,
  openReceivedShare,
  openShare,
  resolveShare,
  type ShareFailureReason,
  type ShareResolution,
} from '@/services/community';

/**
 * The sharer's own photograph as this reader may see it right now. A failure
 * to load is NOT in this union: it rejects, and the page shows the error with a
 * retry instead of quietly showing the profile card.
 */
type OwnSharePhoto =
  | { readonly kind: 'none' }
  | { readonly kind: 'photo'; readonly url: string }
  | { readonly kind: 'refused'; readonly reason: ShareFailureReason };

async function loadOwnSharePhoto(
  access: { token: string } | { shareLinkId: string },
): Promise<OwnSharePhoto> {
  const result = await fetchSharePhoto(access);
  // The bytes arrived from the server for THIS request; the object URL is only
  // this tab's handle on them (released when the page lets go of it).
  if (result.kind === 'photo') return { kind: 'photo', url: URL.createObjectURL(result.blob) };
  return result;
}

/**
 * `/share/:token` — the direct-share landing page (§14).
 *
 * This is the page the whole conversion loop runs through, so it does the
 * twelve steps of §14 in order rather than showing „Subscription required":
 *
 *   logged out → resolve the share safely, say WHAT was sent and BY WHOM,
 *                offer sign in / sign up, carrying the token forward;
 *   signed in  → `openShare` files it under „Udostępnione", records
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
  // what files the recipe under „Udostępnione".
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

  // The sharer's own photograph (owner decisions 2026-09-17): whoever holds a
  // valid link sees it — a logged-out guest included — and `/received` asks by
  // share id as the signed-in recipient. The server decides on EVERY request,
  // so a revoked or expired link is refused on the next open. Never through
  // `recipe_input`, never from a cached or signed address.
  const [photoAttempt, setPhotoAttempt] = useState(0);
  const photoAccess = state?.ok ? (token ? { token } : { shareLinkId: state.share_link_id }) : null;
  const photoKey = photoAccess
    ? `photo:${'token' in photoAccess ? photoAccess.token : photoAccess.shareLinkId}:${photoAttempt}`
    : 'photo:none';
  const ownPhoto = useAsyncResource<OwnSharePhoto>(photoKey, () =>
    photoAccess ? loadOwnSharePhoto(photoAccess) : Promise.resolve({ kind: 'none' }),
  );
  const ownPhotoUrl =
    ownPhoto.status === 'ready' && ownPhoto.data.kind === 'photo' ? ownPhoto.data.url : null;
  useEffect(() => {
    if (!ownPhotoUrl) return undefined;
    return () => URL.revokeObjectURL(ownPhotoUrl);
  }, [ownPhotoUrl]);
  const [brokenPhotoUrl, setBrokenPhotoUrl] = useState<string | null>(null);

  if (state === null) {
    return (
      <DestinationSurface title={copy.share.dialogTitle}>
        <ApplicationState kind="loading" title="Otwieram udostępnioną recepturę…" />
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

  /* §23 — a shared recipe always shows a picture, and the customer is never
     asked to choose one. The order of preference and the asset mapping live in
     ONE place (`recipeImageAuthority`), so replacing the branded files is a
     change to four files on disk and to nothing here.

     Owner decision 2026-09-17: this is a customer's recipe shared from HOME or
     PRO (`customer_share`) — the customer's own photograph, otherwise the
     branded card of its profile. The profile is the SHARED VERSION's own
     `recipe.category` (the demo-safe projection of that immutable
     `recipe_input`), never the viewer's profile or account defaults.

     The own photograph comes from the link's private attachment (see
     `loadOwnSharePhoto`). Until the server has answered, the frame stays empty
     instead of flashing the profile card first. Only a definite „no photo"
     shows the profile card; a refusal or a failure is said, never replaced. */
  const photoFailed =
    ownPhoto.status === 'failed' || (ownPhotoUrl !== null && ownPhotoUrl === brokenPhotoUrl);
  const photoRefused = ownPhoto.status === 'ready' && ownPhoto.data.kind === 'refused';
  const photoFrameOnly = ownPhoto.status === 'loading' || photoFailed || photoRefused;
  const image = resolveRecipeImage({
    context: 'customer_share',
    userImageUrl: photoFailed ? null : ownPhotoUrl,
    profile: state.recipe.category ?? null,
  });

  return (
    <DestinationSurface eyebrow={copy.roles.sharedBy} title={state.title}>
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-8">
          {photoFrameOnly ? (
            <div className="flex flex-col gap-3">
              <div
                aria-hidden
                data-testid="shared-recipe-image-pending"
                className="aspect-square w-full max-w-xl rounded-2xl bg-shell-raised"
              />
              {photoRefused ? (
                <p data-testid="shared-recipe-own-photo-refused" className="text-sm text-stone-500">
                  {copy.share.ownPhotoRefused}
                </p>
              ) : photoFailed ? (
                <div className="flex flex-wrap items-center gap-3">
                  <p
                    role="alert"
                    data-testid="shared-recipe-own-photo-unavailable"
                    className="text-sm text-ink"
                  >
                    {copy.share.ownPhotoUnavailable}
                  </p>
                  <button
                    type="button"
                    className={buttonClasses('ghost', 'sm')}
                    onClick={() => {
                      setBrokenPhotoUrl(null);
                      setPhotoAttempt((value) => value + 1);
                    }}
                  >
                    {copy.share.photoRetry}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <img
              key={image.url}
              src={image.url}
              alt=""
              /* Decorative: the recipe is named by the heading right above it, so
                 a screen reader that also announced the picture would say the
                 same thing twice. */
              aria-hidden
              data-testid="shared-recipe-image"
              data-image-origin={image.origin}
              /* Square, like the approved profile photographs: a 4:3 cover crop
                 cut the whisk and hand off the top of every card. The width cap
                 keeps a square from pushing the recipe below the fold on desktop. */
              className="aspect-square w-full max-w-xl rounded-2xl bg-shell-raised object-cover"
              loading="lazy"
              onError={ownPhotoUrl ? () => setBrokenPhotoUrl(ownPhotoUrl) : undefined}
            />
          )}

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
                Otworzymy tę recepturę jako Twoją kopię roboczą — zapiszesz ją jako własną. Oryginał
                autora pozostaje bez zmian.
              </p>
              <UseRecipeActions
                bare
                target={{
                  source: { kind: 'share', shareLinkId: state.share_link_id },
                  shareToken: token || null,
                  sourceTitle: state.title,
                  sourceCreatorDisplayName: state.created_by.display_name,
                }}
              />
            </Card>
          ) : null}
        </div>

        <aside className="flex flex-col gap-6">
          {entitled ? null : access.isSignedIn ? (
            <UnlockCta
              target={token ? { kind: 'share', token } : { kind: 'recipes' }}
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
                  onClick={() => navigate(withContinuation('/account', { kind: 'share', token }))}
                >
                  {copy.actions.createAccount}
                </button>
                <button
                  type="button"
                  className={buttonClasses('ghost')}
                  onClick={() => navigate(withContinuation('/account', { kind: 'share', token }))}
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
