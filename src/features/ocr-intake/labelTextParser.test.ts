/// <reference types="node" />
/**
 * Deterministic parser tests — run on (a) REAL captured tesseract.js raw text from the
 * committed fixture images (__fixtures__/raw/*.txt, produced by capture-raw-text.mjs)
 * and (b) handcrafted OCR-noise edge cases. NO OCR engine here — parser only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES_DIR } from './__fixtures__/nodeOcrAssets';
import {
  linesFromText,
  normalizeEanCode,
  normalizeNumberToken,
  parseLabelText,
  parsePackageSize,
  type ParsedOcrLine,
} from './labelTextParser';

const rawFixture = (name: string): string => readFileSync(join(FIXTURES_DIR, 'raw', name), 'utf8');
const parseRaw = (name: string) => parseLabelText(linesFromText(rawFixture(name)));

describe('normalizeNumberToken', () => {
  it('handles decimal comma, decimal point, and OCR digit-spacing', () => {
    expect(normalizeNumberToken('15.3').value).toBe(15.3);
    expect(normalizeNumberToken('15,3').value).toBe(15.3);
    expect(normalizeNumberToken('1 5,3').value).toBe(15.3); // OCR split digits
    expect(normalizeNumberToken('1544').value).toBe(1544);
  });

  it('refuses ambiguous numbers honestly (null + warning, never a guess)', () => {
    const mixed = normalizeNumberToken('1,234.5');
    expect(mixed.value).toBeNull();
    expect(mixed.warning).toMatch(/ambiguous/);
    const grouping = normalizeNumberToken('1,234,5');
    expect(grouping.value).toBeNull();
  });
});

describe('parseLabelText — captured raw OCR text (clear English label)', () => {
  const x = parseRaw('label_clear_en.txt');

  it('reads identity, EAN, net quantity and language', () => {
    expect(x.productName.value).toBe('Vanilla Dessert Base');
    expect(x.productName.needsReview).toBe(true); // identity is always confirmed by a human
    expect(x.brand.value).toBe('Polar Foods');
    expect(x.eanCode.value).toBe('8480000610928'); // digits from "8 480000 610928"
    expect(x.netQuantity.value).toBe('500 g');
    expect(x.languageHint).toBe('en');
    expect(x.basis).toBe('per_100g');
  });

  it('reads the per-100g nutrition rows (decimal points)', () => {
    expect(x.energyKj.value).toBe(1544);
    expect(x.energyKcal.value).toBe(368);
    expect(x.saturatedFat.value).toBe(9.8);
    expect(x.carbohydrates.value).toBe(52.1);
    expect(x.sugars.value).toBe(48.2);
    expect(x.protein.value).toBe(4.5);
    expect(x.salt.value).toBe(0.28);
  });

  it('leaves the OCR-mangled fat row EMPTY and flagged (real capture read "15.39", unit lost)', () => {
    expect(x.fat.value).toBeNull();
    expect(x.fat.needsReview).toBe(true);
    expect(x.fat.warnings.join(' ')).toMatch(/no readable value/);
  });

  it('reads ingredients (wrapped), allergens, may-contain and storage', () => {
    expect(x.ingredientsText.value).toMatch(/^sugar, skimmed milk powder/);
    expect(x.ingredientsText.value).toMatch(/vanilla flavouring/); // joined wrapped line
    expect(x.allergens.value).toMatch(/milk, soy/);
    expect(x.mayContain.value).toMatch(/hazelnuts/);
    expect(x.storageInstructions.value).toMatch(/cool, dry place/i);
  });
});

describe('parseLabelText — captured raw OCR text (Spanish label, decimal commas, per 100 ml)', () => {
  const x = parseRaw('label_decimal_comma_es.txt');

  it('reads Spanish vocabulary with decimal commas on a per-100ml basis', () => {
    expect(x.basis).toBe('per_100ml');
    expect(x.languageHint).toBe('es');
    expect(x.productName.value).toBe('Horchata Tradicional');
    expect(x.brand.value).toBe('Valenciana Real');
    expect(x.energyKj.value).toBe(254);
    expect(x.energyKcal.value).toBe(60);
    expect(x.saturatedFat.value).toBe(0.2);
    expect(x.carbohydrates.value).toBe(11.4);
    expect(x.sugars.value).toBe(10.1);
    expect(x.protein.value).toBe(0.5);
    expect(x.salt.value).toBe(0.03);
  });

  it('flags rows the OCR mangled instead of guessing (grasas "1,19" lost its unit)', () => {
    expect(x.fat.value).toBeNull();
    expect(x.fat.needsReview).toBe(true);
  });

  it('reads ingredientes / puede contener / conservar', () => {
    expect(x.ingredientsText.value).toMatch(/agua, chufa/);
    expect(x.mayContain.value).toMatch(/frutos de cascara/);
    expect(x.storageInstructions.value).toMatch(/Conservar refrigerado/);
  });
});

describe('parseLabelText — captured raw OCR text (multiline ingredients label)', () => {
  const x = parseRaw('label_multiline_ingredients_en.txt');

  it('joins the wrapped ingredients list and reads allergen sections', () => {
    expect(x.ingredientsText.value).toMatch(/^cocoa mass, sugar, cocoa butter/);
    expect(x.ingredientsText.value).toMatch(/hazelnut paste \(2%\)/); // 3 wrapped lines joined
    expect(x.allergens.value).toMatch(/milk, soy, hazelnuts/);
    expect(x.mayContain.value).toMatch(/other tree nuts, gluten/);
  });

  it('recovers glued OCR unit rows ("Fat34.9¢g", "Salt0.11g" — real capture output)', () => {
    expect(x.fat.value).toBe(34.9);
    expect(x.salt.value).toBe(0.11);
    expect(x.saturatedFat.value).toBe(21.2);
    expect(x.sugars.value).toBe(47.4);
  });
});

describe('parseLabelText — captured raw OCR text (readable but NOT a nutrition label)', () => {
  const x = parseRaw('label_partial_en.txt');

  it('stays honestly incomplete: name found, all nutrition empty + flagged basis', () => {
    expect(x.productName.value).toBe('Alpine Herbal Drops');
    expect(x.basis).toBe('unknown');
    expect(x.warnings.join(' ')).toMatch(/no per-100/);
    for (const f of [x.energyKj, x.energyKcal, x.fat, x.saturatedFat, x.carbohydrates, x.sugars, x.protein, x.salt]) {
      expect(f.value).toBeNull();
    }
    expect(x.ingredientsText.value).toBeNull();
    // the batch number is barcode-shaped — surfaced but ALWAYS flagged for human review
    expect(x.eanCode.value).toBe('20260712');
    expect(x.eanCode.needsReview).toBe(true);
  });
});

describe('parseLabelText — handcrafted OCR-noise edge cases', () => {
  it('OCR digit-spacing inside a value: "Fat 1 5,3 g" → 15.3', () => {
    const x = parseLabelText(linesFromText('per 100 g\nFat 1 5,3 g'));
    expect(x.fat.value).toBe(15.3);
  });

  it('"<0.1" stays EMPTY with a below-quantification flag (never invented)', () => {
    const x = parseLabelText(linesFromText('per 100 g\nSalt <0.1 g'));
    expect(x.salt.value).toBeNull();
    expect(x.salt.needsReview).toBe(true);
    expect(x.salt.warnings.join(' ')).toMatch(/below quantification/);
  });

  it('mg values convert deterministically to g (280 mg → 0.28 g)', () => {
    const x = parseLabelText(linesFromText('per 100 g\nSalt 280 mg'));
    expect(x.salt.value).toBe(0.28);
  });

  it('duplicated nutrition blocks: the per-100 value wins over per-serving', () => {
    const x = parseLabelText(
      linesFromText('Nutrition per serving\nFat 6.9 g\nSugars 12 g\nper 100 g\nFat 15.3 g\nSugars 26.7 g'),
    );
    expect(x.fat.value).toBe(15.3);
    expect(x.sugars.value).toBe(26.7);
    expect(x.fat.warnings.join(' ')).toMatch(/duplicated nutrition rows/);
  });

  it('serving-only labels never fill per-100 values (flagged instead)', () => {
    const x = parseLabelText(linesFromText('Nutrition per serving (30 g)\nFat 4.2 g\nSalt 0.1 g'));
    expect(x.basis).toBe('serving_only');
    expect(x.fat.value).toBeNull();
    expect(x.fat.needsReview).toBe(true);
    expect(x.warnings.join(' ')).toMatch(/per serving only/);
  });

  it('multiple values on one row are taken first + flagged (possible serving column)', () => {
    const x = parseLabelText(linesFromText('per 100 g\nFat 15.3 g 6.9 g'));
    expect(x.fat.value).toBe(15.3);
    expect(x.fat.needsReview).toBe(true);
    expect(x.fat.warnings.join(' ')).toMatch(/multiple values/);
  });

  it('out-of-range values are refused (never a fake per-100 number)', () => {
    const x = parseLabelText(linesFromText('per 100 g\nFat 153 g'));
    expect(x.fat.value).toBeNull();
    expect(x.fat.warnings.join(' ')).toMatch(/out of range/);
  });

  it('sodium is never converted to salt (warned instead)', () => {
    const x = parseLabelText(linesFromText('per 100 g\nSodium 0.11 g'));
    expect(x.salt.value).toBeNull();
    expect(x.warnings.join(' ')).toMatch(/NOT converted/);
  });

  it('empty / junk input parses to an all-null extraction without crashing', () => {
    const x = parseLabelText(linesFromText(''));
    expect(x.productName.value).toBeNull();
    expect(x.fat.value).toBeNull();
    expect(x.basis).toBe('unknown');
  });

  it('aggregates per-field OCR confidence into bands and flags low confidence', () => {
    const high: ParsedOcrLine[] = [
      { text: 'per 100 g', confidence: 95 },
      { text: 'Fat 15.3 g', confidence: 92 },
      { text: 'Salt 0.2 g', confidence: 41 },
    ];
    const x = parseLabelText(high);
    expect(x.fat.ocrConfidence).toBe(92);
    expect(x.fat.band).toBe('high');
    expect(x.fat.needsReview).toBe(false);
    expect(x.salt.band).toBe('low');
    expect(x.salt.needsReview).toBe(true); // low OCR confidence always needs a human
  });
});

describe('labelTextParser — purity (static scan)', () => {
  it('no OCR engine, no network, no DB, no services — parser only', () => {
    const src = readFileSync(join(FIXTURES_DIR, '..', 'labelTextParser.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(/createWorker|vision\.googleapis|openai/i.test(src)).toBe(false);
    expect(/from\s+['"]tesseract/i.test(src)).toBe(false);
    expect(/fetch\(|supabase|@\/services\//i.test(src)).toBe(false);
    expect(/pac_value|pod_value|npac/i.test(src)).toBe(false);
  });
});

/* ═══ §8 extensions: EAN checksum, package size, DE/PL/IT vocabulary, four-way
 * value outcomes, sodium rule, contradictory tables — all pure parser tests ═══ */

