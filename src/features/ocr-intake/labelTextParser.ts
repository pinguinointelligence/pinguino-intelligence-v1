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
 * blocks (per-100 basis preferred, contradictory same-basis rows exposed as multiple
 * candidates); EN/ES/DE/PL/IT label vocabulary (diacritic-tolerant for OCR noise);
 * package sizes incl. multipacks ("6 x 330 ml" — recorded with a warning); EAN-8 /
 * EAN-13 checksum validation (invalid checksum → raw kept, normalized null);
 * four DISTINCT value outcomes: real value / "<0.1"-or-traces / explicit 0 / blank.
 */

import { looksLikeBarcode } from '@/data/products/intakeClassifier';

/** One OCR line with its aggregated confidence (0–100), null when unavailable. */
export interface ParsedOcrLine {
  text: string;
  confidence: number | null;
}

export type NutritionBasis = 'per_100g' | 'per_100ml' | 'serving_only' | 'unknown';

export type ConfidenceBand = 'high' | 'medium' | 'low';

/**
 * How the (possibly null) value came to be — the four locked outcomes are DISTINCT:
 *   'value'        a real printed value was read (explicit 0 included — value 0);
 *   'trace'        printed as "<x" / "traces" — normalized stays null, warning set;
 *   'row_no_value' the row/heading exists but its value was unreadable/ambiguous;
 *   'conflict'     contradictory values at the same basis — nothing silently picked;
 *   'absent'       nothing detected — null, NEVER zero.
 */
export type FieldDetection = 'value' | 'trace' | 'row_no_value' | 'conflict' | 'absent';

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
  /** value-outcome marker (see FieldDetection); defaults to 'absent'/'value'. */
  detection: FieldDetection;
}

export type LanguageHint = 'en' | 'es' | 'de' | 'pl' | 'it' | 'unknown';

export type PackageUnit = 'g' | 'kg' | 'ml' | 'l';

/** One EAN/barcode-shaped digit run found in the text, checksum-validated. */
export interface EanCandidate {
  /** digits exactly as concatenated from the label (spaces/hyphens stripped). */
  raw: string;
  /** checksum-valid EAN-8/EAN-13, else null (raw is KEPT — never discarded). */
  normalized: string | null;
  /** the OCR line the digits came from, when locatable. */
  sourceLine: string | null;
  ocrConfidence: number | null;
  warnings: string[];
}

/** One nutrient-row reading — the parser exposes ALL of them so contradictory or
 * duplicated tables become multiple review candidates (never a silent pick). */
export interface NutrientCandidate {
  value: number | null;
  basis: NutritionBasis;
  sourceLine: string;
  ocrConfidence: number | null;
  warnings: string[];
  kind: 'value' | 'trace' | 'row_no_value';
}

export type NutrientKey =
  | 'fat'
  | 'saturatedFat'
  | 'carbohydrates'
  | 'sugars'
  | 'protein'
  | 'salt'
  | 'sodium'
  | 'fibre';

export interface LabelExtraction {
  productName: ExtractedField<string>;
  brand: ExtractedField<string>;
  eanCode: ExtractedField<string>;
  /** every barcode-shaped digit run with checksum verdicts (multi-candidate). */
  eanCandidates: EanCandidate[];
  /** net quantity as printed, e.g. "500 g" or "6 x 330 ml" — maps to package_size. */
  netQuantity: ExtractedField<string>;
  /** normalized numeric size (multipack → per-unit size, flagged with a warning). */
  packageSize: ExtractedField<number>;
  packageUnit: ExtractedField<PackageUnit>;
  basis: NutritionBasis;
  /** basis as an evidence field (source line + confidence) for the extractor. */
  basisDetail: ExtractedField<NutritionBasis>;
  energyKj: ExtractedField<number>;
  energyKcal: ExtractedField<number>;
  fat: ExtractedField<number>;
  saturatedFat: ExtractedField<number>;
  carbohydrates: ExtractedField<number>;
  sugars: ExtractedField<number>;
  protein: ExtractedField<number>;
  salt: ExtractedField<number>;
  /** sodium is RECORDED as its own field — NEVER auto-converted to salt. */
  sodium: ExtractedField<number>;
  fibre: ExtractedField<number>;
  /** every nutrient-row reading per key — duplicates/conflicts stay visible. */
  nutrientCandidates: Record<NutrientKey, NutrientCandidate[]>;
  ingredientsText: ExtractedField<string>;
  allergens: ExtractedField<string>;
  mayContain: ExtractedField<string>;
  storageInstructions: ExtractedField<string>;
  /** claims read from the label; value true ONLY when printed — absence is null,
   * NEVER false (a missing claim is unknown, not a negative). */
  claimVegan: ExtractedField<boolean>;
  claimVegetarian: ExtractedField<boolean>;
  claimGlutenFree: ExtractedField<boolean>;
  claimLactoseFree: ExtractedField<boolean>;
  /** language hint from label vocabulary — a hint only, never written to a product. */
  languageHint: LanguageHint;
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

const emptyField = <T>(
  warnings: string[] = [],
  needsReview = false,
  detection: FieldDetection = 'absent',
): ExtractedField<T> => ({
  value: null,
  ocrConfidence: null,
  band: null,
  sourceLines: [],
  warnings,
  needsReview: needsReview || warnings.length > 0,
  detection,
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
    detection: 'value',
  };
};

/** Split raw OCR text into trimmed lines (confidence unknown). */
export function linesFromText(text: string): ParsedOcrLine[] {
  return text
    .split(/\r?\n/)
    .map((t) => ({ text: t.trim(), confidence: null }));
}

/** The exact per-line cleanup parseLabelText applies (garbage glyphs + whitespace) —
 * exported so evidence extraction can map parsed sourceLines back to raw line indices. */
export const normalizeOcrLineText = (text: string): string =>
  text.replace(/[|¢©®™]/g, ' ').replace(/\s+/g, ' ').trim();

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
  key: NutrientKey;
  keyword: RegExp;
  /** phrases removed from the line copy before this spec matches (prevents "saturated
   * fat" feeding the plain "fat" row). */
  maskFirst?: RegExp;
  max: number;
  /** warning attached to EVERY reading of this row (e.g. the sodium rule). */
  alwaysWarn?: string;
}

