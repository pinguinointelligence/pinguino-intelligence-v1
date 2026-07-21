import { useState } from 'react';
import { Link } from 'react-router';
import { IvoryLogoMark } from '@/components/shared/IvoryLogoMark';
import { StatusChip } from '@/components/shared/StatusChip';
import { SurfaceToneContext } from '@/components/ui/surface';
import { copy } from '@/copy/en';
import { useAccess } from '@/access/useAccess';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import { SaveRecipeDialog } from '@/features/recipes/SaveRecipeDialog';
import { StudioModeToggle } from '@/features/studio/StudioModeToggle';
import { StudioEngineSurface } from '@/features/studio/StudioEngineSurface';

const { studio } = copy;

export function StudioPage({ forceDemo = false }: { forceDemo?: boolean }) {
  // Free Preview (demo/free) locks exact values; Pro unlocks the full calculator + panels.
  const { plan } = useAccess();

  const authStatus = useAuthStore((state) => state.status);
  const openAuthModal = useAuthModalStore((state) => state.open);
  const [saveOpen, setSaveOpen] = useState(false);

  // Anonymous users are prompted to sign in; signed-in users get the save dialog.
  const onSaveClick = () => {
    if (authStatus === 'authed') setSaveOpen(true);
    else openAuthModal();
  };

  return (
    <SurfaceToneContext.Provider value="shell">
      <div className="min-h-screen bg-shell text-ivory [color-scheme:dark]">
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6">
          <Link to="/" className="flex items-center gap-3">
            <IvoryLogoMark size={24} tone="ivory" />
            <span className="text-sm font-light tracking-wordmark">{copy.brand.name}</span>
          </Link>
          <div className="flex items-center gap-4">
            <StatusChip status={plan} />
            <StudioModeToggle />
            <Link
              to="/pro"
              className="text-sm text-ivory/60 underline decoration-ivory/25 underline-offset-4 transition-colors hover:text-ivory"
            >
              {copy.proWorkspace.openWorkspace}
            </Link>
            <button
              type="button"
              onClick={onSaveClick}
              className="inline-flex items-center justify-center rounded-md border border-ivory/20 px-5 py-2.5 text-sm font-medium text-ivory transition-colors hover:border-ivory/40"
            >
              {copy.recipes.save}
            </button>
            <Link
              to="/"
              className="text-sm text-ivory/60 underline decoration-ivory/25 underline-offset-4 transition-colors hover:text-ivory"
            >
              {studio.back}
            </Link>
          </div>
        </header>

        {/* The save dialog is a white modal — keep it on the paper tone. */}
        {saveOpen ? (
          <SurfaceToneContext.Provider value="paper">
            <SaveRecipeDialog onClose={() => setSaveOpen(false)} />
          </SurfaceToneContext.Provider>
        ) : null}

        <StudioEngineSurface forceDemo={forceDemo} />
      </div>
    </SurfaceToneContext.Provider>
  );
}
