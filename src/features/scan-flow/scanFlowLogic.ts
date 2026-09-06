/**
 * Pure rules of the shared scan flow (no React, no network):
 *   - a typed code becomes the same `ConfirmedScan` contract a camera read produces (provenance kept);
 *   - a resolved exact product becomes the shape the recipe picker already consumes;
 *   - the authority's list of missing critical facts becomes the MINIMAL set of plain customer fields
 *     (name, brand, ingredients, allergens, nutrition per 100 g/ml, declared contents) — never a
 *     technical parameter — and the customer's answers become the finalize confirmations.
 */
import type { ConfirmedScan } from '@/scan-contract/confirmedScan';
import type { ExactCandidate, ExactWebIdentity, FinalizeInput } from '@/scan-import-v2';
import type { ScanExactProduct } from '@/services/productScanner';

export type ResolvedScanProductLike = ScanExactProduct & { barcode: string | null };

export function manualConfirmedScan(input: string, now = Date.now()): ConfirmedScan | null {
  const digits = input.replace(/\D/g, '');
  const symbology =
    digits.length === 13
      ? 'EAN-13'
      : digits.length === 12
        ? 'UPC-A'
        : digits.length === 8
          ? 'EAN-8'
          : null;
  if (!symbology) return null;
  return {
    symbology,
    value: digits,
    rawValue: input.trim(),
    // a code typed by the customer is a confirmed value, not a single unverified read: the identity
    // contract requires two agreeing reads, and the QA harness records a typed code the same way
    confirmation: { lane: 'consensus', agreeingFrames: 2, sources: ['manual'] },
    evidence: { moduleNative: null, fill: null, mixedFormats: false },
    timing: { firstSeenAt: now, completedAt: now },
    provenance: { trackId: 'manual', harnessBuild: null },
  };
}

function statusOf(product: ExactCandidate): ScanExactProduct['status'] {
  if (product.entityKind === 'pi_base') return 'pi_base';
  const s = product.evidence?.['status'];
  if (s === 'verified' || s === 'blocked' || s === 'manual_unverified') return s;
  return 'manual_unverified';
}

export function toResolvedScanProduct(
  product: ExactCandidate,
  engineReady: boolean,
  barcode: string | null,
): ResolvedScanProductLike {
  return {
    id: product.productId,
    productCode: product.productCode,
    displayName: product.displayName,
    brand: product.brand,
    entityKind: product.entityKind === 'pi_base' ? 'pi_base' : 'commercial_product',
    status: statusOf(product),
    engineReady,
    barcode,
  };
}

export interface PlainField {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'number' | 'select' | 'checkbox';
  required: boolean;
  unit?: string;
  options?: readonly { value: string; label: string }[];
}

const NUTRITION: Record<string, { key: string; label: string }> = {
  energykcal: { key: 'energyKcal', label: 'Energia' },
  energykj: { key: 'energyKj', label: 'Energia (kJ)' },
  fat: { key: 'fat', label: 'Tłuszcz' },
  saturatedfat: { key: 'saturatedFat', label: 'w tym kwasy nasycone' },
  carbohydrate: { key: 'carbohydrate', label: 'Węglowodany' },
  sugars: { key: 'sugars', label: 'w tym cukry' },
  protein: { key: 'protein', label: 'Białko' },
  salt: { key: 'salt', label: 'Sól' },
  fibre: { key: 'fibre', label: 'Błonnik' },
};

const DECLARATIONS: readonly { test: RegExp; key: string; label: string }[] = [
  { test: /alcohol|abv/i, key: 'alcoholAbv', label: 'Zawartość alkoholu' },
  { test: /cocoa_?butter/i, key: 'cocoaButterPercent', label: 'Masło kakaowe' },
  { test: /cocoa/i, key: 'cocoaSolidsPercent', label: 'Zawartość kakao' },
  { test: /fruit/i, key: 'fruitContentPercent', label: 'Zawartość owoców' },
  { test: /brix/i, key: 'brix', label: 'Brix' },
];

/**
 * Only what the authority still misses, expressed as plain label fields. Codes it does not know how
 * to ask the customer for are dropped (the "request verification" path stays available for those).
 */
