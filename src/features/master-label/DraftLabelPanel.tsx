import { useEffect, useMemo, useState } from 'react';
import type { RecipeResult } from '@/engine';
import {
  defaultAccountLabelProfile,
  resolveLabelRepository,
  type AccountLabelProfile,
  type LabelRepository,
} from '@/services/labels/labelRepository';
import { useAuthStore } from '@/stores/authStore';
import { DraftLabelCard } from './DraftLabelCard';
import { buildDraftLabelPreview } from './draftLabelPreview';

/**
 * Loads the saved label profile and renders the workbench's DRAFT label.
 *
 * The profile is the only thing this needs that the workbench does not already
 * hold; everything else comes from the engine's current result. If no profile
 * has been saved yet there is nothing truthful to draw a label from, so the
 * caller's own fallback is rendered instead of a half-invented one.
 */
export function DraftLabelPanel({
  result,
  productName,
  repository: suppliedRepository,
  fallback,
}: {
  result: RecipeResult;
  productName?: string | null;
  repository?: LabelRepository;
  fallback: React.ReactNode;
}) {
  const repository = useMemo(
    () => suppliedRepository ?? resolveLabelRepository(),
    [suppliedRepository],
  );
  const authOwnerId = useAuthStore((state) => state.user?.id ?? null);
  const [profile, setProfile] = useState<AccountLabelProfile | null>(null);
  const [settled, setSettled] = useState(false);
  const [resolvedLogo, setResolvedLogo] = useState<{ path: string; url: string | null } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void repository
      .getAccountProfile()
      .then((next) => {
        if (!cancelled) setProfile(next);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const logoPath = profile?.logoPath ?? null;
  /* Derived rather than stored, so dropping the logo never needs a synchronous
     setState inside the effect — the same shape LabelWorkspace uses. */
  const logoUrl = logoPath && resolvedLogo?.path === logoPath ? resolvedLogo.url : null;
  useEffect(() => {
    let cancelled = false;
    if (!logoPath) return;
    void repository
      .createLogoSignedUrl(logoPath)
      .then((url) => {
        if (!cancelled) setResolvedLogo({ path: logoPath, url });
      })
      .catch(() => {
        if (!cancelled) setResolvedLogo({ path: logoPath, url: null });
      });
    return () => {
      cancelled = true;
    };
  }, [logoPath, repository]);

  /* An account that has not saved a label profile yet still has a real one: the
     documented default (the same `defaultAccountLabelProfile` LabelWorkspace
     falls back to). Using it is not an invention — it is the profile that would
     apply — and it keeps the preview available from the first recipe, which is
     the point of the Owner's decision. The owner id only stamps an object that
     is rendered and never persisted, so a signed-out reader still gets a draft
     rather than an empty panel. */
  const effectiveProfile =
    profile ?? defaultAccountLabelProfile(authOwnerId ?? 'draft-preview');
  const draft = useMemo(
    () =>
      effectiveProfile
        ? buildDraftLabelPreview({ profile: effectiveProfile, result, productName })
        : null,
    [effectiveProfile, result, productName],
  );

  if (!settled) return null;
  if (!draft) return <>{fallback}</>;
  return <DraftLabelCard draft={draft} logoUrl={logoUrl} />;
}