describe('normalizeEanCode — EAN-8/EAN-13 checksum validation', () => {
  it('accepts a checksum-valid EAN-13 and strips spaces/hyphens', () => {
    expect(normalizeEanCode('8480000610928').normalized).toBe('8480000610928');
    expect(normalizeEanCode('8 480000 610928').normalized).toBe('8480000610928');
    expect(normalizeEanCode('4-012345-678901').normalized).toBe('4012345678901');
  });

  it('rejects an EAN-13 with a wrong check digit — raw digits KEPT, normalized null', () => {
    const bad = normalizeEanCode('8480000610927'); // last digit off by one
    expect(bad.normalized).toBeNull();
    expect(bad.digits).toBe('8480000610927');
    expect(bad.warning).toMatch(/checksum/);
  });

  it('accepts a checksum-valid EAN-8', () => {
    expect(normalizeEanCode('20260712').normalized).toBe('20260712');
    expect(normalizeEanCode('9638 5074').normalized).toBe('96385074');
  });

  it('rejects an EAN-8 with a wrong check digit', () => {
    const bad = normalizeEanCode('20260713');
    expect(bad.normalized).toBeNull();
    expect(bad.warning).toMatch(/EAN-8 checksum/);
  });

  it('other digit lengths are kept raw but never "validated"', () => {
    const upc = normalizeEanCode('123456789012'); // 12 digits (UPC-A shape)
    expect(upc.normalized).toBeNull();
    expect(upc.warning).toMatch(/not EAN-8\/EAN-13/);
  });

  it('non-digit input is refused honestly', () => {
    expect(normalizeEanCode('84800LO610928').normalized).toBeNull();
    expect(normalizeEanCode('84800LO610928').warning).toMatch(/not a digit sequence/);
  });
});

