/**
 * DISPLAY MAP ONLY — Polish wording for the IF9/IF10 branch-workflow contract
 * codes (route decisions, user-decision menu options, required measurements and
 * warning codes).
 *
 * The raw codes are the spine contract and are NEVER changed here: the routers,
 * the previews and every test keep emitting `rescue_same_target_batch`,
 * `weigh_actual_batch_g`, … exactly as before. This module is the presentation
 * layer that turns one of those codes into customer wording; an unknown code
 * falls back to the previous humanised form, so a new spine code can never
 * crash or blank the panel — it simply shows unlocalised until it is added here.
 *
 * Adding a language = adding one more map next to `BRANCH_CODE_LABEL_PL`.
 */

/** The historical fallback: `some_code` → `some code`. */
export const humanizeBranchCode = (code: string): string => code.replace(/_/g, ' ');

const BRANCH_CODE_LABEL_PL: Readonly<Record<string, string>> = {
  // ── IF9 route decisions / outcomes ──────────────────────────────────────
  rescue_possible: 'korekta jest możliwa',
  rescue_same_target_batch: 'ratuj tę samą docelową partię',
  rescue_with_tradeoff: 'korekta z kompromisem',
  rescue_verification_failed_no_grams_exposed:
    'weryfikacja korekty nieudana — nie pokazujemy gramatur',
  scale_remaining_recipe_to_actual_batch: 'przelicz resztę receptury na rzeczywistą partię',
  discard_or_rebatch: 'odrzuć partię albo zrób nową',
  discard_or_rebatch_may_be_required: 'może być konieczne odrzucenie partii albo nowa partia',
  stop_batch: 'zatrzymaj partię',

  // ── IF10 route decisions / outcomes ─────────────────────────────────────
  reduce_batch_to_available_stock: 'zmniejsz partię do dostępnego zapasu',
  scale_batch_down: 'zmniejsz masę partii',
  scale_down: 'zmniejszenie masy',
  scale_down_possible: 'zmniejszenie masy jest możliwe',
  scale_verification_failed_no_snapshot_exposed:
    'weryfikacja skalowania nieudana — nie pokazujemy migawki',
  reformulate_recipe: 'przeformułuj recepturę',
  stop_and_buy_missing_product: 'zatrzymaj i dokup brakujący produkt',

  // ── engine-side corrective goals ────────────────────────────────────────
  reduce_pod: 'zmniejsz POD',
  reduce_lactose_sanding: 'zmniejsz ryzyko piaszczystości od laktozy',

  // ── required measurements ───────────────────────────────────────────────
  weigh_actual_batch_g: 'zważ rzeczywistą partię (g)',
  measure_actual_serving_temperature_c: 'zmierz rzeczywistą temperaturę serwowania (°C)',
  measure_free_water_and_stabilizer_share: 'zmierz udział wolnej wody i stabilizatora',
  measure_lactose_and_water_share: 'zmierz udział laktozy i wody',
  measure_required_and_available_grams_per_line:
    'zmierz wymagane i dostępne gramatury dla każdej pozycji',
};

/**
 * Customer wording for one branch-workflow contract code. Unknown codes fall
 * back to the humanised raw code — never an empty string, never a throw.
 */
export const branchCodeLabelPl = (code: string): string =>
  BRANCH_CODE_LABEL_PL[code] ?? humanizeBranchCode(code);

/** Every code this display map covers (used by the source test). */
export const branchCodeLabelKeysPl = (): readonly string[] => Object.keys(BRANCH_CODE_LABEL_PL);
