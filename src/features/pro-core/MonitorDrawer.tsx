/**
 * PINGÜINO Pro — Monitor PI drawer (bottom sheet on mobile, right sheet on sm+). Opened
 * from the workbar; renders the SAME complete `MonitorPanelContent` as the desktop LIVE
 * right panel (owner B1 parity — the sheet is never a reduced Monitor) on the LIVE
 * engine result (recomputed on every change) — no new Monitor math. ONE predictable
 * scroll surface (B6): the shared light Gellatti shell scrolls, nothing inside it clips.
 * DialogShell owns backdrop, focus, body-scroll lock, Escape and safe-area padding.
 */
import { copy } from '@/copy/en';
import { DialogShell } from '@/components/ui/DialogShell';
import { MonitorPanelContent } from '@/features/pro-workbench/MonitorPanelContent';
import { useStudioResult } from '@/features/studio/useStudioResult';
import { useRecipeStore } from '@/stores/recipeStore';

export function MonitorDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { result, corrections, input } = useStudioResult();
  const temperatureC = useRecipeStore((s) => s.target_temperature_c);

  if (!open) return null;

  return (
    <DialogShell
      label={copy.proWorkbar.monitor}
      testId="pro-monitor-drawer"
      onClose={onClose}
      placement="responsive"
      dismissOnBackdrop
      showCloseControl
      closeLabel={copy.shell.closeMenu}
      size="wide"
      panelClassName="p-5 [color-scheme:light]"
    >
      <h2 className="mb-4 pr-12 text-sm font-semibold tracking-label text-ink uppercase">
        {copy.proWorkbar.monitor}
      </h2>
      <MonitorPanelContent
        result={result}
        servingTemperatureC={temperatureC}
        corrections={corrections}
        input={input}
      />
    </DialogShell>
  );
}