describe('parsePackageSize — sizes, units, multipacks', () => {
  it('parses plain metric sizes with all four units', () => {
    expect(parsePackageSize('Net weight: 500 g')).toMatchObject({ size: 500, unit: 'g', multipack: null });
    expect(parsePackageSize('1 l')).toMatchObject({ size: 1, unit: 'l' });
    expect(parsePackageSize('2 kg')).toMatchObject({ size: 2, unit: 'kg' });
    expect(parsePackageSize('250 ml ℮')).toMatchObject({ size: 250, unit: 'ml' });
  });

  it('normalizes decimal comma and uppercase units ("0,5 L" → 0.5 l)', () => {
    expect(parsePackageSize('0,5 L')).toMatchObject({ size: 0.5, unit: 'l', printed: '0.5 l' });
  });

  it('reads glued OCR quantities ("330ml")', () => {
    expect(parsePackageSize('330ml')).toMatchObject({ size: 330, unit: 'ml' });
  });

  it('multipack "6 x 330 ml": per-unit size recorded WITH a warning (never silent)', () => {
    const p = parsePackageSize('6 x 330 ml');
    expect(p.size).toBe(330);
    expect(p.unit).toBe('ml');
    expect(p.multipack).toEqual({ count: 6, unitSize: 330 });
    expect(p.printed).toBe('6 x 330 ml');
    expect(p.warnings.join(' ')).toMatch(/multipack/);
    expect(p.warnings.join(' ')).toMatch(/1980 ml/); // the total is surfaced, not substituted
  });

  it('multipack variants: glued "6x330ml" and unicode "6 × 330 ml"', () => {
    expect(parsePackageSize('6x330ml').multipack).toEqual({ count: 6, unitSize: 330 });
    expect(parsePackageSize('6 × 330 ml').multipack).toEqual({ count: 6, unitSize: 330 });
  });

  it('no quantity → all null, no invented size', () => {
    expect(parsePackageSize('Alpine Herbal Drops')).toMatchObject({ size: null, unit: null, multipack: null });
  });
});

