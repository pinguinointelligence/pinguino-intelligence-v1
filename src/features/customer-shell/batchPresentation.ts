/**
 * Batch-section presentation decision (customer shell) — pure and deterministic.
 *
 * Decides HOW the batch step renders from the resolved batch + the selected
 * device kind + whether the customer has explicitly opened the override. Kept
 * pure so the "no manual mass input by default, override only after an explicit
 * action" contract is unit-testable without a DOM.
 *
 * Presentation logic only — no engine math, no IO, no grams computed here.
 */
import type { BatchResolution } from '@/features/customer-flow';

/** The editor the "Zmień ilość" override reveals. */
export type BatchOverrideEditor =
  | 'custom_mass' // a single grams field (Ninja machine mode)
  | 'batch_selector'; // preset kg sizes + custom (direct / fresh modes)

/** Which copy label the resolved value uses. */
export type BatchValueLabelKind =
  | 'selected' // a Ninja preset auto-selected the mass ("Wybrana ilość")
  | 'resolved'; // any other satisfied source ("Ustalona ilość")

export type BatchSectionMode =
  | 'choose' // no batch yet: show the batch selector
  | 'resolved'; // a batch is known: show the summary (+ optional override)

export interface BatchSectionInput {
  batch: Pick<BatchResolution, 'source' | 'satisfied'>;
  /** True when the selected mode is a Ninja machine mode (grams override, not kg). */
  isNinja: boolean;
  /** True only once the customer has explicitly opened the override editor. */
  overrideOpen: boolean;
}

export interface BatchSectionView {
  mode: BatchSectionMode;
  /** Show the small secondary "Zmień ilość" override action. */
  showChangeAction: boolean;
  /** The editor the override reveals when opened. */
  editor: BatchOverrideEditor;
  /**
   * Whether the override editor (a manual mass/gram input) is visible RIGHT NOW.
   * False by default — it only becomes true after the customer opens it, so a
   * verified device never shows a manual gram field until asked.
   */
  editorOpen: boolean;
  /** Which label the resolved value carries. */
  labelKind: BatchValueLabelKind;
}

/**
 * Resolve the batch-section view.
 *
 * - `choose`: nothing is known yet — the batch selector is shown.
 * - `resolved`: a batch is known. A Ninja preset mass ('mode_ninja') or a
 *   customer-set mass ('user') may be overridden via "Zmień ilość"; the manual
 *   input stays hidden until the customer opens it. A Ninja mode overrides with a
 *   single grams field; a direct / fresh mode with the kg selector.
 */
export function resolveBatchSectionView(input: BatchSectionInput): BatchSectionView {
  const { batch, isNinja, overrideOpen } = input;

  if (!batch.satisfied) {
    return {
      mode: 'choose',
      showChangeAction: false,
      editor: 'batch_selector',
      editorOpen: false,
      labelKind: 'resolved',
    };
  }

  const fromNinja = batch.source === 'mode_ninja';
  const canOverride = fromNinja || batch.source === 'user';
  const editor: BatchOverrideEditor = isNinja ? 'custom_mass' : 'batch_selector';

  return {
    mode: 'resolved',
    showChangeAction: canOverride,
    editor,
    editorOpen: canOverride && overrideOpen,
    labelKind: fromNinja ? 'selected' : 'resolved',
  };
}
