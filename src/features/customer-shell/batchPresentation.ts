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
import type { BatchResolution, DeviceKind } from '@/features/customer-flow';

/** The editor the "Zmień ilość" override reveals. */
export type BatchOverrideEditor =
  | 'custom_mass' // a single grams field (home appliance / Ninja)
  | 'batch_selector'; // preset kg sizes + custom (professional)

/** Which copy label the resolved value uses. */
export type BatchValueLabelKind =
  | 'selected' // a verified device auto-selected the mass ("Wybrana ilość")
  | 'resolved'; // any other satisfied source ("Ustalona ilość")

export type BatchSectionMode =
  | 'confirm_capacity' // ml-only device: ask once for the recipe mass
  | 'choose' // no batch yet: show the batch selector
  | 'resolved'; // a batch is known: show the summary (+ optional override)

export interface BatchSectionInput {
  batch: Pick<BatchResolution, 'source' | 'satisfied' | 'needsConfirmation'>;
  /** The selected device kind, or null when no device is chosen. */
  deviceKind: DeviceKind | null;
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
 * - `confirm_capacity`: an unverified-volume device is awaiting the one-time
 *   recipe-mass confirmation (never an ml→g guess).
 * - `choose`: nothing is known yet — the batch selector is shown.
 * - `resolved`: a batch is known. A verified device mass ('device_verified') or
 *   a customer-set mass ('user') may be overridden via "Zmień ilość"; the manual
 *   input stays hidden until the customer opens it. A home appliance overrides
 *   with a single grams field; a professional machine with the kg selector.
 */
export function resolveBatchSectionView(input: BatchSectionInput): BatchSectionView {
  const { batch, deviceKind, overrideOpen } = input;

  if (batch.needsConfirmation) {
    return {
      mode: 'confirm_capacity',
      showChangeAction: false,
      editor: 'batch_selector',
      editorOpen: false,
      labelKind: 'resolved',
    };
  }

  if (!batch.satisfied) {
    return {
      mode: 'choose',
      showChangeAction: false,
      editor: 'batch_selector',
      editorOpen: false,
      labelKind: 'resolved',
    };
  }

  const fromVerifiedDevice = batch.source === 'device_verified';
  const canOverride = fromVerifiedDevice || batch.source === 'user';
  const editor: BatchOverrideEditor = deviceKind === 'appliance' ? 'custom_mass' : 'batch_selector';

  return {
    mode: 'resolved',
    showChangeAction: canOverride,
    editor,
    editorOpen: canOverride && overrideOpen,
    labelKind: fromVerifiedDevice ? 'selected' : 'resolved',
  };
}
