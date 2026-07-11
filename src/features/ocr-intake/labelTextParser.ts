/**
 * Label-text parser — PURE, deterministic extraction of EU food-label fields from real
 * OCR output (lines + per-line confidence). No OCR engine import, no DB, no network,
 * no IO. Separately unit-tested from the engine.
 *
 * Honesty rules (same as the table-import parser):
 *   • NEVER invent a missing value — not found stays null (never 0, never a guess);
 *   • NEVER calculate PAC/POD or any engine value; never assign a verification status;
 *   • ambiguous input (mixed separators, "<0.1", serving-only values, multiple numbers
 *     on one row) → null or flagged `needsReview` — a human confirms in the review UI;
 *   • deterministic unit conversion only (mg→g, kg→g) — no density/sodium conversions.
 *
 * Handles: decimal comma AND point; g/mg/kg/ml/l units; OCR digit-spacing errors
 * ("1 5,3 g" → 15.3); line wrapping (ingredients continuation); duplicated nutrition
 * blocks (per-100 basis preferred); English + Spanish label vocabulary.
 */

import { looksLikeBarcode } from '@/data/products/intakeClassifier';

/** One OCR line with its aggregated confidence (0–100), null when unavailable. */
export interface ParsedOcrLine {
  text: string;
  confidence: number | null;
}

export type NutritionBasis = 'per_100g' | 'per_100ml' | 'serving_only' | 'unknown';

export type ConfidenceBand = 'high' | 'medium' | 'low';

export interface ExtractedField<T> {
  /** null = not found / too ambiguous. NEVER an invented value. */
  value: T | null;
  /** aggregated OCR confidence (0–100) of the source line(s); null when unknown. */
  ocrConfidence: number | null;
  band: ConfidenceBand | null;
  /** the raw OCR line(s) the value came from (for the review UI). */
  sourceLines: string[];
  warnings: string[];
  /** true → the review UI must require explicit manual confirmation. */
  needsReview: boolean;
}

export interface LabelExtraction {
  productName: ExtractedField<string>;
  brand: ExtractedField<string>;
  eanCode: ExtractedField<string>;
  /** net quantity as printed, e.g. "500 g" — maps to package_size. */
  netQuantity: ExtractedField<string>;
  basis: NutritionBasis;
  energyKj: ExtractedField<number>;
  energyKcal: ExtractedField<number>;
  fat: ExtractedField<number>;
  saturatedFat: ExtractedField<number>;
  carbohydrates: ExtractedField<number>;
  sugars: ExtractedField<number>;
  protein: ExtractedField<number>;
  salt: ExtractedField<number>;
  ingredientsText: ExtractedField<string>;
  allergens: ExtractedField<string>;
  mayContain: ExtractedField<string>;
  storageInstructions: ExtractedField<string>;
  /** language hint from label vocabulary — a hint only, never written to a product. */
  languageHint: 'en' | 'es' | 'unknown';
  /** extraction-level warnings (duplicated blocks, serving-only basis, …). */
  warnings: string[];
}

const HIGH_BAND = 85;
const MEDIUM_BAND = 60;

const band = (confidence: number | null): ConfidenceBand | null => {
  if (confidence === null) return null;
  if (confidence >= HIGH_BAND) return 'high';
  if (confidence >= MEDIUM_BAND) return 'medium';
  return 'low';
};

const meanConfidence = (lines: ParsedOcrLine[]): number | null => {
  const known = lines.map((l) => l.confidence).filter((c): c is number => c !== null);
  if (known.length === 0) return null;
  return Math.round(known.reduce((a, b) => a + b, 0) / known.length);
};

const emptyField = <T>(warnings: string[] = [], needsReview = false): ExtractedField<T> => ({
  value: null,
  ocrConfidence: null,
  band: null,
  sourceLines: [],
  warnings,
  needsReview: needsReview || warnings.length > 0,
});

const foundField = <T>(
  value: T,
  lines: ParsedOcrLine[],
  warnings: string[] = [],
  forceReview = false,
): ExtractedField<T> => {
  const confidence = meanConfidence(lines);
  return {
    value,
    ocrConfidence: confidence,
    band: band(confidence),
    sourceLines: lines.map((l) => l.text),
    warnings,
    needsReview: forceReview || warnings.length > 0 || band(confidence) === 'low',
  };
};