describe('parseLabelText — German vocabulary (handcrafted)', () => {
  const x = parseLabelText(
    linesFromText(
      [
        'Nährwerte pro 100 g',
        'Brennwert 2000 kJ / 478 kcal',
        'Fett 25,0 g',
        'davon gesättigte Fettsäuren 15,1 g',
        'Kohlenhydrate 50,2 g',
        'davon Zucker 44,7 g',
        'Ballaststoffe 3,2 g',
        'Eiweiß 6,1 g',
        'Salz 0,3 g',
        'Zutaten: Zucker, Kakaomasse, Sahnepulver.',
        'Kann Spuren von Mandeln enthalten.',
        'Kühl und trocken lagern.',
      ].join('\n'),
    ),
  );

  it('reads DE nutrition rows with comma decimals on a per-100g basis', () => {
    expect(x.basis).toBe('per_100g');
    expect(x.energyKj.value).toBe(2000);
    expect(x.energyKcal.value).toBe(478);
    expect(x.fat.value).toBe(25);
    expect(x.saturatedFat.value).toBe(15.1);
    expect(x.carbohydrates.value).toBe(50.2);
    expect(x.sugars.value).toBe(44.7);
    expect(x.fibre.value).toBe(3.2);
    expect(x.protein.value).toBe(6.1);
    expect(x.salt.value).toBe(0.3);
  });

  it('"Fettsäuren" never leaks into the plain Fett row', () => {
    expect(x.fat.warnings.join(' ')).not.toMatch(/contradictory|duplicated/);
  });

  it('reads Zutaten / Kann Spuren / lagern and detects German', () => {
    expect(x.ingredientsText.value).toMatch(/^Zucker, Kakaomasse/);
    expect(x.mayContain.value).toMatch(/Mandeln/);
    expect(x.storageInstructions.value).toMatch(/trocken lagern/);
    expect(x.languageHint).toBe('de');
  });

  it('OCR-folded umlauts still match (Nahrwerte/gesattigte Fettsauren)', () => {
    const folded = parseLabelText(linesFromText('Nahrwerte pro 100 g\ndavon gesattigte Fettsauren 9,9 g'));
    expect(folded.saturatedFat.value).toBe(9.9);
  });
});

