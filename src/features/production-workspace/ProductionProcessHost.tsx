/**
 * The ONE host of the durable batch process — Produkcja v3, Etap 2.
 *
 * Both „Partie" and the recipe's Produkcja tab mount THIS component, so there is exactly
 * one `useProductionWorkspace(true)` behind the process wherever it is shown. They are
 * different routes, so the two never mount at once. The host brings only its frame: the
 * way back, its own action, and the layer the sheets open in.
 */
import { useState, type ReactNode } from 'react';
import { DialogShell } from '@/components/ui/DialogShell';
import { ProductionProcess } from './process/ProductionProcess';
import type { ProcessSheetFrame } from './process/ProductionProcessSheets';
import { useProductionWorkspace } from './useProductionWorkspace';
import { useDurableProductionProcess } from './useDurableProductionProcess';

export function ProductionProcessHost({
  name,
  back,
  hostAction,
  sheetFrame = ProcessLayer,
  empty = null,
  testId,
}: {
  /** The run's recipe name — the host's frame already knows it (the „W toku" row). */
  name: string;
  /** The host's way back, above the eyebrow. */
  back: ReactNode;
  /** The host's action beside „Coś poszło nie tak?". */
  hostAction?: ReactNode;
  /** The layer the process sheets open in; the shared `home-layer` placement by default. */
  sheetFrame?: ProcessSheetFrame;
  /** What to render when there is no batch. Mounting the host never starts one. */
  empty?: ReactNode;
  testId: string;
}) {
  const production = useProductionWorkspace(true);
  const [doneStepIds, setDoneStepIds] = useState<{ sessionId: string; ids: string[] } | null>(null);
  const controller = useDurableProductionProcess(production, {
    doneStepIds:
      doneStepIds && doneStepIds.sessionId === production.session?.sessionId ? doneStepIds.ids : [],
    onStepDone: (sessionId, stepId) =>
      setDoneStepIds((current) =>
        current && current.sessionId === sessionId
          ? { sessionId, ids: [...new Set([...current.ids, stepId])] }
          : { sessionId, ids: [stepId] },
      ),
  });
  if (controller === null) return <>{empty}</>;
  return (
    <ProductionProcess
      controller={controller}
      name={name}
      machineId={production.machineGuide?.sourceMachineId ?? null}
      back={back}
      hostAction={hostAction}
      sheetFrame={sheetFrame}
      testId={testId}
    />
  );
}

/**
 * The default layer for the process sheets: the SAME `home-layer` placement of
 * `DialogShell` that HOME's own frame is built on — one sheet system, not a second.
 */
const ProcessLayer: ProcessSheetFrame = ({
  label,
  testId,
  onClose,
  onBackdrop,
  returnFocus,
  children,
}) => (
  <DialogShell
    label={label}
    testId={testId}
    placement="home-layer"
    onClose={onClose}
    onBackdrop={onBackdrop ?? onClose}
    returnFocus={returnFocus}
  >
    {children}
  </DialogShell>
);
