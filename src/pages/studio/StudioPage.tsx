import { useState } from 'react';
import { SurfaceToneContext } from '@/components/ui/surface';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { copy } from '@/copy/en';
import { AppShell } from '@/features/shell/AppShell';
import { useAuthModalStore } from '@/features/auth/authModalStore';
import { useAuthStore } from '@/stores/authStore';
import { SaveRecipeDialog } from '@/features/recipes/SaveRecipeDialog';
import { StudioModeToggle } from '@/features/studio/StudioModeToggle';
import { StudioEngineSurface } from '@/features/studio/StudioEngineSurface';

/**
 * Advanced Studio — now wrapped in the ONE canonical AppShell (canonical logo/header + top-right
 * hamburger + right drawer). The dark engine lab remains as the page body (its visual redesign is
 * tracked separately). Page-specific action: „Zapisz recepturę" (the canonical save dialog). The
 * legacy bespoke dark header (its home link and the redundant workspace link) is removed; global
 * navigation lives only in the canonical drawer.
 */
export function StudioPage({ forceDemo = false }: { forceDemo?: boolean }) {
  const authStatus = useAuthStore((state) => state.status);
  const openAuthModal = useAuthModalStore((state) => state.open);
  const [saveOpen, setSaveOpen] = useState(false);

  // Anonymous users are prompted to sign in; signed-in users get the save dialog.
  const onSaveClick = () => {
    if (authStatus === 'authed') setSaveOpen(true);
    else openAuthModal();
  };

  return (
    <AppShell
      actions={
        <>
          <StudioModeToggle />
          <button type="button" onClick={onSaveClick} className={buttonClasses('primary', 'sm')}>
            {copy.recipes.save}
          </button>
        </>
      }
    >
      {saveOpen ? (
        <SurfaceToneContext.Provider value="paper">
          <SaveRecipeDialog onClose={() => setSaveOpen(false)} />
        </SurfaceToneContext.Provider>
      ) : null}

      {/* The engine lab keeps its native dark „canvas" tone under the canonical light shell. */}
      <SurfaceToneContext.Provider value="shell">
        <div className="bg-shell text-ivory [color-scheme:dark]">
          <StudioEngineSurface forceDemo={forceDemo} />
        </div>
      </SurfaceToneContext.Provider>
    </AppShell>
  );
}
