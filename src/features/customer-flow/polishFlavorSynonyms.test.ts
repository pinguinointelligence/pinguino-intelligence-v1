import { describe, expect, it } from 'vitest';
import { detectPolishFlavorTags } from './polishFlavorSynonyms';

describe('Polish flavor synonyms — inflected words map to the right flavor tags', () => {
  it('maps malina and its inflected forms to raspberry (the residual defect)', () => {
    for (const w of ['malina', 'maliną', 'malinowy', 'maliny', 'malinowe']) {
      expect(detectPolishFlavorTags(w)).toContain('raspberry');
    }
  });

  it('maps every required Polish flavor word to its tag', () => {
    const cases: ReadonlyArray<[string, string]> = [
      ['maliną', 'raspberry'],
      ['truskawką', 'strawberry'],
      ['wanilią', 'vanilla'],
      ['pistacją', 'pistachio'],
      ['orzech laskowy', 'hazelnut'],
      ['miętą', 'mint'],
      ['bazylią', 'basil'],
      ['cytryną', 'lemon'],
      ['pomarańczą', 'orange'],
      ['mango', 'mango'],
      ['whisky', 'whisky'],
      ['czekoladą', 'chocolate'],
    ];
    for (const [word, tag] of cases) {
      expect(detectPolishFlavorTags(word)).toContain(tag);
    }
  });

  it('detects all three flavors in the exact live repro sentence', () => {
    const tags = detectPolishFlavorTags('lody czekoladowe z whisky i maliną');
    expect(tags).toEqual(expect.arrayContaining(['chocolate', 'whisky', 'raspberry']));
  });

  it('is deterministic and returns a stable rule order', () => {
    const a = detectPolishFlavorTags('maliną i czekoladą');
    const b = detectPolishFlavorTags('maliną i czekoladą');
    expect(a).toEqual(b);
    // Rule order: chocolate is listed before raspberry.
    expect(a).toEqual(['chocolate', 'raspberry']);
  });

  it('adds nothing for text with no known flavor word (no stopword false positives)', () => {
    expect(detectPolishFlavorTags('lody z dodatkiem i na wodzie')).toEqual([]);
    expect(detectPolishFlavorTags('')).toEqual([]);
    expect(detectPolishFlavorTags(null)).toEqual([]);
  });

  it('covers every required vanilla inflection', () => {
    for (const w of ['wanilia', 'waniliowe', 'waniliowy', 'waniliowa', 'wanilią', 'wanilii']) {
      expect(detectPolishFlavorTags(w)).toContain('vanilla');
    }
  });

  it('maps rum and its inflected forms to the rum tag', () => {
    for (const w of ['rum', 'rumem', 'rumu', 'rumie', 'rumy', 'rumowy', 'rumowe', 'rumową']) {
      expect(detectPolishFlavorTags(w)).toContain('rum');
    }
  });

  it('does not mistake chamomile ("rumianek") or rump steak ("rumsztyk") for rum', () => {
    expect(detectPolishFlavorTags('rumianek')).not.toContain('rum');
    expect(detectPolishFlavorTags('napar z rumianku')).not.toContain('rum');
    expect(detectPolishFlavorTags('rumsztyk')).not.toContain('rum');
  });

  it('keeps every recognized flavor in the PART 5 regression sentences', () => {
    expect(detectPolishFlavorTags('lody waniliowe z rumem i whisky')).toEqual(
      expect.arrayContaining(['vanilla', 'rum', 'whisky']),
    );
    expect(detectPolishFlavorTags('wanilia, rum i whisky')).toEqual(
      expect.arrayContaining(['vanilla', 'rum', 'whisky']),
    );
    expect(detectPolishFlavorTags('waniliowe z dodatkiem bazylii')).toEqual(
      expect.arrayContaining(['vanilla', 'basil']),
    );
    expect(detectPolishFlavorTags('czekoladowe z wanilią i maliną')).toEqual(
      expect.arrayContaining(['chocolate', 'vanilla', 'raspberry']),
    );
  });
});
