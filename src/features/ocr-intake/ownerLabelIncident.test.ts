import { describe, expect, it } from 'vitest';
import { extractEvidence } from './evidenceExtractor';
import { parseLabelText, type ParsedOcrLine } from './labelTextParser';
import type { RawOcrResult } from './intakeContracts';

const ownerLines: ParsedOcrLine[] = [
  { text: 'KAKAOKEKSE MIT FEINER CRÈMEFÜLLUNG MIT VANILLEGESCHMACK (29%). Zutaten: WEIZENMEHL, Zucker, Palmöl, fettarmes Kakaopulver 4,6%, WEIZENSTÄRKE, Glukose-Fruktose-Sirup, Backtriebmittel, Speisesalz, SOJALECITHIN, Aroma (Vanillin).', confidence: 91 },
  { text: 'KANN MILCH ENTHALTEN.', confidence: 96 },
  { text: 'BISCUITS CACAO, FOURRÉS GOÛT VANILLE (29%). Ingrédients : Farine de BLÉ, sucre, huile de palme, cacao maigre en poudre 4,6%, amidon de BLÉ, sirop de glucose-fructose, poudres à lever, sel, lécithine de SOJA, arôme (vanilline).', confidence: 90 },
  { text: 'PEUT CONTENIR LAIT.', confidence: 95 },
  { text: 'Mondelez Deutschland, D-28078 Bremen. Fabriqué en Espagne pour Mondelez Schweiz GmbH.', confidence: 93 },
  { text: '5 Päckchen / 5 paquets', confidence: 97 },
  { text: '℮ 220 g', confidence: 98 },
];

// Exact line payload produced from the Owner's attached staging incident image with
// the same six language models used by ProductScanPage. Keep the OCR noise: it is
// the regression that exposed both the net-mark miss and may-contain section bleed.
const realOwnerOcrLines: ParsedOcrLine[] = [
  { text: 'e ® KAKAOKEKSE MIT EINER CREMEFÜLLUNG MIT VANILLEGESCHMACK Zutaten: WEIZENMEHL, Zucker, Palmöl, fettarmes Kakaopulver 4,6%, WEIZENSTÄRKE, Glukose-', confidence: 85 },
  { text: 'Fret Backtriebmittel (Kallumhydrogencarbonat, Ammontanidogencnhe | À ON EEE 1 (SOJALECITHIN, Sonnenblumen-', confidence: 40 },
  { text: 'lecithin), Aroma (Vanillin), KANN MILCH ENTHALTEN, @ BISCUITS CACAOTES, FOURRÉS GOÛT Sacs GE pe as : Farine de BLÉ, sucre, 5 Päckchen /', confidence: 77 },
  { text: 'huile de palme, cacao maigre en poudre 4,6%, amidon de BLE, sirop de glucose-fructose, poudres à lever (carbonate acide de potassium, carbonate acide 5 paquets', confidence: 91 },
  { text: "d'ammonium, carbonateacide de sodium), sel, huile de palmiste, émulifians (lécthine de SOJA, lécithine de tournesol), arôme (vaniline), PEUTCONTENIRLAIT, > PAG", confidence: 68 },
  { text: '0,60 € fa Deutschland, D-28078 Bremen, Verbraucherservice 01806 - 258 588. Pro Anruf 0,20 € aus dem deutschen Festnetz/ Mobilfunk mai, e€ 220 g', confidence: 80 },
  { text: '0,60 € pro Anruf in DE, @ rime Fr A-1140 Wien, Verbraucherservice 0821 - 10 10 20. Pro Anruf = € aus dem Festnetz In AT/', confidence: 84 },
  { text: 'ggf, abweichende Gebühren aus dem Mobilfunknetz, @ Fabriqué en Espagne pour / Hergestellt in Spanien für: Mondelez Schweiz GmbH', confidence: 92 },
  { text: 'Lindbergh-Allee 1, CH-8152 Glattpark, Service Consommateurs / erbraucherservie 0800 - 412.412. Appel non surtaxé -Le coût depuis untéléphone Ka 7', confidence: 65 },
  { text: 'Mobile peut être différent, / Gebührenfrel aus dem Festnetz in CH - Mobilfunk abweichend a co ; ARE. PAR,', confidence: 64 },
];

const raw: RawOcrResult = {
  providerId: 'fixture',
  imageId: 'owner-side-label',
  fullText: ownerLines.map((line) => line.text).join('\n'),
  lines: ownerLines.map((line, index) => ({
    text: line.text,
    confidence: line.confidence ?? 90,
    words: [],
    bbox: { x0: 0, y0: index, x1: 100, y1: index + 1 },
  })),
  overallConfidence: 93,
  languageHints: ['deu', 'fra'],
  durationMs: 1,
};

describe('served Owner label incident regression', () => {
  it('routes legal/ingredient text only to ingredients and may-contain, never sugars/nutrition', () => {
    const parsed = parseLabelText(ownerLines);
    expect(parsed.packageSize.value).toBe(220);
    expect(parsed.packageUnit.value).toBe('g');
    expect(parsed.ingredientsText.value).toMatch(/WEIZENMEHL|Farine de BLÉ/);
    expect(parsed.mayContain.value).toMatch(/MILCH|LAIT/);
    expect(parsed.sugars.value).toBeNull();
    expect(parsed.energyKcal.value).toBeNull();
    expect(parsed.basis).toBe('unknown');
  });

  it('detects German and French label evidence and keeps Mondelez as manufacturer evidence', () => {
    const parsed = parseLabelText(ownerLines);
    expect(parsed.languageHints).toEqual(expect.arrayContaining(['de', 'fr']));
    expect(parsed.manufacturerEvidence.value).toMatch(/Mondelez/);
    expect(parsed.brand.value).toBeNull();
  });

  it('never turns non-front legal copy into a product name', () => {
    const fields = extractEvidence([{ imageId: raw.imageId, role: 'other', result: raw }]);
    const name = fields.find((field) => field.fieldKey === 'product_name');
    const sugars = fields.find((field) => field.fieldKey === 'sugars');
    expect(name?.candidates.every((candidate) => candidate.normalized === null)).toBe(true);
    expect(sugars?.candidates.every((candidate) => candidate.normalized === null)).toBe(true);
  });

  it('parses the real noisy Owner OCR without quantity loss or may-contain bleed', () => {
    const parsed = parseLabelText(realOwnerOcrLines);

    expect(parsed.packageSize.value).toBe(220);
    expect(parsed.packageUnit.value).toBe('g');
    expect(parsed.mayContain.value).toMatch(/MILCH|LAIT/);
    expect(parsed.mayContain.value).not.toMatch(/Farine|Mondelez|220\s*g|Verbraucherservice/i);
    expect(parsed.sugars.value).toBeNull();
    expect(parsed.energyKcal.value).toBeNull();
    expect(parsed.manufacturerEvidence.value).toMatch(/Mondelez/i);
    expect(parsed.languageHints).toEqual(expect.arrayContaining(['de', 'fr']));
  });
});