/** Split raw OCR text into trimmed lines (confidence unknown). */
export function linesFromText(text: string): ParsedOcrLine[] {
  return text
    .split(/\r?\n/)
    .map((t) => ({ text: t.trim(), confidence: null }));
}

/**
 * Normalize one printed number token honestly. Strips OCR digit-spacing ("1 5,3" → "15,3"),
 * accepts decimal comma OR point; mixed separators / comma-grouping → null + warning.
 */
export function normalizeNumberToken(raw: string): { value: number | null; warning: string | null } {
  const compact = raw.replace(/\s+/g, '');
  if (compact === '') return { value: null, warning: null };
  const hasComma = compact.includes(',');
  const hasDot = compact.includes('.');
  if (hasComma && hasDot) {
    return { value: null, warning: `ambiguous number "${raw}" (mixed "," and ".") — left empty` };
  }
  let normalized = compact;
  if (hasComma) {
    if (/^\d+,\d+$/.test(compact)) normalized = compact.replace(',', '.');
    else return { value: null, warning: `ambiguous number "${raw}" (unclear comma) — left empty` };
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return { value: null, warning: `unreadable number "${raw}" — left empty` };
  return { value: n, warning: null };
}

/* ── nutrient row extraction ─────────────────────────────────────────────── */

interface NutrientSpec {
  key: 'fat' | 'saturatedFat' | 'carbohydrates' | 'sugars' | 'protein' | 'salt';
  keyword: RegExp;
  /** phrases removed from the line copy before this spec matches (prevents "saturated
   * fat" feeding the plain "fat" row). */
  maskFirst?: RegExp;
  max: number;
}

/* keyword regexes end with (?![a-z]) instead of \b so a glued OCR value still matches
 * ("Fat34.9 g", "Salt0.11g" are real tesseract outputs from the committed fixtures). */
const NUTRIENT_SPECS: readonly NutrientSpec[] = [
  {
    key: 'saturatedFat',
    keyword: /\bsaturates(?![a-z])|saturated\s+fat(?![a-z])|\bsaturad[ao]s(?![a-z])/i,
    max: 100,
  },
  {
    key: 'fat',
    keyword: /\bfat(?![a-z])|\bgrasas?(?![a-z])/i,
    maskFirst: /saturated\s+fat|grasas\s+saturadas/gi,
    max: 100,
  },
  {
    key: 'sugars',
    keyword: /\bsugars?(?![a-z])|\baz[úu]cares(?![a-z])/i,
    max: 100,
  },
  {
    key: 'carbohydrates',
    keyword: /\bcarbohydrates?(?![a-z])|hidratos\s+de\s+carbono(?![a-z])|\bcarbohidratos?(?![a-z])/i,
    max: 100,
  },
  { key: 'protein', keyword: /\bproteins?(?![a-z])|\bprote[íi]nas?(?![a-z])/i, max: 100 },
  { key: 'salt', keyword: /\bsalt(?![a-z])|\bsal(?![a-z])/i, max: 100 },
];

const BASIS_100G = /\b(per|por)\s*100\s*g\b|\b100\s*g\b/i;
const BASIS_100ML = /\b(per|por)\s*100\s*ml\b|\b100\s*ml\b/i;
const BASIS_SERVING = /\bper\s+serving\b|\bserving\b|\bpor\s+porci[óo]n\b|\bporci[óo]n\b|\braci[óo]n\b/i;

/** number + mass-unit occurrences after a keyword; `<`/`≤` marks below-quantification. */
const VALUE_TOKEN = /([<≤])?\s*(\d(?:[\d\s]*[.,])?\d*)\s*(mg|kg|g)\b/gi;
/** stateless single-match copy of VALUE_TOKEN (a global regex is stateful under .test()). */
const VALUE_TOKEN_TEST = new RegExp(VALUE_TOKEN.source, 'i');

interface NutrientCandidate {
  line: ParsedOcrLine;
  value: number | null;
  warnings: string[];
  basis: NutritionBasis;
}

function extractNutrientFromLine(line: ParsedOcrLine, spec: NutrientSpec, basisAtLine: NutritionBasis): NutrientCandidate | null {
  let scan = line.text.replace(/\b(per|por)\s*100\s*(g|ml)\b/gi, ' ');
  if (spec.maskFirst) scan = scan.replace(spec.maskFirst, ' ');
  const keywordMatch = spec.keyword.exec(scan);
  if (!keywordMatch) return null;

  const after = scan.slice(keywordMatch.index + keywordMatch[0].length);
  const warnings: string[] = [];
  const tokens = [...after.matchAll(VALUE_TOKEN)];
  if (tokens.length === 0) {
    return { line, value: null, warnings: ['row found but no readable value'], basis: basisAtLine };
  }
  if (tokens.length > 1) {
    warnings.push('multiple values on this row (possible per-serving column) — first taken, verify');
  }
  const token = tokens[0];
  if (!token) return { line, value: null, warnings, basis: basisAtLine };
  const [, lessThan, rawNumber = '', unit = 'g'] = token;
  if (lessThan) {
    warnings.push(`printed as "<${rawNumber.replace(/\s+/g, '')} ${unit}" (below quantification) — left empty, enter manually`);
    return { line, value: null, warnings, basis: basisAtLine };
  }
  const { value, warning } = normalizeNumberToken(rawNumber);
  if (warning) warnings.push(warning);
  if (value === null) return { line, value: null, warnings, basis: basisAtLine };

  let grams = value;
  const u = unit.toLowerCase();
  if (u === 'mg') grams = value / 1000;
  if (u === 'kg') grams = value * 1000;
  if (grams < 0 || grams > spec.max) {
    warnings.push(`value ${grams} g out of range (0–${spec.max}) — left empty`);
    return { line, value: null, warnings, basis: basisAtLine };
  }
  return { line, value: grams, warnings, basis: basisAtLine };
}

const basisRank: Record<NutritionBasis, number> = {
  per_100g: 3,
  per_100ml: 2,
  unknown: 1,
  serving_only: 0,
};

/* ── section extraction (ingredients / allergens / storage) ───────────────── */

const SECTION_STOPPERS = [
  /^ingredient(s|es)?\b/i,
  /\ballergens?\b|\bal[ée]rgenos?\b/i,
  /may\s+contain|puede\s+contener|traces\s+of|\btrazas\b/i,
  /nutrition|nutritional|informaci[óo]n\s+nutricional|valores?\s+medios/i,
  /\bstorage\b|\bstore\b|keep\s+(refrigerated|frozen|cool)|conservar|cons[ée]rvese|mantener/i,
  /best\s+before|consumir\s+preferentemente/i,
];

const isSectionStart = (text: string): boolean => SECTION_STOPPERS.some((re) => re.test(text));

/** Capture a section that starts at `startIdx` (text after the heading match) and
 * continues over wrapped lines until a blank line, another section, or a nutrient row. */
function captureSection(
  lines: ParsedOcrLine[],
  startIdx: number,
  firstFragment: string,
): { text: string; sourceLines: ParsedOcrLine[] } {
  const source: ParsedOcrLine[] = [];
  const startLine = lines[startIdx];
  if (startLine) source.push(startLine);
  const parts: string[] = [];
  if (firstFragment.trim() !== '') parts.push(firstFragment.trim());
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line || line.text === '') break;
    if (isSectionStart(line.text)) break;
    if (NUTRIENT_SPECS.some((s) => s.keyword.test(line.text)) && VALUE_TOKEN_TEST.test(line.text)) break;
    parts.push(line.text);
    source.push(line);
  }
  return { text: parts.join(' ').replace(/\s+/g, ' ').trim(), sourceLines: source };
}

