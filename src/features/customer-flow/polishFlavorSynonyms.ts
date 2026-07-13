/**
 * Polish flavor-synonym augmentation (Agent B) — pure and deterministic.
 *
 * The locked spine flavor parser (`@/spine`) matches WHOLE canonical words, so
 * INFLECTED Polish forms slip through detection: "maliną" / "malinowy" are not
 * the literal keyword "malina", and "czekoladą" is not "czekolada". That silently
 * drops a flavor at the DETECTION stage — before any retention logic can run.
 *
 * This module adds a SAFE, additive, customer-flow-local synonym pass that maps
 * common Polish flavor words to the SAME flavor tags the spine already uses. It:
 *  - is diacritics- and inflection-tolerant (stem/prefix match on tokens);
 *  - ONLY ADDS detections — it never removes a spine detection, never touches
 *    product-profile routing, and never invents a dose;
 *  - uses ONLY the spine's existing flavor tags (no new vocabulary).
 *
 * It lives in `customer-flow`, NOT in `@/spine`, on purpose: the spine and studio
 * test suites stay untouched, and the augmentation is scoped to the customer flow.
 */

/** Map Polish diacritics to ASCII so inflected forms match a plain ASCII stem. */
const stripDiacritics = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ą/g, 'a')
    .replace(/ć/g, 'c')
    .replace(/ę/g, 'e')
    .replace(/ł/g, 'l')
    .replace(/ń/g, 'n')
    .replace(/ó/g, 'o')
    .replace(/ś/g, 's')
    .replace(/[źż]/g, 'z');

interface FlavorSynonymRule {
  tag: string;
  /**
   * Word STEMS (ASCII, diacritics-stripped). A token that STARTS WITH any stem
   * counts as a hit — this covers Polish inflection by prefix (malina / maliną /
   * malinowy / maliny all start with "malin") while avoiding mid-word matches.
   */
  stems?: readonly string[];
  /**
   * Exact whole-token matches (ASCII, diacritics-stripped) for short words where a
   * bare prefix would over-match an unrelated word — e.g. "rum" must map to rum
   * WITHOUT swallowing "rumianek" (chamomile). A token that EQUALS one of these
   * counts as a hit.
   */
  tokens?: readonly string[];
}

/**
 * Stem / token → flavor tag. Stems are long enough to be distinctive and to cover
 * Polish inflection by prefix; tokens pin short words to their exact inflected
 * forms. Tags are EXACTLY the spine's existing flavor tags.
 */
const FLAVOR_SYNONYM_RULES: readonly FlavorSynonymRule[] = [
  { tag: 'chocolate', stems: ['czekolad'] }, // czekolada / czekoladą / czekoladowe
  { tag: 'raspberry', stems: ['malin'] }, // malina / maliną / malinowy / maliny
  { tag: 'strawberry', stems: ['truskawk'] }, // truskawka / truskawką / truskawkowy
  { tag: 'vanilla', stems: ['wanili'] }, // wanilia / waniliowe / waniliowy / wanilią / wanilii
  { tag: 'pistachio', stems: ['pistacj'] }, // pistacja / pistacją / pistacjowy
  { tag: 'hazelnut', stems: ['laskow'] }, // orzech laskowy / laskową
  { tag: 'mint', stems: ['miet'] }, // mięta / miętą / miętowy (mieta after strip)
  { tag: 'basil', stems: ['bazyli'] }, // bazylia / bazylią / bazylii
  { tag: 'lemon', stems: ['cytryn'] }, // cytryna / cytryną / cytrynowy
  { tag: 'orange', stems: ['pomarancz'] }, // pomarańcza / pomarańczą / pomarańczowy
  { tag: 'mango', stems: ['mango'] }, // mango
  { tag: 'whisky', stems: ['whisk'] }, // whisky / whiskey
  // Rum: exact noun forms + the "rumow-" adjective stem, so "rumianek" (chamomile)
  // and "rumsztyk" (rump steak) are NOT mistaken for rum.
  { tag: 'rum', tokens: ['rum', 'rumu', 'rumem', 'rumie', 'rumy', 'rumow'], stems: ['rumow'] },
];

/**
 * Detect flavor tags from Polish free text, tolerant of diacritics and common
 * inflection. Pure — the same text always yields the same tags, in a stable order
 * (the rule order above). Adds nothing when the text carries no known flavor word.
 */
export function detectPolishFlavorTags(rawText: string | null | undefined): string[] {
  if (typeof rawText !== 'string' || rawText.trim() === '') return [];
  const normalized = stripDiacritics(rawText)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (normalized === '') return [];

  const tokens = normalized.split(' ');
  const out: string[] = [];
  for (const rule of FLAVOR_SYNONYM_RULES) {
    const hit = tokens.some(
      (tok) =>
        (rule.stems?.some((stem) => tok.startsWith(stem)) ?? false) ||
        (rule.tokens?.includes(tok) ?? false),
    );
    if (hit && !out.includes(rule.tag)) out.push(rule.tag);
  }
  return out;
}
