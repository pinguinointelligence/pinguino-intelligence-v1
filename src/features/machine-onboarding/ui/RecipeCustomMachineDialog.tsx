import { DialogShell } from '@/components/ui/DialogShell';
import { MachineOnboarding, type MachineOnboardingCompletion } from './MachineOnboarding';

/**
 * Recipe-scoped entry to the existing custom-machine architecture. The same
 * friendly behavior wizard and required, initially empty cycle-batch step are
 * shared by Home, the Pro selector and the workbench.
 */
export function RecipeCustomMachineDialog({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: (completion: MachineOnboardingCompletion) => void;
}) {
  if (!open) return null;
  return (
    <DialogShell
      label="Własna maszyna"
      testId="recipe-custom-machine-dialog"
      placement="responsive"
      panelClassName="p-5 sm:p-6"
      dismissOnBackdrop
      onClose={onClose}
    >
      <MachineOnboarding
        startWithCustom
        submitLabel="Ustaw dla tej receptury"
        onComplete={onComplete}
      />
      <button
        type="button"
        onClick={onClose}
        className="mt-5 min-h-11 rounded-[12px] border border-ink/15 px-4 text-sm font-semibold text-ink"
      >
        Anuluj
      </button>
    </DialogShell>
  );
}
