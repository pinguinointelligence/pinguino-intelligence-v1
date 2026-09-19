/**
 * The ONE host of the durable batch process — Produkcja v3, Etap 2.
 *
 * Both „Partie" and the recipe's Produkcja tab mount THIS component, so there is exactly
 * one live workspace behind the process wherever it is shown. They are
 * different routes, so the two never mount at once. The host brings only its frame: the
 * way back, its own action, and the layer the sheets open in.
 */
import { useState, type ReactNode } from 'react';
import { DialogShell } from '@/components/ui/DialogShell';
import { ProductionProcess } from './process/ProductionProcess';
import type { ProcessSheetFrame } from './process/ProductionProcessSheets';
import { useProductionWorkspace, type ProductionWorkspaceView } from './useProductionWorkspace';
import { useDurableProductionProcess } from './useDurableProductionProcess';

/**
 * THE single entry point to the production workspace — Produkcja v3, Etap 2.
 *
 * Every host of a batch goes through here: „Partie" (below, with the shared process
 * presentation) and the recipe's Produkcja tab (with the PRO cockpit, which the accepted
 * package keeps until PRO's own pass). They are different ROUTES, so the hook is live in
 * exactly one place at a time; `productionWorkspaceSingleHost.test.ts` proves no feature
 * calls `useProductionWorkspace` around this module and grows a second one.
 */
export function useProductionHost(enabled: boolean): ProductionWorkspaceView {
  return useProductionWorkspace(enabled);
}

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
  /**
   * What to render when there is no batch. Mounting the host never starts one.
   *
   * OD-24: a host that offers to START a batch (HOME's „Zaczynamy") needs the workspace
   * to ask, so `empty` may also be a function receiving it. This keeps the single-host
   * rule intact — the hook still lives here and nowhere else.
   */
  empty?: ReactNode | ((production: ProductionWorkspaceView) => ReactNode);
  testId: string;
}) {
  const production = useProductionHost(true);
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
  if (controller === null) {
    return <>{typeof empty === 'function' ? empty(production) : empty}</>;
  }
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