/* ── identity extraction ──────────────────────────────────────────────────── */

const NON_NAME_LINE =
  /nutrition|nutricional|ingredient|al[ée]rgeno|allergen|energy|energ[íi]a|valor|per\s*100|por\s*100|best\s+before|may\s+contain|puede\s+contener|conservar|storage|\bstore\b|net\s*(weight|quantity)|peso\s+neto|barcode|\bean\b/i;

const NET_QTY_KEYWORD = /net\s*(weight|quantity|wt|content)|peso\s+neto|contenido\s+neto|cantidad\s+neta/i;
const NET_QTY_VALUE = /(\d(?:[\d\s]*[.,])?\d*)\s*(kg|g|ml|l)\b\s*(℮|e)?/i;
const STANDALONE_QTY = /^\s*(\d(?:[\d\s]*[.,])?\d*)\s*(kg|g|ml|l)\s*(℮|e)?\s*$/i;

/* ── language hint ─────────────────────────────────────────────────────────── */

const ES_MARKERS = [/ingredientes/i, /energ[íi]a/i, /\bgrasas\b/i, /az[úu]cares/i, /prote[íi]nas/i, /\bsal\b/i, /puede\s+contener/i, /conservar|cons[ée]rvese/i, /peso\s+neto/i, /valor\s+energ[ée]tico/i];
const EN_MARKERS = [/ingredients/i, /\benergy\b/i, /\bfat\b/i, /\bsugars\b/i, /\bprotein\b/i, /\bsalt\b/i, /may\s+contain/i, /\bstore\b|keep\s+refrigerated/i, /net\s+weight/i, /of\s+which/i];

