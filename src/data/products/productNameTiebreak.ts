/**
 * Pure DETERMINISTIC name/subcategory tiebreaker for product → reference matching.
 *
 * It does NOT create matches and it does NOT call any model. It maps a product/reference name to
 * a small set of canonical "concepts" via a conservative Spanish/English synonym table, then
 * scores concept overlap. Its ONLY intended use is to BREAK TIES among candidates the
 * composition matcher already considers plausible — never to lower a threshold or invent a match.
 *
 *   - PURE: no DB, no service, no IO, no npac. Deterministic.
 *   - SAFE: unrelated names score 0 (no signal); two DIFFERENT specific concepts (e.g. almond vs
 *     hazelnut, dark vs white chocolate) never reinforce each other. A concept only matches its
 *     own synonyms.
 */

/** Canonical concept → its Spanish/English surface tokens (accent-insensitive, lowercased). */
const CONCEPT_SYNONYMS: Record<string, string[]> = {
  milk: ['milk', 'leche'],
  cream: ['cream', 'nata'],
  yogurt: ['yogurt', 'yoghurt', 'yogur'],
  greek: ['greek', 'griego', 'griega'],
  kefir: ['kefir'],
  butter: ['butter', 'mantequilla'],
  cheese: ['cheese', 'queso'],
  almond: ['almond', 'almendra', 'almendras'],
  hazelnut: ['hazelnut', 'avellana', 'avellanas'],
  peanut: ['peanut', 'cacahuete', 'cacahuetes', 'cacahuate', 'mani'],
  pistachio: ['pistachio', 'pistacho', 'pistachos'],
  walnut: ['walnut', 'nuez', 'nueces'],
  cocoa: ['cocoa', 'cacao'],
  chocolate: ['chocolate'],
  dark: ['dark', 'negro', 'bitter', 'fondente'],
  white: ['white', 'blanco'],
  strawberry: ['strawberry', 'fresa', 'fresas'],
  blueberry: ['blueberry', 'arandano', 'arandanos'],
  raspberry: ['raspberry', 'frambuesa', 'frambuesas'],
  peach: ['peach', 'melocoton'],
  apricot: ['apricot', 'albaricoque'],
  banana: ['banana', 'platano'],
  coffee: ['coffee', 'cafe'],
  vanilla: ['vanilla', 'vainilla', 'vanillin', 'vainillado', 'vainillada'],
  sweetener: ['sweetener', 'edulcorante', 'edulcorantes'],
  erythritol: ['erythritol', 'eritritol'],
  stevia: ['stevia', 'steviol'],
  sucralose: ['sucralose', 'sucralosa'],
  saccharin: ['saccharin', 'sacarina'],
  maltitol: ['maltitol'],
  sugar: ['sugar', 'azucar'],
};

/** Token → the concepts it can denote (a token like "leche" maps to milk; "negro" to dark). */
const TOKEN_TO_CONCEPTS: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const [concept, tokens] of Object.entries(CONCEPT_SYNONYMS)) {
    for (const t of tokens) {
      const list = m.get(t) ?? [];
      list.push(concept);
      m.set(t, list);
    }
  }
  return m;
})();

/** Lowercase + strip diacritics + split into word tokens (deterministic, locale-free). */
export function normalizeTokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

/** The set of canonical concepts a name denotes. */
export function conceptsFromName(name: string): Set<string> {
  const concepts = new Set<string>();
  for (const token of normalizeTokens(name)) {
    const hits = TOKEN_TO_CONCEPTS.get(token);
    if (hits) for (const c of hits) concepts.add(c);
  }
  // `milk_choc` only counts when chocolate is also present (avoid plain milk → milk_choc noise)
  if (concepts.has('milk_choc') && !concepts.has('chocolate')) concepts.delete('milk_choc');
  return concepts;
}

/**
 * Tie-break score between a product name and a candidate reference name: the count of shared
 * canonical concepts. 0 = no shared concept (no signal → never a false positive). Symmetric.
 */
export function nameTiebreakScore(productName: string, candidateName: string): number {
  const a = conceptsFromName(productName);
  const b = conceptsFromName(candidateName);
  let shared = 0;
  for (const c of a) if (b.has(c)) shared += 1;
  return shared;
}

export interface NamedCandidate {
  id: string;
  name: string;
}

/**
 * Rank candidates by name-concept overlap with the product (descending), STABLE on ties (original
 * order preserved). Returns each candidate with its score. Candidates with score 0 keep their
 * place after scored ones — the caller decides whether a 0 score is usable (it should not be the
 * sole basis for a match).
 */
export function rankCandidatesByName(
  productName: string,
  candidates: ReadonlyArray<NamedCandidate>,
): { id: string; name: string; score: number }[] {
  return candidates
    .map((c, index) => ({ ...c, score: nameTiebreakScore(productName, c.name), index }))
    .sort((x, y) => (y.score - x.score) || (x.index - y.index))
    .map(({ id, name, score }) => ({ id, name, score }));
}
