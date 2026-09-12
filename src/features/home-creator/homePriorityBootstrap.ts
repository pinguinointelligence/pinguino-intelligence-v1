/**
 * PACKAGE 2A — OWNER OD-1 (2026-09-11): HOME priority is mass-neutral, and a
 * 0 g HOME priority line is the solver's to size.
 *
 * HOME's Crown and its automatic priority never write grams, so a priority line
 * can reach „Przelicz i popraw" at 0 g. The solver only sizes a line that is
 * present, so HOME hands every such line to it as the Crown bootstrap — on the
 * provisional COPY only (the interactive preview's instructions), exactly as
 * PRO's own crown seed would. The recipe keeps its 0 g until „Zastosuj zmiany".
 *
 * Only a line that is legitimately HOME priority qualifies: the Main role, in
 * AUTO (automatic) or MANUAL (crowned). A 0 g ordinary line is not bootstrapped
 * — it still needs the customer's amount.
 */
import type { PreviewLineInstruction } from '@/features/constraint-studio/previewInstructions';

interface PriorityLine {
  readonly id: string;
  readonly lock_type: string;
  readonly planned_grams: number;
  readonly actual_grams: number | null;
}

/** Bootstrap instructions for every 0 g HOME priority line the customer did not instruct. */
export function homePriorityBootstrapInstructions(
  items: readonly PriorityLine[],
  customer: readonly PreviewLineInstruction[],
): PreviewLineInstruction[] {
  const instructed = new Set(customer.map((instruction) => instruction.lineId));
  return items
    .filter(
      (item) =>
        item.lock_type === 'main' &&
        item.planned_grams === 0 &&
        item.actual_grams === null &&
        !instructed.has(item.id),
    )
    .map((item) => ({ lineId: item.id, grams: 1, locked: false, bootstrap: true as const }));
}

/** The customer's own instructions — what the preview shows as their edits. */
export function customerInstructions(
  instructions: readonly PreviewLineInstruction[],
): PreviewLineInstruction[] {
  return instructions.filter((instruction) => !instruction.bootstrap);
}

/** One HOME run: the customer's instructions plus a bootstrap for every other 0 g priority line. */
export function homeRecalculationInstructions(
  items: readonly PriorityLine[],
  instructions: readonly PreviewLineInstruction[],
): PreviewLineInstruction[] {
  const customer = customerInstructions(instructions);
  return [...homePriorityBootstrapInstructions(items, customer), ...customer];
}