describe('parseLabelText — Polish vocabulary (handcrafted)', () => {
  const x = parseLabelText(
    linesFromText(
      [
        'Wartość odżywcza w 100 g',
        'Wartość energetyczna 1500 kJ / 358 kcal',
        'Tłuszcz 12,5 g',
        'w tym kwasy tłuszczowe nasycone 4,2 g',
        'Węglowodany 55,0 g',
        'w tym cukry 30,1 g',
        'Błonnik 2,8 g',
        'Białko 8,3 g',
        'Sól 0,9 g',
        'Składniki: mąka pszenna, cukier, olej rzepakowy.',
        'Może zawierać sezam.',
        'Przechowywać w suchym miejscu.',
      ].join('\n'),
    ),
  );

  it('reads PL nutrition rows ("Tłuszcz … w tym kwasy tłuszczowe nasycone")', () => {
    expect(x.basis).toBe('per_100g');
    expect(x.energyKj.value).toBe(1500);
    expect(x.energyKcal.value).toBe(358);
    expect(x.fat.value).toBe(12.5);
    expect(x.saturatedFat.value).toBe(4.2);
    expect(x.carbohydrates.value).toBe(55);
    expect(x.sugars.value).toBe(30.1);
    expect(x.fibre.value).toBe(2.8);
    expect(x.protein.value).toBe(8.3);
    expect(x.salt.value).toBe(0.9);
  });

  it('reads Składniki / Może zawierać / Przechowywać and detects Polish', () => {
    expect(x.ingredientsText.value).toMatch(/^mąka pszenna/);
    expect(x.mayContain.value).toMatch(/sezam/);
    expect(x.storageInstructions.value).toMatch(/Przechowywać/);
    expect(x.languageHint).toBe('pl');
  });

  it('ASCII-folded Polish still matches (Skladniki, Bialko, Sol, Moze zawierac)', () => {
    const folded = parseLabelText(
      linesFromText('Wartosc odzywcza w 100 g\nBialko 5,5 g\nSol 0,4 g\nSkladniki: cukier.\nMoze zawierac orzechy.'),
    );
    expect(folded.protein.value).toBe(5.5);
    expect(folded.salt.value).toBe(0.4);
    expect(folded.ingredientsText.value).toMatch(/cukier/);
    expect(folded.mayContain.value).toMatch(/orzechy/);
  });

  it('serving wording "na porcję" maps to serving_only (never per-100)', () => {
    const s = parseLabelText(linesFromText('Wartość odżywcza na porcję (25 g)\nTłuszcz 3,1 g'));
    expect(s.basis).toBe('serving_only');
    expect(s.fat.value).toBeNull();
    expect(s.warnings.join(' ')).toMatch(/per serving only/);
  });
});

describe('parseLabelText — Italian vocabulary (handcrafted)', () => {
  const x = parseLabelText(
    linesFromText(
      [
        'Valori nutrizionali per 100 g',
        'Valore energetico 2100 kJ / 502 kcal',
        'Grassi 28,3 g',
        'di cui acidi grassi saturi 17,2 g',
        'Carboidrati 55,4 g',
        'di cui zuccheri 51,0 g',
        'Fibre 2,1 g',
        'Proteine 6,6 g',
        'Sale 0,12 g',
        'Ingredienti: zucchero, pasta di cacao, burro di cacao.',
        'Può contenere tracce di frutta a guscio.',
        'Conservare in luogo fresco e asciutto.',
      ].join('\n'),
    ),
  );

  it('reads IT nutrition rows ("Grassi di cui acidi grassi saturi")', () => {
    expect(x.basis).toBe('per_100g');
    expect(x.energyKj.value).toBe(2100);
    expect(x.energyKcal.value).toBe(502);
    expect(x.fat.value).toBe(28.3);
    expect(x.saturatedFat.value).toBe(17.2);
    expect(x.carbohydrates.value).toBe(55.4);
    expect(x.sugars.value).toBe(51);
    expect(x.fibre.value).toBe(2.1);
    expect(x.protein.value).toBe(6.6);
    expect(x.salt.value).toBe(0.12);
  });

  it('"acidi grassi saturi" never leaks into the plain Grassi row', () => {
    expect(x.fat.value).toBe(28.3);
    expect(x.fat.warnings.join(' ')).not.toMatch(/contradictory|duplicated|multiple/);
  });

  it('reads Ingredienti / Può contenere / Conservare and detects Italian', () => {
    expect(x.ingredientsText.value).toMatch(/^zucchero, pasta di cacao/);
    expect(x.mayContain.value).toMatch(/frutta a guscio/);
    expect(x.storageInstructions.value).toMatch(/Conservare/);
    expect(x.languageHint).toBe('it');
  });
});

