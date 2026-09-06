import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { RecipeInput } from '@/engine';
import { recipeCompositionFromState } from '@/features/recipe-composition/recipeCompositionPersistence';
import {
  defaultAccountLabelProfile,
  resolveLabelRepository,
  type AccountLabelProfile,
  type LabelRepository,
} from '@/services/labels/labelRepository';
import { useAuthStore } from '@/stores/authStore';
import { useRecipeStore } from '@/stores/recipeStore';
import { DraftLabelCard } from './DraftLabelCard';
import { buildDraftLabelPreview } from './draftLabelPreview';
import {
  createRecipeLabelDraft,
  newRecipeLabelDraftId,
  type RecipeLabelDraft,
} from './labelDraftPersistence';
import { labelSettingsReturn, readLabelSettingsRestore } from './labelSettingsNavigation';
import type { MasterLabelData } from './masterLabel';

/** Current-recipe label owner. Profile data is the only asynchronously loaded input. */
export function DraftLabelPanel({
  recipeInput,
  productName,
  repository: suppliedRepository,
  fallback,
}: {
  recipeInput: RecipeInput;
  productName?: string | null;
  repository?: LabelRepository;
  fallback: React.ReactNode;
}) {
  const draftContextSeq = useRecipeStore((state) => state.draftContextSeq);
  const versionId = useRecipeStore((state) => state.currentVersionId);
  return (
    <DraftLabelPanelContext
      key={`${draftContextSeq}:${versionId ?? 'working-copy'}`}
      recipeInput={recipeInput}
      productName={productName}
      repository={suppliedRepository}
      fallback={fallback}
    />
  );
}

function DraftLabelPanelContext({
  recipeInput,
  productName,
  repository: suppliedRepository,
  fallback,
}: {
  recipeInput: RecipeInput;
  productName?: string | null;
  repository?: LabelRepository;
  fallback: React.ReactNode;
}) {
  const repository = useMemo(
    () => suppliedRepository ?? resolveLabelRepository(),
    [suppliedRepository],
  );
  const authOwnerId = useAuthStore((state) => state.user?.id ?? null);
  const draftRevision = useRecipeStore((state) => state.draftRevision);
  const versionId = useRecipeStore((state) => state.currentVersionId);
  const versionNumber = useRecipeStore((state) => state.currentVersionNumber);
  const storedDraft = useRecipeStore((state) => state.labelDraft);
  const setLabelDraft = useRecipeStore((state) => state.setLabelDraft);
  const [profile, setProfile] = useState<AccountLabelProfile | null>(null);
  const [settled, setSettled] = useState(false);
  const [resolvedLogo, setResolvedLogo] = useState<{ path: string; url: string | null } | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const [createdDraft] = useState<RecipeLabelDraft>(() =>
    createRecipeLabelDraft({ draftId: newRecipeLabelDraftId() }),
  );
  const location = useLocation();
  const navigate = useNavigate();

  const workingDraft = storedDraft ?? createdDraft;

  useEffect(() => {
    if (storedDraft === null) setLabelDraft(workingDraft, false);
  }, [setLabelDraft, storedDraft, workingDraft]);

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

  const effectiveProfile = profile ?? defaultAccountLabelProfile(authOwnerId ?? 'draft-preview');
  const composition = useMemo(() => {
    void draftRevision;
    return recipeCompositionFromState(useRecipeStore.getState());
  }, [draftRevision]);
  const draft = useMemo(
    () =>
      buildDraftLabelPreview({
        profile: effectiveProfile,
        recipeInput,
        composition,
        productName,
        draft: workingDraft,
        recipeVersionId: versionId,
        recipeVersionNumber: versionNumber,
      }),
    [
      composition,
      effectiveProfile,
      productName,
      recipeInput,
      versionId,
      versionNumber,
      workingDraft,
    ],
  );

  useEffect(() => {
    if (JSON.stringify(workingDraft.label) === JSON.stringify(draft.label)) return;
    setLabelDraft({ ...workingDraft, label: draft.label }, false);
  }, [draft.label, setLabelDraft, workingDraft]);

  useEffect(() => {
    const restore = readLabelSettingsRestore(location.state);
    if (!restore) return;
    const panel = rootRef.current?.closest<HTMLElement>('[role="tabpanel"]');
    if (panel) panel.scrollTop = restore.scrollTop;
  }, [location.state]);

  const saveLabel = useCallback(
    (label: MasterLabelData, confirmedField?: string) => {
      setLabelDraft(
        {
          ...workingDraft,
          productionDate: label.productionDate,
          confirmedFields: confirmedField
            ? [...new Set([...workingDraft.confirmedFields, confirmedField])]
            : workingDraft.confirmedFields,
          label,
        },
        true,
      );
    },
    [setLabelDraft, workingDraft],
  );

  const openSettings = () => {
    const panel = rootRef.current?.closest<HTMLElement>('[role="tabpanel"]');
    navigate('/labels', {
      state: {
        labelSettingsReturn: labelSettingsReturn(
          location.pathname,
          location.search,
          panel?.scrollTop ?? window.scrollY,
        ),
      },
    });
  };

  if (!settled) return null;
  if (!draft) return <>{fallback}</>;
  return (
    <div ref={rootRef}>
      <DraftLabelCard
        draft={draft}
        logoUrl={logoUrl}
        onSave={saveLabel}
        onOpenSettings={openSettings}
      />
    </div>
  );
}