/* keyword regexes end with (?![a-z]) instead of \b so a glued OCR value still matches
 * ("Fat34.9 g", "Salt0.11g" are real tesseract outputs from the committed fixtures).
 * Diacritics are matched tolerantly ([äa], [łl], …) because OCR often ASCII-folds them.
 * Languages: EN, ES, DE (Fett/Zucker/Eiweiß/Salz/Kohlenhydrate/Ballaststoffe),
 * PL (Tłuszcz/cukry/Białko/Sól/Węglowodany/Błonnik), IT (Grassi/zuccheri/Proteine/
 * Sale/Carboidrati/Fibre). */
const NUTRIENT_SPECS: readonly NutrientSpec[] = [
  {
    key: 'saturatedFat',
    keyword:
      /\bsaturates(?![a-z])|saturated\s+fat(?![a-z])|\bsaturad[ao]s(?![a-z])|ges[äa]ttigte\s+fett\s?s[äa]uren(?![a-z])|kwasy\s+t[łl]uszczowe\s+nasycone(?![a-z])|\bnasycone(?![a-z])|acidi\s+grassi\s+saturi(?![a-z])|\bsaturi(?![a-z])/i,
    max: 100,
  },
  {
    key: 'fat',
    keyword: /\bfat(?![a-z])|\bgrasas?(?![a-z])|\bfett(?![a-z])|t[łl]uszcz(?![a-ząćęłńóśźż])|\bgrassi(?![a-z])/i,
    maskFirst:
      /saturated\s+fat|grasas\s+saturadas|ges[äa]ttigte\s+fett\s?s[äa]uren|kwasy\s+t[łl]uszczowe(\s+nasycone)?|(acidi\s+)?grassi\s+saturi/gi,
    max: 100,
  },
  {
    key: 'sugars',
    keyword: /\bsugars?(?![a-z])|\baz[úu]cares(?![a-z])|\bzucker(?![a-z])|\bcukry(?![a-z])|\bcukier(?![a-z])|\bzuccheri(?![a-z])/i,
    max: 100,
  },
  {
    key: 'carbohydrates',
    keyword:
      /\bcarbohydrates?(?![a-z])|hidratos\s+de\s+carbono(?![a-z])|\bcarbohidratos?(?![a-z])|kohle?nhydrate(?![a-z])|w[ęe]glowodany(?![a-z])|carboidrati(?![a-z])/i,
    max: 100,
  },
  {
    key: 'protein',
    keyword: /\bproteins?(?![a-z])|\bprote[íi]nas?(?![a-z])|\beiwei(?:ß|ss|s|b)?(?![a-z])|bia[łl]ko(?![a-z])|\bproteine(?![a-z])/i,
    max: 100,
  },
  {
    key: 'salt',
    keyword: /\bsalt(?![a-z])|\bsal(?![a-z])|\bsalz(?![a-z])|\bs[óo]l(?![a-ząćęłńóśźż])|\bsale(?![a-z])/i,
    max: 100,
  },
  {
    key: 'sodium',
    keyword: /\bsodium(?![a-z])|\bsodio(?![a-z])|\bnatrium(?![a-z])|\bs[óo]d(?![a-ząćęłńóśźż])/i,
    max: 100,
    alwaysWarn:
      'recorded as SODIUM (its own field) — converting sodium to salt is a human decision, never automatic',
  },
  {
    key: 'fibre',
    keyword: /\bfib(?:re|er)s?(?![a-z])|\bfibra(?![a-z])|ballaststoffe(?![a-z])|b[łl]onnik(?![a-z])/i,
    max: 100,
  },
];

/* per-100 basis wording: EN per, ES por, DE pro/je, PL w/na, IT per — all reduce to
 * the bare "100 g" / "100 ml" token, which the regex also accepts on its own. */
const BASIS_100G = /\b(per|por|pro|je|na|w)\s*100\s*g\b|\b100\s*g\b/i;
const BASIS_100ML = /\b(per|por|pro|je|na|w)\s*100\s*ml\b|\b100\s*ml\b/i;
const BASIS_SERVING =
  /\bper\s+serving\b|\bserving\b|\bpor\s+porci[óo]n\b|\bporci[óo]n\b|\braci[óo]n\b|\bpro\s+portion\b|\bje\s+portion\b|\bportion\b|na\s+porcj[ęe]|w\s+porcji|\bporcja\b|per\s+porzione|\bporzione\b/i;