export function plainFieldsFor(
  missingCritical: readonly string[],
  options: { needIdentity?: boolean } = {},
): PlainField[] {
  const out = new Map<string, PlainField>();
  const add = (f: PlainField) => {
    if (!out.has(f.key)) out.set(f.key, f);
  };
  const codes = missingCritical.map((c) => c.toLowerCase());
  if (options.needIdentity || codes.some((c) => /product_identity|display_?name|identity/.test(c)))
    add({ key: 'displayName', label: 'Nazwa produktu (z etykiety)', kind: 'text', required: true });
  if (options.needIdentity || codes.some((c) => /brand/.test(c))) {
    add({ key: 'brand', label: 'Marka', kind: 'text', required: false });
    add({ key: 'unbranded', label: 'Produkt bez marki', kind: 'checkbox', required: false });
  }
  if (codes.some((c) => /ingredients/.test(c)))
    add({ key: 'ingredientsText', label: 'Skład (z etykiety)', kind: 'textarea', required: true });
  // OWNER RULING 2026-09-06: the allergen line is never demanded. It is offered when something asks
  // for it, and an empty answer is UNKNOWN — never "no allergens", and never a reason to stop.
  if (codes.some((c) => /allergen/.test(c)))
    add({
      key: 'allergensText',
      label: 'Alergeny z etykiety (możesz pominąć)',
      kind: 'text',
      required: false,
    });
  const nutritionCodes = codes.filter((c) => /^nutrition[._-]/.test(c));
  if (nutritionCodes.length > 0) {
    add({
      key: 'basis',
      label: 'Wartości podane na',
      kind: 'select',
      required: true,
      options: [
        { value: 'per_100g', label: '100 g' },
        { value: 'per_100ml', label: '100 ml' },
      ],
    });
    for (const code of nutritionCodes) {
      const name = code.replace(/^nutrition[._-]/, '').replace(/[._-]/g, '');
      if (name === 'basis') continue;
      const n = NUTRITION[name];
      if (n)
        add({
          key: n.key,
          label: n.label,
          kind: 'number',
          required: true,
          unit: n.key === 'energyKcal' ? 'kcal' : n.key === 'energyKj' ? 'kJ' : 'g',
        });
    }
  }
  for (const code of codes) {
    if (/^nutrition[._-]/.test(code)) continue;
    const d = DECLARATIONS.find((x) => x.test.test(code));
    if (d) add({ key: d.key, label: d.label, kind: 'number', required: true, unit: '%' });
  }
  return [...out.values()];
}