function detectLanguage(text: string): 'en' | 'es' | 'unknown' {
  const es = ES_MARKERS.filter((re) => re.test(text)).length;
  const en = EN_MARKERS.filter((re) => re.test(text)).length;
  if (es >= 2 && es > en) return 'es';
  if (en >= 2 && en > es) return 'en';
  return 'unknown';
}

/* ── main parser ──────────────────────────────────────────────────────────── */

export function parseLabelText(input: ParsedOcrLine[]): LabelExtraction {
  // collapse whitespace and drop common OCR garbage glyphs (¢ etc. show up between a
  // number and its unit in real tesseract output — observed on the committed fixtures)
  const lines = input.map((l) => ({
    text: l.text.replace(/[|¢©®™]/g, ' ').replace(/\s+/g, ' ').trim(),
    confidence: l.confidence,
  }));
  const fullText = lines.map((l) => l.text).join('\n');
  const globalWarnings: string[] = [];

  /* basis per line (state machine over the lines) */
  const basisAt: NutritionBasis[] = [];
  let currentBasis: NutritionBasis = 'unknown';
  let saw100g = false;
  let saw100ml = false;
  let sawServing = false;
  for (const line of lines) {
    const is100g = BASIS_100G.test(line.text);
    const is100ml = BASIS_100ML.test(line.text);
    const isServing = BASIS_SERVING.test(line.text);
    if (is100g) {
      currentBasis = 'per_100g';
      saw100g = true;
    } else if (is100ml) {
      currentBasis = 'per_100ml';
      saw100ml = true;
    } else if (isServing) {
      currentBasis = 'serving_only';
      sawServing = true;
    }
    basisAt.push(currentBasis);
  }
  const basis: NutritionBasis = saw100g ? 'per_100g' : saw100ml ? 'per_100ml' : sawServing ? 'serving_only' : 'unknown';
  if (basis === 'serving_only') {
    globalWarnings.push('nutrition is declared per serving only — per-100 fields stay empty (never converted)');
  }
  if (basis === 'unknown') {
    globalWarnings.push('no per-100 g / per-100 ml basis found — verify the nutrition basis manually');
  }

  /* nutrients */
  const nutrientFields = {} as Record<NutrientSpec['key'], ExtractedField<number>>;
  for (const spec of NUTRIENT_SPECS) {
    const candidates: NutrientCandidate[] = [];
    lines.forEach((line, idx) => {
      const c = extractNutrientFromLine(line, spec, basisAt[idx] ?? 'unknown');
      if (c) candidates.push(c);
    });
    const usable = candidates.filter((c) => c.value !== null);
    if (usable.length === 0) {
      const withWarnings = candidates.find((c) => c.warnings.length > 0);
      nutrientFields[spec.key] = withWarnings
        ? { ...emptyField<number>(withWarnings.warnings, true), sourceLines: [withWarnings.line.text], ocrConfidence: withWarnings.line.confidence, band: band(withWarnings.line.confidence) }
        : emptyField<number>();
      continue;
    }
    const best = [...usable].sort((a, b) => basisRank[b.basis] - basisRank[a.basis])[0];
    if (!best) {
      nutrientFields[spec.key] = emptyField<number>();
      continue;
    }
    const warnings = [...best.warnings];
    if (best.basis === 'serving_only') {
      warnings.push('value declared per serving only — left empty (never converted to per-100)');
      nutrientFields[spec.key] = { ...emptyField<number>(warnings, true), sourceLines: [best.line.text], ocrConfidence: best.line.confidence, band: band(best.line.confidence) };
      continue;
    }
    if (usable.length > 1) {
      warnings.push('duplicated nutrition rows found — kept the per-100 block value');
    }
    if (best.basis === 'per_100ml') {
      warnings.push('declared per 100 ml (not per 100 g) — density NOT applied, verify');
    }
    nutrientFields[spec.key] = foundField(best.value as number, [best.line], warnings);
  }

  /* energy (kJ + kcal) — energy keyword line, or its continuation line */
  const energyLineIdx = lines.findIndex((l) => /\benergy\b|valor\s+energ[ée]tico|\benerg[íi]a\b/i.test(l.text));
  let energyKj = emptyField<number>();
  let energyKcal = emptyField<number>();
  const energyCandidates: ParsedOcrLine[] = [];
  if (energyLineIdx >= 0) {
    const l0 = lines[energyLineIdx];
    if (l0) energyCandidates.push(l0);
    const l1 = lines[energyLineIdx + 1];
    if (l1 && /k\s?j|kcal/i.test(l1.text) && !/\benergy\b/i.test(l1.text)) energyCandidates.push(l1);
  }
  for (const line of energyCandidates) {
    const kjMatch = /(\d(?:[\d\s]*[.,])?\d*)\s*k\s?j\b/i.exec(line.text);
    const kcalMatch = /(\d(?:[\d\s]*[.,])?\d*)\s*kcal\b/i.exec(line.text);
    if (kjMatch?.[1] && energyKj.value === null) {
      const { value, warning } = normalizeNumberToken(kjMatch[1]);
      if (value !== null && value >= 0 && value <= 4000) energyKj = foundField(value, [line]);
      else energyKj = emptyField<number>(warning ? [warning] : ['energy kJ out of plausible range — left empty'], true);
    }
    if (kcalMatch?.[1] && energyKcal.value === null) {
      const { value, warning } = normalizeNumberToken(kcalMatch[1]);
      if (value !== null && value >= 0 && value <= 1000) energyKcal = foundField(value, [line]);
      else energyKcal = emptyField<number>(warning ? [warning] : ['energy kcal out of plausible range — left empty'], true);
    }
  }

  /* ingredients */
  let ingredientsText = emptyField<string>();
  const ingIdx = lines.findIndex((l) => /^ingredient(s|es)?\s*[:-]?/i.test(l.text) || /\bingredient(s|es)\s*:/i.test(l.text));
  if (ingIdx >= 0) {
    const line = lines[ingIdx];
    const fragment = line ? line.text.replace(/^.*?ingredient(?:s|es)?\s*[:-]?\s*/i, '') : '';
    const section = captureSection(lines, ingIdx, fragment);
    if (section.text !== '') ingredientsText = foundField(section.text, section.sourceLines);
  }

  /* allergens ("contains"/"allergens") + may-contain */
  let allergens = emptyField<string>();
  const allergenIdx = lines.findIndex(
    (l) => (/\ballergens?\b|\bal[ée]rgenos?\b/i.test(l.text) || /^cont(ains|iene)\b/i.test(l.text)) && !/may\s+contain|puede\s+contener/i.test(l.text),
  );
  if (allergenIdx >= 0) {
    const line = lines[allergenIdx];
    const fragment = line ? line.text.replace(/^.*?(allergens?|al[ée]rgenos?|contains|contiene)\s*[:-]?\s*/i, '') : '';
    const section = captureSection(lines, allergenIdx, fragment);
    if (section.text !== '') allergens = foundField(section.text, section.sourceLines);
  }

  let mayContain = emptyField<string>();
  const mayIdx = lines.findIndex((l) => /may\s+contain|puede\s+contener|traces\s+of|\btrazas\s+de\b/i.test(l.text));
  if (mayIdx >= 0) {
    const line = lines[mayIdx];
    const fragment = line ? line.text.replace(/^.*?(may\s+contain|puede\s+contener(?:\s+trazas\s+de)?|traces\s+of|trazas\s+de)\s*[:-]?\s*/i, '') : '';
    const section = captureSection(lines, mayIdx, fragment);
    if (section.text !== '') mayContain = foundField(section.text, section.sourceLines);
  }

  /* storage instructions */
  let storageInstructions = emptyField<string>();
  const storageLines = lines.filter((l) =>
    /\bstorage\b|\bstore\b|keep\s+(refrigerated|frozen|cool|in\s+a)|conservar|cons[ée]rvese|mantener\s+(refrigerado|congelado)/i.test(l.text),
  );
  if (storageLines.length > 0) {
    const text = storageLines.map((l) => l.text).join(' ');
    storageInstructions = foundField(text, storageLines);
  }

  /* net quantity */
  let netQuantity = emptyField<string>();
  const qtyLine =
    lines.find((l) => NET_QTY_KEYWORD.test(l.text) && NET_QTY_VALUE.test(l.text)) ??
    lines.find((l) => STANDALONE_QTY.test(l.text)) ??
    lines.find((l) => /℮/.test(l.text) && NET_QTY_VALUE.test(l.text));
  if (qtyLine) {
    const m = NET_QTY_VALUE.exec(qtyLine.text);
    if (m?.[1] && m[2]) {
      const { value, warning } = normalizeNumberToken(m[1]);
      if (value !== null) netQuantity = foundField(`${value} ${m[2].toLowerCase()}`, [qtyLine], warning ? [warning] : []);
    }
  }

  /* EAN / barcode digits found in the OCR text */
  let eanCode = emptyField<string>();
  const digitRuns = [...fullText.matchAll(/\d(?:[\d ]*\d)?/g)]
    .map((m) => m[0].replace(/\s+/g, ''))
    .filter((d) => looksLikeBarcode(d));
  if (digitRuns.length > 0) {
    const ean13 = digitRuns.find((d) => d.length === 13);
    const chosen = ean13 ?? digitRuns[0];
    if (chosen) {
      const sourceLine = lines.find((l) => l.text.replace(/\s+/g, '').includes(chosen)) ?? null;
      const warnings = digitRuns.length > 1 ? [`multiple barcode-shaped digit runs found (${digitRuns.length}) — first EAN-13-like kept, verify`] : [];
      eanCode = foundField(chosen, sourceLine ? [sourceLine] : [], warnings, true);
    }
  }

  /* product name — heuristic: first plausible headline; ALWAYS needs review */
  let productName = emptyField<string>(['product name is a heuristic guess from the top of the label — confirm manually'], true);
  const nameLine = lines
    .slice(0, 8)
    .find(
      (l) =>
        l.text.length >= 3 &&
        l.text.length <= 60 &&
        !NON_NAME_LINE.test(l.text) &&
        !STANDALONE_QTY.test(l.text) &&
        (l.text.match(/[a-záéíóúñü]/gi) ?? []).length >= Math.ceil(l.text.length / 2),
    );
  if (nameLine) {
    productName = foundField(nameLine.text, [nameLine], ['product name is a heuristic guess from the top of the label — confirm manually'], true);
  }

  /* brand — only from an explicit Brand:/Marca: line, never guessed */
  let brand = emptyField<string>(['no explicit brand line found — enter manually if known'], true);
  const brandLine = lines.find((l) => /^(brand|marca)\s*[:-]/i.test(l.text));
  if (brandLine) {
    const value = brandLine.text.replace(/^(brand|marca)\s*[:-]\s*/i, '').trim();
    if (value !== '') brand = foundField(value, [brandLine], [], true);
  }

  /* sodium listed but salt missing — warn, never convert */
  if (nutrientFields.salt.value === null && /\bsodium\b|\bsodio\b/i.test(fullText)) {
    globalWarnings.push('sodium is listed but salt was not found — NOT converted (enter salt manually)');
  }

  return {
    productName,
    brand,
    eanCode,
    netQuantity,
    basis,
    energyKj,
    energyKcal,
    fat: nutrientFields.fat,
    saturatedFat: nutrientFields.saturatedFat,
    carbohydrates: nutrientFields.carbohydrates,
    sugars: nutrientFields.sugars,
    protein: nutrientFields.protein,
    salt: nutrientFields.salt,
    ingredientsText,
    allergens,
    mayContain,
    storageInstructions,
    languageHint: detectLanguage(fullText),
    warnings: globalWarnings,
  };
}