/** number + mass-unit occurrences after a keyword; `<`/`≤` marks below-quantification. */
const VALUE_TOKEN = /([<≤])?\s*(\d(?:[\d\s]*[.,])?\d*)\s*(mg|kg|g)\b/gi;
/** stateless single-match copy of VALUE_TOKEN (a global regex is stateful under .test()). */
const VALUE_TOKEN_TEST = new RegExp(VALUE_TOKEN.source, 'i');

/** "traces" as a printed VALUE (EN/DE/ES/PL/IT) — distinct from a blank cell. */
const TRACE_WORD = /\btraces?(?![a-z])|\bspuren(?![a-z])|\btrazas?(?![a-z])|[śs]ladowe(?![a-ząćęłńóśźż])|\btracce(?![a-z])/i;

interface RowReading {
  line: ParsedOcrLine;
  value: number | null;
  warnings: string[];
  basis: NutritionBasis;
  kind: 'value' | 'trace' | 'row_no_value';
}

function extractNutrientFromLine(line: ParsedOcrLine, spec: NutrientSpec, basisAtLine: NutritionBasis): RowReading | null {
  let scan = line.text.replace(/\b(per|por|pro|je|na|w)\s*100\s*(g|ml)\b/gi, ' ');
  if (spec.maskFirst) scan = scan.replace(spec.maskFirst, ' ');
  const keywordMatch = spec.keyword.exec(scan);
  if (!keywordMatch) return null;

  const after = scan.slice(keywordMatch.index + keywordMatch[0].length);
  const warnings: string[] = spec.alwaysWarn ? [spec.alwaysWarn] : [];
  const tokens = [...after.matchAll(VALUE_TOKEN)];
  if (tokens.length === 0) {
    const traceWord = TRACE_WORD.exec(after);
    if (traceWord) {
      warnings.push(`printed as "${traceWord[0]}" (trace amount) — left empty, a human decides`);
      return { line, value: null, warnings, basis: basisAtLine, kind: 'trace' };
    }
    warnings.push('row found but no readable value');
    return { line, value: null, warnings, basis: basisAtLine, kind: 'row_no_value' };
  }
  if (tokens.length > 1) {
    warnings.push('multiple values on this row (possible per-serving column) — first taken, verify');
  }
  const token = tokens[0];
  if (!token) return { line, value: null, warnings, basis: basisAtLine, kind: 'row_no_value' };
  const [, lessThan, rawNumber = '', unit = 'g'] = token;
  if (lessThan) {
    warnings.push(`printed as "<${rawNumber.replace(/\s+/g, '')} ${unit}" (below quantification) — left empty, enter manually`);
    return { line, value: null, warnings, basis: basisAtLine, kind: 'trace' };
  }
  const { value, warning } = normalizeNumberToken(rawNumber);
  if (warning) warnings.push(warning);
  if (value === null) return { line, value: null, warnings, basis: basisAtLine, kind: 'row_no_value' };

  let grams = value;
  const u = unit.toLowerCase();
  if (u === 'mg') grams = value / 1000;
  if (u === 'kg') grams = value * 1000;
  if (grams < 0 || grams > spec.max) {
    warnings.push(`value ${grams} g out of range (0–${spec.max}) — left empty`);
    return { line, value: null, warnings, basis: basisAtLine, kind: 'row_no_value' };
  }
  return { line, value: grams, warnings, basis: basisAtLine, kind: 'value' };
}

const basisRank: Record<NutritionBasis, number> = {
  per_100g: 3,
  per_100ml: 2,
  unknown: 1,
  serving_only: 0,
};

/* ── section extraction (ingredients / allergens / storage) ───────────────── */

/** Section-heading vocabulary, EN/ES/DE/PL/IT (diacritic-tolerant for OCR noise). */
const INGREDIENTS_HEADING = /\bingredient(?:s|es|i)?(?![a-z])|\bzutaten(?![a-z])|sk[łl]adniki(?![a-ząćęłńóśźż])/i;
const ALLERGENS_HEADING = /\ballergens?(?![a-z])|\bal[ée]rgenos?(?![a-z])|\ballergene(?![a-z])|\balergeny(?![a-z])|\ballergeni(?![a-z])/i;
const MAY_CONTAIN_HEADING =
  /may\s+contain|puede\s+contener|traces\s+of|\btrazas\b|kann\s+spuren|mo[żz]e\s+zawiera[ćc]?|pu[òo]\s+contenere|[śs]ladowe\s+ilo[śs]ci/i;
const NUTRITION_HEADING =
  /nutrition|nutritional|informaci[óo]n\s+nutricional|valores?\s+medios|n[äa]hrwert|warto[śs][ćc]\s+od[żz]ywcza|valori\s+nutrizionali/i;