describe('parseLabelText — the four DISTINCT value outcomes', () => {
  it('(1) a real value → detection "value" (explicit zero INCLUDED: 0 stays 0)', () => {
    const x = parseLabelText(linesFromText('per 100 g\nSalt 0 g\nFat 12.5 g'));
    expect(x.salt.value).toBe(0);
    expect(x.salt.detection).toBe('value');
    expect(x.fat.value).toBe(12.5);
    expect(x.fat.detection).toBe('value');
  });

  it('(2) "<0.1" → detection "trace": null + warning, NEVER zero', () => {
    const x = parseLabelText(linesFromText('per 100 g\nSalt <0.1 g'));
    expect(x.salt.value).toBeNull();
    expect(x.salt.detection).toBe('trace');
    expect(x.salt.warnings.join(' ')).toMatch(/below quantification/);
  });

  it('(2b) the word "traces"/"Spuren"/"trazas" as the value is the SAME trace outcome', () => {
    const en = parseLabelText(linesFromText('per 100 g\nSalt traces'));
    expect(en.salt.value).toBeNull();
    expect(en.salt.detection).toBe('trace');
    const de = parseLabelText(linesFromText('pro 100 g\nSalz Spuren'));
    expect(de.salt.detection).toBe('trace');
    const es = parseLabelText(linesFromText('por 100 g\nSal trazas'));
    expect(es.salt.detection).toBe('trace');
  });

  it('(3) row present but value unreadable → detection "row_no_value"', () => {
    const x = parseLabelText(linesFromText('per 100 g\nFat 15.39')); // unit glyph lost by OCR
    expect(x.fat.value).toBeNull();
    expect(x.fat.detection).toBe('row_no_value');
    expect(x.fat.sourceLines.length).toBeGreaterThan(0);
  });

  it('(4) blank / undetected → detection "absent": null, no warnings, no source', () => {
    const x = parseLabelText(linesFromText('per 100 g\nFat 12.5 g'));
    expect(x.salt.value).toBeNull();
    expect(x.salt.detection).toBe('absent');
    expect(x.salt.warnings).toEqual([]);
    expect(x.salt.sourceLines).toEqual([]);
  });
});

describe('parseLabelText — sodium is its own field, never converted to salt', () => {
  it('records sodium separately with the human-decision warning', () => {
    const x = parseLabelText(linesFromText('per 100 g\nSodium 0.11 g'));
    expect(x.sodium.value).toBe(0.11);
    expect(x.sodium.warnings.join(' ')).toMatch(/human decision/);
    expect(x.sodium.needsReview).toBe(true);
    expect(x.salt.value).toBeNull(); // NOT converted
    expect(x.warnings.join(' ')).toMatch(/NOT converted/);
  });

  it('DE Natrium and PL sód are recorded the same way', () => {
    const de = parseLabelText(linesFromText('pro 100 g\nNatrium 120 mg'));
    expect(de.sodium.value).toBe(0.12); // deterministic mg→g only
    expect(de.salt.value).toBeNull();
    const pl = parseLabelText(linesFromText('w 100 g\nSód 0,2 g'));
    expect(pl.sodium.value).toBe(0.2);
    expect(pl.salt.value).toBeNull();
  });

  it('sodium NEVER auto-fills salt even when both rows would round-trip (×2.5)', () => {
    const x = parseLabelText(linesFromText('per 100 g\nSodium 0.4 g'));
    expect(x.salt.value).toBeNull();
    expect(x.salt.detection).toBe('absent');
  });
});

describe('parseLabelText — contradictory / duplicated nutrition tables', () => {
  it('two DIFFERENT values at the same basis → conflict: nothing silently picked', () => {
    const x = parseLabelText(linesFromText('per 100 g\nFat 15.3 g\nSugars 20 g\nper 100 g\nFat 12.1 g\nSugars 20 g'));
    expect(x.fat.value).toBeNull();
    expect(x.fat.detection).toBe('conflict');
    expect(x.fat.needsReview).toBe(true);
    expect(x.fat.warnings.join(' ')).toMatch(/contradictory values/);
    expect(x.fat.sourceLines).toHaveLength(2); // both readings exposed
  });

  it('conflicting readings stay visible as MULTIPLE candidates', () => {
    const x = parseLabelText(linesFromText('per 100 g\nFat 15.3 g\nper 100 g\nFat 12.1 g'));
    const values = x.nutrientCandidates.fat.filter((c) => c.kind === 'value').map((c) => c.value);
    expect(values).toEqual([15.3, 12.1]);
  });

  it('duplicated tables with the SAME value are kept once (no false conflict)', () => {
    const x = parseLabelText(linesFromText('per 100 g\nFat 15.3 g\nper 100 g\nFat 15.3 g'));
    expect(x.fat.value).toBe(15.3);
    expect(x.fat.detection).toBe('value');
    expect(x.fat.warnings.join(' ')).toMatch(/SAME value/);
  });
});

