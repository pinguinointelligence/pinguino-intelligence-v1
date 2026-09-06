/**
 * LABEL STATEMENTS read from a registry or research text — shared by the server lookup and the
 * customer's device (the same reading, whichever side asks first).
 *
 * An ingredient list must LOOK like one; an OCR of a nutrition table in five languages is not
 * evidence about the composition. The allergens an ingredient list names are what the label
 * emphasises (EU 14); "may contain" traces are never derived here.
 */
const stripAccents = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L');

const NUTRITION_TABLE_CUES =
  /(kcal|\bkj\b|energ|warto[sś]?ci? od[zż]ywcz|nutrition|n[äa]hrwert|valeurs? nutri|valor(?:es)? nutri|valori nutri|voedingswaarde|per\s*100|\b100\s*(?:g|ml)\b|t[łl]uszcz\w*\s*[:\d]|\bfat\b\s*[:\d]|\bfett\s*[:\d]|grasas?\s*[:\d]|grassi\s*[:\d]|w[ęe]glowodan\w*\s*[:\d]|carbohydr\w*\s*[:\d]|kohlenhydr\w*\s*[:\d]|carbo?hidrat\w*\s*[:\d]|carboidrat\w*\s*[:\d]|bia[łl]ko\s*[:\d]|protein\w*\s*[:\d]|eiwei|s[óo]l\s*[:\d]|\bsalt\b\s*[:\d]|\bsalz\s*[:\d]|\bsale\s*[:\d])/gi;

/**
 * A registry "ingredients_text" is community-entered and sometimes an OCR of the nutrition
 * table in five languages. An ingredient list names ingredients: it has commas or a heading,
 * few digits and no nutrition-table vocabulary. Anything else is not evidence about the
 * composition and is left to the web research or the customer's photograph.
 */
export function looksLikeIngredientList(text: string | null | undefined): boolean {
  const value = (text ?? '').trim();
  if (value.length < 6) return false;
  const digits = (value.match(/\d/g) ?? []).length;
  if (digits / value.length > 0.12) return false;
  const cues = (value.match(NUTRITION_TABLE_CUES) ?? []).length;
  if (cues >= 2) return false;
  const letters = (value.match(/\p{L}/gu) ?? []).length;
  if (letters / value.length < 0.6) return false;
  const words = value.split(/\s+/).length;
  return (
    value.includes(',') ||
    /sk[łl]adniki|ingredients|zutaten|ingredientes|ingredienti|ingr[ée]dients/i.test(value) ||
    words >= 3
  );
}

/** The 14 EU allergens as they appear in an ingredient list — Polish names out (the label market). */
const EU_ALLERGEN_CUES: readonly (readonly [string, RegExp])[] = [
  [
    'mleko',
    /\b(mlek\w*|milk|milch|leche|latte|lait|melk|smietan\w*|cream|sahne|nata\b|panna|creme|serwatk\w*|whey|molke|suero|siero|lactoserum|laktoz\w*|lactos\w*|maslo|butter|burro|beurre|mantequilla|jogurt\w*|yog(?:h)?urt\w*|joghurt|\bser\b|serek\w*|cheese|kase|queso|formaggio|fromage|kazein\w*|casein\w*|caseinat\w*)\b/,
  ],
  ['jaja', /\b(jaj\w*|egg\w*|\bei\b|eier\w*|huevo\w*|uov[oa]|oeuf\w*|oeufs?)\b/],
  [
    'gluten (pszenica)',
    /\b(pszen\w*|wheat|weizen|trigo|frumento|ble\b|maka\s+pszen\w*|semolin\w*|durum|orkisz\w*|spelt|dinkel|kamut|bulgur|kuskus|couscous|seitan)\b/,
  ],
  [
    'gluten (jeczmien/zyto/owies)',
    /\b(zyt[oa]\w*|\brye\b|roggen|centeno|segale|seigle|jeczmien\w*|barley|gerste|cebada|\borzo\b|orge|slod\w*|\bmalt\w*|owies|owsian\w*|\boats?\b|hafer|avena|avoine)\b/,
  ],
  ['soja', /\b(soj\w*|\bsoy\w*|soja\w*|soia)\b/],
  [
    'orzeszki ziemne',
    /\b(orzeszk\w*\s+ziemn\w*|arachid\w*|peanut\w*|erdnuss\w*|erdnuesse|cacahuet\w*|mani\b)\b/,
  ],
  [
    'orzechy',
    /\b(orzech\w*|migdal\w*|almond\w*|mandel\w*|almendr\w*|mandorl\w*|amande\w*|hazelnut\w*|haselnuss\w*|avellan\w*|nocciol\w*|noisette\w*|walnut\w*|walnuss\w*|nuez|nueces|noce|noci|noix|cashew\w*|nerkowc\w*|anacard\w*|pistachio\w*|pistacj\w*|pistazie\w*|pistacch\w*|pecan\w*|macadamia|brazil\s+nut\w*|para\w*\s+nuss)\b/,
  ],
  ['sezam', /\b(sezam\w*|sesam\w*|sesame|tahin\w*)\b/],
  ['seler', /\b(seler\w*|celery|sellerie|apio|sedano|celeri)\b/],
  ['gorczyca', /\b(gorczyc\w*|mustard|senf|mostaza|senape|moutarde|musztard\w*)\b/],
  [
    'siarczyny',
    /\b(siarczyn\w*|sulfit\w*|sulphit\w*|sulfite\w*|dwutlenek\s+siarki|sulphur\s+dioxide|sulfur\s+dioxide|schwefeldioxid|e22[0-8])\b/,
  ],
  ['lubin', /\b(lubin\w*|lupin\w*|lupine|altramuz|lupino)\b/],
  [
    'ryby',
    /\b(ryb\w*|\bfish\b|fisch\w*|pescado|pesce|poisson|anchov\w*|tunczyk\w*|tuna|lachs|losos\w*|salmon)\b/,
  ],
  [
    'skorupiaki',
    /\b(skorupiak\w*|crustacean\w*|krebstier\w*|crustaceo\w*|crostace\w*|crustace\w*|krewetk\w*|shrimp\w*|prawn\w*|krab\w*|crab|homar\w*|lobster)\b/,
  ],
  [
    'mieczaki',
    /\b(mieczak\w*|mollusc\w*|weichtier\w*|molusco\w*|mollusco\w*|mollusque\w*|malz\w*|mussel\w*|omulek\w*|kalmar\w*|squid|ostryg\w*|oyster\w*|osmiornic\w*|octopus)\b/,
  ],
];

/** Allergens the ingredient list itself names (the label emphasises exactly these); never "may contain". */
export function allergensFromIngredients(ingredients: string | null | undefined): string | null {
  if (!ingredients) return null;
  const text = stripAccents(ingredients.toLowerCase());
  const found = EU_ALLERGEN_CUES.filter(([, cue]) => cue.test(text)).map(([name]) => name);
  return found.length > 0 ? found.join(', ') : null;
}