const STORAGE_HEADING =
  /\bstorage\b|\bstore\b|keep\s+(refrigerated|frozen|cool|in\s+a)|conservar(?!e)|cons[ée]rvese|mantener\s+(refrigerado|congelado)|mantener|k[üu]hl\s+und\s+trocken|\blagern(?![a-z])|\blagerung(?![a-z])|przechowywa[ćc]|\bconservare(?![a-z])/i;
const ENERGY_ROW =
  /\benergy\b|valor\s+energ[ée]tico|\benerg[íi]a\b|\bbrennwert(?![a-z])|\benergie(?![a-z])|warto[śs][ćc]\s+energetyczna|energetyczna(?![a-z])|valore\s+energetico/i;

const SECTION_STOPPERS = [
  INGREDIENTS_HEADING,
  ALLERGENS_HEADING,
  MAY_CONTAIN_HEADING,
  NUTRITION_HEADING,
  STORAGE_HEADING,
  /best\s+before|consumir\s+preferentemente|mindestens\s+haltbar|najlepiej\s+spo[żz]y[ćc]|da\s+consumarsi/i,
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
  /nutrition|nutricional|ingredient|zutaten|sk[łl]adniki|al[ée]rgeno|allergen|alergeny|energy|energ[íi]a|energie|brennwert|energetyczna|valor|n[äa]hrwert|warto[śs][ćc]|per\s*100|por\s*100|pro\s*100|best\s+before|may\s+contain|puede\s+contener|kann\s+spuren|mo[żz]e\s+zawiera|pu[òo]\s+contenere|conservar|conservare|przechowywa|lagern|storage|\bstore\b|net\s*(weight|quantity)|peso\s+net[to]|nettogewicht|masa\s+netto|barcode|\bean\b/i;

const NET_QTY_KEYWORD =
  /net\s*(weight|quantity|wt|content)|peso\s+neto|contenido\s+neto|cantidad\s+neta|nettogewicht|nettof[üu]llmenge|f[üu]llmenge|masa\s+netto|zawarto[śs][ćc]\s+netto|obj[ęe]to[śs][ćc]\s+netto|peso\s+netto|contenuto\s+netto|quantit[àa]\s+netta/i;
const NET_QTY_VALUE = /(\d(?:[\d\s]*[.,])?\d*)\s*(kg|g|ml|l)\b\s*(℮|e)?/i;
const STANDALONE_QTY = /^\s*(\d(?:[\d\s]*[.,])?\d*)\s*(kg|g|ml|l)\s*(℮|e)?\s*$/i;
/** multipack: "6 x 330 ml", "6x330ml", "6 × 330 ml" — count × per-unit size. */
const MULTIPACK_QTY = /(\d{1,3})\s*[x×]\s*(\d(?:[\d\s]*[.,])?\d*)\s*(kg|g|ml|l)\b/i;

/* ── package-size normalization (pure, exported for the extractor + tests) ──── */

export interface ParsedPackageSize {
  /** normalized numeric size; for multipacks the PER-UNIT size (total in warning). */
  size: number | null;
  unit: PackageUnit | null;
  /** the quantity string as printed, whitespace-normalized (e.g. "6 x 330 ml"). */
  printed: string | null;
  multipack: { count: number; unitSize: number } | null;
  warnings: string[];
}

const NO_PACKAGE_SIZE: ParsedPackageSize = { size: null, unit: null, printed: null, multipack: null, warnings: [] };

/** Parse one line's package-size declaration: "500 g", "1 l", "0,5 L", "330ml",
 * multipacks "6 x 330 ml". Multipacks record the per-unit size WITH a warning —
 * the total is never silently substituted. */
export function parsePackageSize(text: string): ParsedPackageSize {
  const multi = MULTIPACK_QTY.exec(text);
  if (multi?.[1] && multi[2] && multi[3]) {
    const count = Number(multi[1]);
    const { value: unitSize, warning } = normalizeNumberToken(multi[2]);
    const unit = multi[3].toLowerCase() as PackageUnit;
    if (unitSize === null || count <= 0) {
      return { ...NO_PACKAGE_SIZE, warnings: [warning ?? `unreadable multipack quantity "${multi[0]}"`] };
    }
    return {
      size: unitSize,
      unit,
      printed: `${count} x ${unitSize} ${unit}`,
      multipack: { count, unitSize },
      warnings: [
        `multipack "${count} x ${unitSize} ${unit}" — recorded per-unit size ${unitSize} ${unit} (${count} units, total ${count * unitSize} ${unit}) — confirm which applies`,
      ],
    };
  }
  const single = NET_QTY_VALUE.exec(text);
  if (single?.[1] && single[2]) {
    const { value, warning } = normalizeNumberToken(single[1]);
    if (value === null) return { ...NO_PACKAGE_SIZE, warnings: warning ? [warning] : [] };
    const unit = single[2].toLowerCase() as PackageUnit;
    return { size: value, unit, printed: `${value} ${unit}`, multipack: null, warnings: warning ? [warning] : [] };
  }
  return NO_PACKAGE_SIZE;
}

/* ── EAN / barcode checksum validation (pure, exported) ─────────────────────── */

export interface NormalizedEan {
  /** input digits after stripping spaces and hyphens. */
  digits: string;
  /** checksum-valid EAN-8/EAN-13, else null (digits are KEPT for review). */
  normalized: string | null;
  warning: string | null;
}

const eanChecksumValid = (digits: string): boolean => {
  // EAN-13: weights 1,3 from the left; EAN-8: weights 3,1 from the left.
  const firstWeight = digits.length === 8 ? 3 : 1;
  let sum = 0;
  for (let i = 0; i < digits.length - 1; i += 1) {
    const d = Number(digits[i]);
    sum += i % 2 === 0 ? d * firstWeight : d * (4 - firstWeight);
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
};

/** Normalize a barcode-shaped string: strip spaces/hyphens, validate the EAN-8 /
 * EAN-13 checksum. Invalid checksum → normalized null + warning (digits kept). */
export function normalizeEanCode(raw: string): NormalizedEan {
  const digits = raw.replace(/[\s-]+/g, '');
  if (!/^\d+$/.test(digits) || digits.length === 0) {
    return { digits, normalized: null, warning: `"${raw}" is not a digit sequence — not an EAN` };
  }
  if (digits.length === 13 || digits.length === 8) {
    if (eanChecksumValid(digits)) return { digits, normalized: digits, warning: null };
    return {
      digits,
      normalized: null,
      warning: `"${digits}" fails the EAN-${digits.length} checksum — raw digits kept, verify manually`,
    };
  }
  return {
    digits,
    normalized: null,
    warning: `"${digits}" is ${digits.length} digits — not EAN-8/EAN-13, checksum not verifiable`,
  };
}

/* ── claims (vegan / vegetarian / gluten-free / lactose-free), 5 languages ──── */

const CLAIM_PATTERNS: ReadonlyArray<{ key: 'claimVegan' | 'claimVegetarian' | 'claimGlutenFree' | 'claimLactoseFree'; pattern: RegExp }> = [
  { key: 'claimVegan', pattern: /\bvegan[oae]?(?![a-z])|wega[ńn]sk\w*/i },
  { key: 'claimVegetarian', pattern: /\bvegetari(?:an|sch|ano?|ana)(?![a-z])|wegetaria[ńn]sk\w*/i },
  {
    key: 'claimGlutenFree',
    pattern: /gluten[\s-]?free|glutenfrei|sin\s+gluten|senza\s+glutine|bezglutenow\w*|bez\s+glutenu/i,
  },
  {
    key: 'claimLactoseFree',
    pattern: /lactose[\s-]?free|laktose[\s-]?frei|sin\s+lactosa|senza\s+lattosio|bez\s+laktozy|laktozy\s+nie\s+zawiera/i,
  },
];

/* ── language hint ─────────────────────────────────────────────────────────── */

const ES_MARKERS = [/ingredientes/i, /energ[íi]a/i, /\bgrasas\b/i, /az[úu]cares/i, /prote[íi]nas/i, /\bsal\b/i, /puede\s+contener/i, /conservar(?!e)|cons[ée]rvese/i, /peso\s+neto/i, /valor\s+energ[ée]tico/i];
const EN_MARKERS = [/ingredients\b/i, /\benergy\b/i, /\bfat\b/i, /\bsugars\b/i, /\bprotein\b/i, /\bsalt\b/i, /may\s+contain/i, /\bstore\b|keep\s+refrigerated/i, /net\s+weight/i, /of\s+which/i];
const DE_MARKERS = [/zutaten/i, /n[äa]hrwerte?/i, /brennwert/i, /kann\s+spuren/i, /davon\s+zucker/i, /\bfett\b/i, /eiwei(?:ß|ss)/i, /\bsalz\b/i, /kohle?nhydrate/i, /nettogewicht|f[üu]llmenge/i, /enth[äa]lt/i, /lagern|lagerung/i];
const PL_MARKERS = [/sk[łl]adniki/i, /warto[śs][ćc]\s+od[żz]ywcza/i, /warto[śs][ćc]\s+energetyczna/i, /mo[żz]e\s+zawiera[ćc]/i, /bia[łl]ko/i, /\bs[óo]l\b/i, /t[łl]uszcz/i, /w\s+tym\s+cukry/i, /w[ęe]glowodany/i, /b[łl]onnik/i, /przechowywa[ćc]/i, /zawiera\b/i];
const IT_MARKERS = [/ingredienti/i, /valori\s+nutrizionali/i, /valore\s+energetico/i, /pu[òo]\s+contenere/i, /\bgrassi\b/i, /di\s+cui\s+zuccheri/i, /proteine/i, /\bsale\b/i, /carboidrati/i, /\bconservare\b/i];

function detectLanguage(text: string): LanguageHint {
  const scores: Array<[LanguageHint, number]> = [
    ['en', EN_MARKERS.filter((re) => re.test(text)).length],
    ['es', ES_MARKERS.filter((re) => re.test(text)).length],
    ['de', DE_MARKERS.filter((re) => re.test(text)).length],
    ['pl', PL_MARKERS.filter((re) => re.test(text)).length],
    ['it', IT_MARKERS.filter((re) => re.test(text)).length],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  const [best, runnerUp] = scores;
  if (best && best[1] >= 2 && (!runnerUp || best[1] > runnerUp[1])) return best[0];
  return 'unknown';
}

/* ── main parser ──────────────────────────────────────────────────────────── */

export function parseLabelText(input: ParsedOcrLine[]): LabelExtraction {
  // collapse whitespace and drop common OCR garbage glyphs (¢ etc. show up between a
  // number and its unit in real tesseract output — observed on the committed fixtures)
  const lines = input.map((l) => ({
    text: normalizeOcrLineText(l.text),
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
  let firstLine100g: ParsedOcrLine | null = null;
  let firstLine100ml: ParsedOcrLine | null = null;
  let firstLineServing: ParsedOcrLine | null = null;
  for (const line of lines) {
    const is100g = BASIS_100G.test(line.text);
    const is100ml = BASIS_100ML.test(line.text);
    const isServing = BASIS_SERVING.test(line.text);
    if (is100g) {
      currentBasis = 'per_100g';
      saw100g = true;
      firstLine100g ??= line;
    } else if (is100ml) {
      currentBasis = 'per_100ml';
      saw100ml = true;
      firstLine100ml ??= line;
    } else if (isServing) {
      currentBasis = 'serving_only';
      sawServing = true;
      firstLineServing ??= line;
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
  const basisLine =
    basis === 'per_100g' ? firstLine100g : basis === 'per_100ml' ? firstLine100ml : basis === 'serving_only' ? firstLineServing : null;
  const basisDetail: ExtractedField<NutritionBasis> = basisLine
    ? foundField<NutritionBasis>(basis, [basisLine], basis === 'serving_only' ? ['serving-only basis — per-100 nutrition is never derived from it'] : [])
    : emptyField<NutritionBasis>();

  /* nutrients — every row reading is kept in nutrientCandidates (duplicates and
   * contradictions stay VISIBLE for review); the single-value field then resolves:
   * per-100 basis outranks per-serving, but two DIFFERENT values at the same best
   * basis are a conflict — nothing is silently picked (value null + both exposed). */
  const nutrientFields = {} as Record<NutrientKey, ExtractedField<number>>;
  const nutrientCandidates = {} as Record<NutrientKey, NutrientCandidate[]>;
  for (const spec of NUTRIENT_SPECS) {
    const readings: RowReading[] = [];
    lines.forEach((line, idx) => {
      const c = extractNutrientFromLine(line, spec, basisAt[idx] ?? 'unknown');
      if (c) readings.push(c);
    });
    nutrientCandidates[spec.key] = readings.map((r) => ({
      value: r.value,
      basis: r.basis,
      sourceLine: r.line.text,
      ocrConfidence: r.line.confidence,
      warnings: [...r.warnings],
      kind: r.kind,
    }));
    const usable = readings.filter((c) => c.value !== null);
    if (usable.length === 0) {
      const withWarnings = readings.find((c) => c.warnings.length > 0);
      nutrientFields[spec.key] = withWarnings
        ? { ...emptyField<number>(withWarnings.warnings, true, withWarnings.kind === 'value' ? 'row_no_value' : withWarnings.kind), sourceLines: [withWarnings.line.text], ocrConfidence: withWarnings.line.confidence, band: band(withWarnings.line.confidence) }
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
      nutrientFields[spec.key] = { ...emptyField<number>(warnings, true, 'row_no_value'), sourceLines: [best.line.text], ocrConfidence: best.line.confidence, band: band(best.line.confidence) };
      continue;
    }
    const atBestBasis = usable.filter((c) => c.basis === best.basis);
    const distinctValues = [...new Set(atBestBasis.map((c) => c.value))];
    if (distinctValues.length > 1) {
      const shown = distinctValues.map((v) => `${v} g`).join(' vs ');
      nutrientFields[spec.key] = {
        ...emptyField<number>(
          [...warnings, `contradictory values at the same basis (${shown}) — nothing picked, resolve manually`],
          true,
          'conflict',
        ),
        sourceLines: atBestBasis.map((c) => c.line.text),
        ocrConfidence: meanConfidence(atBestBasis.map((c) => c.line)),
        band: band(meanConfidence(atBestBasis.map((c) => c.line))),
      };
      continue;
    }
    if (usable.length > atBestBasis.length) {
      warnings.push('duplicated nutrition rows found — kept the per-100 block value');
    } else if (atBestBasis.length > 1) {
      warnings.push('duplicated nutrition rows with the SAME value — kept once');
    }
    if (best.basis === 'per_100ml') {
      warnings.push('declared per 100 ml (not per 100 g) — density NOT applied, verify');
    }
    nutrientFields[spec.key] = foundField(best.value as number, [best.line], warnings);
  }

  /* energy (kJ + kcal) — energy keyword line (EN/ES/DE/PL/IT), or its continuation */
  const energyLineIdx = lines.findIndex((l) => ENERGY_ROW.test(l.text));
  let energyKj = emptyField<number>();
  let energyKcal = emptyField<number>();
  const energyCandidates: ParsedOcrLine[] = [];
  if (energyLineIdx >= 0) {
    const l0 = lines[energyLineIdx];
    if (l0) energyCandidates.push(l0);
    const l1 = lines[energyLineIdx + 1];
    if (l1 && /k\s?j|kcal/i.test(l1.text) && !ENERGY_ROW.test(l1.text)) energyCandidates.push(l1);
  }
  for (const line of energyCandidates) {
    const kjMatch = /(\d(?:[\d\s]*[.,])?\d*)\s*k\s?j\b/i.exec(line.text);
    const kcalMatch = /(\d(?:[\d\s]*[.,])?\d*)\s*kcal\b/i.exec(line.text);
    if (kjMatch?.[1] && energyKj.value === null) {
      const { value, warning } = normalizeNumberToken(kjMatch[1]);
      if (value !== null && value >= 0 && value <= 4000) energyKj = foundField(value, [line]);
      else energyKj = emptyField<number>(warning ? [warning] : ['energy kJ out of plausible range — left empty'], true, 'row_no_value');
    }
    if (kcalMatch?.[1] && energyKcal.value === null) {
      const { value, warning } = normalizeNumberToken(kcalMatch[1]);
      if (value !== null && value >= 0 && value <= 1000) energyKcal = foundField(value, [line]);
      else energyKcal = emptyField<number>(warning ? [warning] : ['energy kcal out of plausible range — left empty'], true, 'row_no_value');
    }
  }

  /* ingredients — EN/ES/DE/PL/IT headings */
  let ingredientsText = emptyField<string>();
  const ingIdx = lines.findIndex(
    (l) => /^(ingredient(s|es|i)?|zutaten|sk[łl]adniki)\s*[:-]?/i.test(l.text) || /\b(ingredient(s|es|i)|zutaten|sk[łl]adniki)\s*:/i.test(l.text),
  );
  if (ingIdx >= 0) {
    const line = lines[ingIdx];
    const fragment = line ? line.text.replace(/^.*?(?:ingredient(?:s|es|i)?|zutaten|sk[łl]adniki)\s*[:-]?\s*/i, '') : '';
    const section = captureSection(lines, ingIdx, fragment);
    if (section.text !== '') ingredientsText = foundField(section.text, section.sourceLines);
  }

  /* allergens ("contains"/"allergens") + may-contain */
  let allergens = emptyField<string>();
  const allergenIdx = lines.findIndex(
    (l) =>
      (ALLERGENS_HEADING.test(l.text) || /^cont(ains|iene)\b/i.test(l.text) || /^(enth[äa]lt|zawiera)\s*[:-]?\s/i.test(l.text)) &&
      !MAY_CONTAIN_HEADING.test(l.text),
  );
  if (allergenIdx >= 0) {
    const line = lines[allergenIdx];
    const fragment = line
      ? line.text.replace(/^.*?(allergens?|al[ée]rgenos?|allergene|alergeny|allergeni|contains|contiene|enth[äa]lt|zawiera)\s*[:-]?\s*/i, '')
      : '';
    const section = captureSection(lines, allergenIdx, fragment);
    if (section.text !== '') allergens = foundField(section.text, section.sourceLines);
  }

  let mayContain = emptyField<string>();
  const mayIdx = lines.findIndex((l) => MAY_CONTAIN_HEADING.test(l.text));
  if (mayIdx >= 0) {
    const line = lines[mayIdx];
    const fragment = line
      ? line.text.replace(
          /^.*?(may\s+contain|puede\s+contener(?:\s+trazas\s+de)?|traces\s+of|trazas\s+de|kann\s+spuren\s+von|mo[żz]e\s+zawiera[ćc](?:\s+[śs]ladowe\s+ilo[śs]ci)?|pu[òo]\s+contenere(?:\s+tracce\s+di)?)\s*[:-]?\s*/i,
          '',
        )
      : '';
    const section = captureSection(lines, mayIdx, fragment);
    if (section.text !== '') mayContain = foundField(section.text, section.sourceLines);
  }

  /* storage instructions — EN/ES/DE/PL/IT */
  let storageInstructions = emptyField<string>();
  const storageLines = lines.filter((l) => STORAGE_HEADING.test(l.text));
  if (storageLines.length > 0) {
    const text = storageLines.map((l) => l.text).join(' ');
    storageInstructions = foundField(text, storageLines);
  }

  /* net quantity + normalized package size/unit (multipacks recorded + warned) */
  let netQuantity = emptyField<string>();
  let packageSize = emptyField<number>();
  let packageUnit = emptyField<PackageUnit>();
  const qtyLine =
    lines.find((l) => NET_QTY_KEYWORD.test(l.text) && (NET_QTY_VALUE.test(l.text) || MULTIPACK_QTY.test(l.text))) ??
    lines.find((l) => MULTIPACK_QTY.test(l.text)) ??
    lines.find((l) => STANDALONE_QTY.test(l.text)) ??
    lines.find((l) => /℮/.test(l.text) && NET_QTY_VALUE.test(l.text));
  if (qtyLine) {
    const parsed = parsePackageSize(qtyLine.text);
    if (parsed.size !== null && parsed.unit !== null && parsed.printed !== null) {
      const forceReview = parsed.multipack !== null;
      netQuantity = foundField(parsed.printed, [qtyLine], [...parsed.warnings], forceReview);
      packageSize = foundField(parsed.size, [qtyLine], [...parsed.warnings], forceReview);
      packageUnit = foundField(parsed.unit, [qtyLine], [...parsed.warnings], forceReview);
    } else if (parsed.warnings.length > 0) {
      netQuantity = { ...emptyField<string>(parsed.warnings, true, 'row_no_value'), sourceLines: [qtyLine.text], ocrConfidence: qtyLine.confidence, band: band(qtyLine.confidence) };
    }
  }

  /* EAN / barcode digit runs — EVERY run kept as a candidate; checksum validated
   * (EAN-8/EAN-13); invalid checksum → raw digits kept, normalized null + warning */
  let eanCode = emptyField<string>();
  const digitRuns = [...fullText.matchAll(/\d(?:[\d ]*\d)?/g)]
    .map((m) => m[0].replace(/\s+/g, ''))
    .filter((d) => looksLikeBarcode(d));
  const eanCandidates: EanCandidate[] = digitRuns.map((run) => {
    const { digits, normalized, warning } = normalizeEanCode(run);
    const sourceLine = lines.find((l) => l.text.replace(/\s+/g, '').includes(digits)) ?? null;
    return {
      raw: digits,
      normalized,
      sourceLine: sourceLine?.text ?? null,
      ocrConfidence: sourceLine?.confidence ?? null,
      warnings: warning ? [warning] : [],
    };
  });
  if (eanCandidates.length > 0) {
    const primary =
      eanCandidates.find((c) => c.normalized !== null && c.normalized.length === 13) ??
      eanCandidates.find((c) => c.normalized !== null) ??
      eanCandidates[0];
    if (primary) {
      const sourceLine = lines.find((l) => l.text.replace(/\s+/g, '').includes(primary.raw)) ?? null;
      const warnings = [...primary.warnings];
      if (eanCandidates.length > 1) {
        warnings.push(`multiple barcode-shaped digit runs found (${eanCandidates.length}) — checksum-valid EAN preferred, verify`);
      }
      eanCode =
        primary.normalized !== null
          ? foundField(primary.normalized, sourceLine ? [sourceLine] : [], warnings, true)
          : { ...emptyField<string>(warnings, true, 'row_no_value'), sourceLines: sourceLine ? [sourceLine.text] : [], ocrConfidence: sourceLine?.confidence ?? null, band: band(sourceLine?.confidence ?? null) };
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
        !MULTIPACK_QTY.test(l.text) &&
        (l.text.match(/[a-záéíóúñüäöüßàèéìòùłśżźćęąń]/gi) ?? []).length >= Math.ceil(l.text.length / 2),
    );
  if (nameLine) {
    productName = foundField(nameLine.text, [nameLine], ['product name is a heuristic guess from the top of the label — confirm manually'], true);
  }

  /* brand — only from an explicit Brand:/Marca:/Marke:/Marka: line, never guessed */
  let brand = emptyField<string>(['no explicit brand line found — enter manually if known'], true);
  const brandLine = lines.find((l) => /^(brand|marca|marke|marka)\s*[:-]/i.test(l.text));
  if (brandLine) {
    const value = brandLine.text.replace(/^(brand|marca|marke|marka)\s*[:-]\s*/i, '').trim();
    if (value !== '') brand = foundField(value, [brandLine], [], true);
  }

  /* claims — read ONLY from lines that are not allergen/may-contain statements
   * ("may contain: gluten" is NOT a gluten-free claim). Found → true; not found →
   * null ('absent'), NEVER false: a missing claim is unknown, not a negative. */
  const claimFields = {
    claimVegan: emptyField<boolean>(),
    claimVegetarian: emptyField<boolean>(),
    claimGlutenFree: emptyField<boolean>(),
    claimLactoseFree: emptyField<boolean>(),
  };
  const claimSafeLines = lines.filter(
    (l) => l.text !== '' && !MAY_CONTAIN_HEADING.test(l.text) && !ALLERGENS_HEADING.test(l.text),
  );
  for (const { key, pattern } of CLAIM_PATTERNS) {
    const claimLine = claimSafeLines.find((l) => pattern.test(l.text));
    if (claimLine) claimFields[key] = foundField(true, [claimLine]);
  }

  /* sodium listed but salt missing — warn, never convert (sodium IS recorded as
   * its own field above; the conversion to salt stays a human decision) */
  if (nutrientFields.salt.value === null && /\bsodium\b|\bsodio\b|\bnatrium\b|\bs[óo]d\b/i.test(fullText)) {
    globalWarnings.push('sodium is listed but salt was not found — NOT converted (enter salt manually)');
  }

  return {
    productName,
    brand,
    eanCode,
    eanCandidates,
    netQuantity,
    packageSize,
    packageUnit,
    basis,
    basisDetail,
    energyKj,
    energyKcal,
    fat: nutrientFields.fat,
    saturatedFat: nutrientFields.saturatedFat,
    carbohydrates: nutrientFields.carbohydrates,
    sugars: nutrientFields.sugars,
    protein: nutrientFields.protein,
    salt: nutrientFields.salt,
    sodium: nutrientFields.sodium,
    fibre: nutrientFields.fibre,
    nutrientCandidates,
    ingredientsText,
    allergens,
    mayContain,
    storageInstructions,
    ...claimFields,
    languageHint: detectLanguage(fullText),
    warnings: globalWarnings,
  };
}