describe('parseLabelText — package size + multipack wiring', () => {
  it('single quantity fills packageSize/packageUnit alongside netQuantity', () => {
    const x = parseLabelText(linesFromText('Vanilla Base\nNet weight: 500 g'));
    expect(x.netQuantity.value).toBe('500 g');
    expect(x.packageSize.value).toBe(500);
    expect(x.packageUnit.value).toBe('g');
    expect(x.packageSize.needsReview).toBe(false);
  });

  it('multipack line is found, per-unit size recorded, review forced', () => {
    const x = parseLabelText(linesFromText('Apple Juice Pack\n6 x 330 ml'));
    expect(x.netQuantity.value).toBe('6 x 330 ml');
    expect(x.packageSize.value).toBe(330);
    expect(x.packageUnit.value).toBe('ml');
    expect(x.packageSize.needsReview).toBe(true);
    expect(x.packageSize.warnings.join(' ')).toMatch(/multipack/);
  });
});

describe('parseLabelText — claims (5 languages, never invented, never false)', () => {
  it('reads printed claims as true with the source line', () => {
    const x = parseLabelText(linesFromText('Choco Bar\nVegan. Gluten-free.\nper 100 g\nFat 10 g'));
    expect(x.claimVegan.value).toBe(true);
    expect(x.claimGlutenFree.value).toBe(true);
    expect(x.claimVegan.sourceLines[0]).toMatch(/Vegan/);
  });

  it('absent claims stay null — NEVER false', () => {
    const x = parseLabelText(linesFromText('Choco Bar\nper 100 g\nFat 10 g'));
    expect(x.claimVegan.value).toBeNull();
    expect(x.claimVegan.detection).toBe('absent');
    expect(x.claimVegetarian.value).toBeNull();
  });

  it('"May contain: gluten" is NOT a gluten-free claim', () => {
    const x = parseLabelText(linesFromText('Choco Bar\nMay contain: gluten.\nper 100 g'));
    expect(x.claimGlutenFree.value).toBeNull();
  });

  it('DE/PL/IT/ES claim vocabulary', () => {
    expect(parseLabelText(linesFromText('Riegel\nVegetarisch und laktosefrei')).claimVegetarian.value).toBe(true);
    expect(parseLabelText(linesFromText('Riegel\nVegetarisch und laktosefrei')).claimLactoseFree.value).toBe(true);
    expect(parseLabelText(linesFromText('Sok\nProdukt bezglutenowy')).claimGlutenFree.value).toBe(true);
    expect(parseLabelText(linesFromText('Barretta\nsenza glutine e senza lattosio')).claimGlutenFree.value).toBe(true);
    expect(parseLabelText(linesFromText('Barretta\nsenza glutine e senza lattosio')).claimLactoseFree.value).toBe(true);
    expect(parseLabelText(linesFromText('Barra\nproducto vegano sin lactosa')).claimVegan.value).toBe(true);
  });
});

describe('parseLabelText — EAN candidates + checksum in context', () => {
  it('an invalid-checksum EAN keeps the raw digits but never a normalized value', () => {
    const x = parseLabelText(linesFromText('Some Bar\n8 480000 610927')); // bad check digit
    expect(x.eanCode.value).toBeNull();
    expect(x.eanCode.needsReview).toBe(true);
    expect(x.eanCode.warnings.join(' ')).toMatch(/checksum/);
    expect(x.eanCandidates).toHaveLength(1);
    expect(x.eanCandidates[0]?.raw).toBe('8480000610927');
    expect(x.eanCandidates[0]?.normalized).toBeNull();
  });

  it('with several digit runs the checksum-valid EAN wins, all stay candidates', () => {
    const x = parseLabelText(linesFromText('Some Bar\nBatch 12345678\n8 480000 610928'));
    // 12345678 fails the EAN-8 checksum; the valid EAN-13 is preferred
    expect(x.eanCode.value).toBe('8480000610928');
    expect(x.eanCode.warnings.join(' ')).toMatch(/multiple barcode-shaped/);
    expect(x.eanCandidates).toHaveLength(2);
    expect(x.eanCandidates.map((c) => c.raw)).toContain('12345678');
  });
});