function num(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** The customer's answers → finalize confirmations (only the keys that were actually answered). */
export function confirmationsFromFields(
  values: Record<string, string | boolean | undefined>,
): NonNullable<FinalizeInput['confirmations']> {
  const productFields: Record<string, unknown> = {};
  const identity: Record<string, unknown> = {};
  const name = typeof values['displayName'] === 'string' ? values['displayName'].trim() : '';
  if (name) identity['displayName'] = name;
  if (values['unbranded'] === true) {
    identity['explicitlyUnbranded'] = true;
  } else if (typeof values['brand'] === 'string' && values['brand'].trim()) {
    identity['brand'] = values['brand'].trim();
  }
  if (Object.keys(identity).length > 0) productFields['identity'] = identity;
  for (const key of ['ingredientsText', 'allergensText']) {
    const v = values[key];
    if (typeof v === 'string' && v.trim()) productFields[key] = v.trim();
  }
  const nutrition: Record<string, unknown> = {};
  for (const { key } of Object.values(NUTRITION)) {
    const n = num(values[key]);
    if (n !== null) nutrition[key] = n;
  }
  if (Object.keys(nutrition).length > 0) {
    nutrition['basis'] = values['basis'] === 'per_100ml' ? 'per_100ml' : 'per_100g';
    productFields['nutrition'] = nutrition;
  }
  const declarations: Record<string, unknown> = {};
  for (const { key } of DECLARATIONS) {
    const n = num(values[key]);
    if (n !== null) declarations[key] = n;
  }
  if (Object.keys(declarations).length > 0) productFields['productionDeclarations'] = declarations;
  return { productFields };
}

/* ---------------------------------------------------------------------------------------------- */
/* Scanner feedback: what the customer reads while the engine works                                */
/* ---------------------------------------------------------------------------------------------- */

export type ScanState = 'SEARCHING' | 'FOUND' | 'READING' | 'HOLD' | 'COMPLETE' | 'LOST';
export type ScanGuidance =
  | 'none'
  | 'hold_steady'
  | 'move_closer'
  | 'move_away'
  | 'aim_in_frame'
  | 'improve_light'
  | 'camera_inadequate';
export type PositionHint = 'left' | 'right' | 'up' | 'down' | null;

const STATE_TEXT: Record<ScanState, string> = {
  SEARCHING: 'Szukam kodu…',
  FOUND: 'Widzę kod',
  READING: 'Odczytuję kod…',
  HOLD: 'Trzymaj nieruchomo…',
  COMPLETE: 'Odczytano',
  LOST: 'Zgubiłem kod — pokaż go ponownie',
};
/*
  SOL-045. Every hint used to be phrased as an instruction to move the CAMERA — „Przesuń telefon w
  lewo", „Unieś telefon wyżej". On a phone that is right: the hand holding the camera is the hand
  that moves. On a computer the camera is bolted to the lid and the customer moves the PRODUCT, so
  the very same sentence reads backwards — which is the „góra jak dół" half of what the owner
  reported. Nothing in the image is inverted vertically; the instruction was.

  So there are two voices for one set of hints, chosen by form factor. The DIRECTION is identical in
  both: only the noun and the verb change.
*/
const GUIDANCE_TEXT: Record<Exclude<ScanGuidance, 'none'>, string> = {
  hold_steady: 'Trzymaj telefon nieruchomo',
  move_closer: 'Przybliż telefon do kodu',
  move_away: 'Odsuń telefon od kodu',
  aim_in_frame: 'Ustaw kod w ramce',
  improve_light: 'Potrzeba więcej światła',
  camera_inadequate: 'Ten aparat nie odczyta tego kodu — wpisz kod ręcznie',
};
const GUIDANCE_TEXT_FIXED_CAMERA: Record<Exclude<ScanGuidance, 'none'>, string> = {
  hold_steady: 'Trzymaj produkt nieruchomo',
  move_closer: 'Przysuń produkt bliżej kamery',
  move_away: 'Odsuń produkt od kamery',
  aim_in_frame: 'Ustaw kod w ramce',
  improve_light: 'Potrzeba więcej światła',
  camera_inadequate: 'Ta kamera nie odczyta tego kodu — wpisz kod ręcznie',
};
const POSITION_TEXT: Record<NonNullable<PositionHint>, string> = {
  left: 'Przesuń telefon w lewo',
  right: 'Przesuń telefon w prawo',
  up: 'Unieś telefon wyżej',
  down: 'Opuść telefon niżej',
};
const POSITION_TEXT_FIXED_CAMERA: Record<NonNullable<PositionHint>, string> = {
  left: 'Przesuń produkt w lewo',
  right: 'Przesuń produkt w prawo',
  up: 'Przesuń produkt wyżej',
  down: 'Przesuń produkt niżej',
};

/** where the code sits in the frame → which way to move the phone to centre it */
export function positionHint(
  roi: { x: number; y: number; w: number; h: number } | null,
  sourceW: number,
  sourceH: number,
): PositionHint {
  if (!roi || sourceW <= 0 || sourceH <= 0) return null;
  const cx = (roi.x + roi.w / 2) / sourceW;
  const cy = (roi.y + roi.h / 2) / sourceH;
  if (cx < 0.28) return 'left';
  if (cx > 0.72) return 'right';
  if (cy < 0.28) return 'up';
  if (cy > 0.72) return 'down';
  return null;
}

/** one line for the customer: guidance outranks position, position outranks the bare state */
export function scanFeedbackText(frame: {
  state: ScanState;
  guidance: ScanGuidance;
  timedOut: boolean;
  position: PositionHint;
  /** true when the camera cannot move — a laptop or desktop webcam, where the PRODUCT moves */
  fixedCamera?: boolean;
}): string {
  const guidanceText = frame.fixedCamera ? GUIDANCE_TEXT_FIXED_CAMERA : GUIDANCE_TEXT;
  const positionText = frame.fixedCamera ? POSITION_TEXT_FIXED_CAMERA : POSITION_TEXT;
  if (frame.state === 'COMPLETE') return STATE_TEXT.COMPLETE;
  if (frame.timedOut) return 'Nie udało się potwierdzić kodu — spróbuj bliżej albo pod innym kątem';
  if (frame.guidance !== 'none' && frame.guidance !== 'hold_steady')
    return guidanceText[frame.guidance];
  if (frame.position && frame.state !== 'HOLD') return positionText[frame.position];
  if (frame.guidance === 'hold_steady') return guidanceText.hold_steady;
  // SOL-045: with no candidate at all the customer gets a neutral instruction, not a bare state
  if (frame.fixedCamera && frame.state === 'SEARCHING') return 'Umieść kod w ramce';
  return STATE_TEXT[frame.state];
}

/** the registry's facts as the prefilled answers of the plain fields */
export function prefillFromIdentity(web: ExactWebIdentity): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = { displayName: web.displayName };
  if (web.brand) out['brand'] = web.brand;
  const pf = web.productFields;
  const nutrition = (pf['nutrition'] ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(nutrition)) {
    if (k === 'basis') out['basis'] = String(v);
    else if (typeof v === 'number') out[k] = String(v);
  }
  if (typeof pf['ingredientsText'] === 'string') out['ingredientsText'] = pf['ingredientsText'];
  if (typeof pf['allergensText'] === 'string') out['allergensText'] = pf['allergensText'];
  return out;
}

