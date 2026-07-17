/**
 * Landing Monitor demo payload (UIUX Slice F — owner binding decision:
 * „landing demo uses the SAME real Monitor component with safe demo payload —
 * no separate imitation").
 *
 * The payload is built by the REAL customer pipeline — createCustomerFlow →
 * buildCustomerResult → the canonical `calculateRecipe` (public @/engine entry
 * point, same pattern as the customer monitor) → buildMonitorHomeView — for a
 * fixed vanilla gelato at −12 °C / 1 kg. The §13 view model strips every
 * number at source (§22), so the only digit the landing can show is the
 * sanctioned 1–10 „Dopasowanie". Pure + deterministic (same input → same
 * view).
 *
 * Payload choice (probed against the real engine, 2026-07-17): vanilla gelato
 * at −11 °C / 1 kg — the engine's own best-showcase cell (9/10, stability in
 * the golden range). The INPUT was chosen; the OUTPUT is untouched engine
 * truth and will move if the engine is ever recalibrated.
 */
import { calculateRecipe } from '@/engine';
import {
  buildCustomerResult,
  createCustomerFlow,
  selectServingMode,
  setBatchGrams,
  setProductType,
} from '@/features/customer-flow';
import { buildMonitorHomeView, type MonitorHomeView } from '@/features/pi-monitor';

/** The safe demo view — real engine output for the §6.2 vanilla example. */
export function buildLandingMonitorDemo(): MonitorHomeView {
  let flow = createCustomerFlow({ text: 'wanilia' });
  flow = setProductType(flow, 'gelato');
  flow = selectServingMode(flow, 'temp_minus_11');
  flow = setBatchGrams(flow, 1000);
  const result = buildCustomerResult(flow);
  const engineResult = result.recipeInput !== null ? calculateRecipe(result.recipeInput) : null;
  // No machine context on the public landing — the checklist stays empty and
  // the readout shows score + traits + stability only.
  return buildMonitorHomeView(engineResult, null);
}