describe('parseLabelText — basisDetail evidence field', () => {
  it('carries the declaring line for per-100 bases', () => {
    const x = parseLabelText(linesFromText('NUTRITION per 100 g\nFat 10 g'));
    expect(x.basisDetail.value).toBe('per_100g');
    expect(x.basisDetail.sourceLines[0]).toMatch(/per 100 g/);
  });

  it('serving-only carries the never-derived warning; unknown stays absent', () => {
    const s = parseLabelText(linesFromText('Nutrition per serving\nFat 4 g'));
    expect(s.basisDetail.value).toBe('serving_only');
    expect(s.basisDetail.warnings.join(' ')).toMatch(/never derived/);
    const u = parseLabelText(linesFromText('Just a name'));
    expect(u.basisDetail.value).toBeNull();
    expect(u.basisDetail.detection).toBe('absent');
  });
});

describe('parseLabelText — captured raw OCR text (German fixture, deu langdata)', () => {
  const x = parseRaw('label_nutrition_de.txt');

  it('reads identity, net weight, EAN (checksum-valid) and language', () => {
    expect(x.productName.value).toBe('Alpenmilch Schokolade');
    expect(x.brand.value).toBe('Gletscherhaus');
    expect(x.netQuantity.value).toBe('90 g');
    expect(x.packageSize.value).toBe(90);
    expect(x.packageUnit.value).toBe('g');
    expect(x.eanCode.value).toBe('4012345678901');
    expect(x.languageHint).toBe('de');
    expect(x.basis).toBe('per_100g');
  });

  it('reads the DE per-100g rows with comma decimals', () => {
    expect(x.energyKj.value).toBe(2287);
    expect(x.energyKcal.value).toBe(549);
    expect(x.fat.value).toBe(30.5);
    expect(x.saturatedFat.value).toBe(18.7);
    expect(x.carbohydrates.value).toBe(52.4);
    expect(x.sugars.value).toBe(51.2);
    expect(x.protein.value).toBe(7.3);
    expect(x.salt.value).toBe(0.25);
  });

  it('reads Zutaten (wrapped), Kann Spuren, storage and claims', () => {
    expect(x.ingredientsText.value).toMatch(/^Zucker, Kakaobutter, Vollmilchpulver/);
    expect(x.ingredientsText.value).toMatch(/Vanilleextrakt/); // wrapped line joined
    expect(x.mayContain.value).toMatch(/Haselnüssen/);
    expect(x.storageInstructions.value).toMatch(/trocken lagern/);
    expect(x.claimVegetarian.value).toBe(true);
    expect(x.claimGlutenFree.value).toBe(true);
    expect(x.claimVegan.value).toBeNull(); // not printed → unknown, not false
  });
});

describe('parseLabelText — captured raw OCR text (Polish multipack fixture, pol langdata)', () => {
  const x = parseRaw('label_multipack_pl.txt');

  it('reads identity, the multipack size and the checksum-valid EAN', () => {
    expect(x.productName.value).toBe('Sok Jabłkowy Klarowny');
    expect(x.brand.value).toBe('Dolina Sadów');
    expect(x.netQuantity.value).toBe('6 x 330 ml');
    expect(x.packageSize.value).toBe(330);
    expect(x.packageUnit.value).toBe('ml');
    expect(x.packageSize.warnings.join(' ')).toMatch(/multipack/);
    expect(x.eanCode.value).toBe('5901234123457');
    expect(x.languageHint).toBe('pl');
  });

  it('reads the PL per-100ml rows: values, the trace row and the explicit zero', () => {
    expect(x.basis).toBe('per_100ml');
    expect(x.energyKj.value).toBe(190);
    expect(x.energyKcal.value).toBe(45);
    expect(x.fat.value).toBe(0.1);
    // "<0,1 g" really survived OCR — trace outcome, never zero
    expect(x.saturatedFat.value).toBeNull();
    expect(x.saturatedFat.detection).toBe('trace');
    expect(x.carbohydrates.value).toBe(10.6);
    expect(x.sugars.value).toBe(10.2);
    expect(x.fibre.value).toBe(0.5);
    expect(x.protein.value).toBe(0.1);
    // OCR glued "Sól0,0g" — recovered as an EXPLICIT zero (distinct from absent)
    expect(x.salt.value).toBe(0);
    expect(x.salt.detection).toBe('value');
  });

  it('reads Składniki (wrapped), Może zawierać, storage and the PL claim', () => {
    expect(x.ingredientsText.value).toMatch(/^sok jabłkowy z zagęszczonego/);
    expect(x.ingredientsText.value).toMatch(/przeciwutleniacz/); // wrapped line joined
    expect(x.mayContain.value).toMatch(/selera/);
    expect(x.storageInstructions.value).toMatch(/Przechowywać/);
    expect(x.claimGlutenFree.value).toBe(true);
  });
});