/**
 * OWNER DECISION 2026-09-06 — ONE CANONICAL SCANNER IN THE WHOLE SYSTEM.
 *
 * There is no separate HOME, PRO, ingredient or product scanner: every entry mounts THIS component
 * and runs THIS pipeline — the same camera, the same EAN recognition, the same sources, the same
 * completion from similar products, the same readiness rules, the same messages, the same save.
 * Only two things differ,
 * and they are the whole of this contract: WHERE the customer came from, and WHERE they go back to.
 *
 *  - `add_product`     the hamburger's "Dodaj produkt". The customer already said they want to add
 *                      one, so an unknown code is never answered with "do you want to add it?" —
 *                      the full recognition and Rescue simply run.
 *  - `recipe_*`        a recipe's "Dodaj składnik" / "Dodaj topping". An unknown code asks exactly
 *                      one question, and "Nie" returns to the place the customer was adding from.
 *                      "Tak" continues with the SAME scan and the SAME photos — the camera is never
 *                      restarted, because it is the same scan.
 *  - `guest_demo`      nobody is signed in. A guest may FIND an existing product; they may not
 *                      create one, so no OCR, no enrichment, no Rescue, no private save and no
 *                      verification is started for them — an unknown code is where HOME and PRO are
 *                      worth paying for.
 */
export type ScanEntryContext =
  | 'add_product'
  | 'recipe_ingredient'
  | 'recipe_topping'
  | 'guest_demo';

/** an entry that came from a recipe: the one place the add question belongs */
export function isRecipeEntry(entry: ScanEntryContext): boolean {
  return entry === 'recipe_ingredient' || entry === 'recipe_topping';
}

/** the entry a call site means when it only says `mode` */
export function entryContextOf(
  mode: 'recipe' | 'catalog',
  entryContext: ScanEntryContext | undefined,
): ScanEntryContext {
  return entryContext ?? (mode === 'catalog' ? 'add_product' : 'recipe_ingredient');
}

/**
 * The one thing a guest's scan is allowed to leave behind: the code they read.
 *
 * Not their photos, not evidence, not a product — only the digits, in sessionStorage, so that
 * choosing HOME or PRO does not cost them a second scan. It is cleared the moment it is used, and
 * every access is guarded: a browser that refuses storage simply loses the convenience.
 */
const GUEST_CODE_KEY = 'gellatti.scan.guestCode';

export function rememberGuestCode(code: string): void {
  try {
    sessionStorage.setItem(GUEST_CODE_KEY, code);
  } catch {
    /* storage refused: the customer scans again, nothing else changes */
  }
}

export function takeGuestCode(): string | null {
  try {
    const code = sessionStorage.getItem(GUEST_CODE_KEY);
    if (code) sessionStorage.removeItem(GUEST_CODE_KEY);
    return code && /^\d{8,14}$/.test(code) ? code : null;
  } catch {
    return null;
  }
}
