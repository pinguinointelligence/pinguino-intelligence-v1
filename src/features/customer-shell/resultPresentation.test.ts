/**
 * Result-screen presentation logic (owner UX correction 2026-07-17,
 * „PROFIL MASZYNY I UPROSZCZENIE PODGLĄDU HOME”). The result phase is not
 * statically reachable in the node/static-markup harness, so the decision logic
 * lives here as pure functions and is pinned directly.
 */
import { describe, expect, it } from 'vitest';
import {
  compactRecipeContext,
  formatBatchGrams,
  pluralProdukt,
  resultStatus,
  showTechnicalDetails,
} from './resultPresentation';

describe('compactRecipeContext (§4/§5 — one compact line, never the big card)', () => {
  it('renders „Gelato mleczne · 1330 g” for a gelato at 1330 g', () => {
    expect(compactRecipeContext('gelato', 1330)).toBe('Gelato mleczne · 1330 g');
  });

  it('uses kg for round-kg batches and „—” when unknown', () => {
    expect(compactRecipeContext('sorbet', 5000)).toBe('Sorbet · 5 kg');
    expect(compactRecipeContext('gelato', null)).toBe('Gelato mleczne · —');
  });

  it('NEVER exposes the internal serving mode („Świeże”) or a „Tryb” label', () => {
    for (const type of ['gelato', 'sorbet', 'vegan', 'protein'] as const) {
      const line = compactRecipeContext(type, 1330);
      expect(line).not.toContain('Świeże');
      expect(line).not.toContain('Ninja');
      expect(line).not.toMatch(/tryb/i);
      expect(line).not.toMatch(/°C/);
    }
  });
});

describe('formatBatchGrams', () => {
  it('formats grams, kilograms and the unknown case', () => {
    expect(formatBatchGrams(1330)).toBe('1330 g');
    expect(formatBatchGrams(1000)).toBe('1 kg');
    expect(formatBatchGrams(null)).toBe('—');
  });
});

describe('pluralProdukt (1 / 2–4 / 5+)', () => {
  it('declines correctly', () => {
    expect(pluralProdukt(1)).toBe('produktu');
    expect(pluralProdukt(3)).toBe('produktów');
    expect(pluralProdukt(5)).toBe('produktów');
  });
});

describe('resultStatus (§11 — exactly ONE status, never the double message)', () => {
  it('open flavour lines → „Wymaga wyboru N produktów” + required-products guidance', () => {
    const s = resultStatus({ unresolvedCount: 3, gramsVisible: false, outOfBand: false, calculated: true });
    expect(s.kind).toBe('needs_products');
    expect(s.label).toBe('Wymaga wyboru 3 produktów');
    expect(s.guidance).toBe(
      'Wybierz konkretne produkty dla 3 składników, aby dokładnie przeliczyć recepturę.',
    );
  });

  it('a single open line declines both nouns correctly', () => {
    const s = resultStatus({ unresolvedCount: 1, gramsVisible: false, outOfBand: false, calculated: true });
    expect(s.label).toBe('Wymaga wyboru 1 produktu');
    expect(s.guidance).toBe(
      'Wybierz konkretne produkty dla 1 składnika, aby dokładnie przeliczyć recepturę.',
    );
  });

  it('calculated + preview only (grams hidden) → „Receptura gotowa do podglądu”, no guidance', () => {
    const s = resultStatus({ unresolvedCount: 0, gramsVisible: false, outOfBand: false, calculated: true });
    expect(s.kind).toBe('ready_preview');
    expect(s.label).toBe('Receptura gotowa do podglądu');
    expect(s.guidance).toBeNull();
  });

  it('calculated + grams unlocked → „Gotowa do przeliczenia”', () => {
    const s = resultStatus({ unresolvedCount: 0, gramsVisible: true, outOfBand: false, calculated: true });
    expect(s.kind).toBe('ready_recalc');
    expect(s.label).toBe('Gotowa do przeliczenia');
  });

  it('NOT engine-calculated (structure-only / draft) is NEVER „Gotowa do przeliczenia”, even with grams', () => {
    // The adversarial-review HIGH finding: a flavourless vegan/sorbet resolves to
    // structure_only with grams visible — it must stay an honest preview.
    const s = resultStatus({ unresolvedCount: 0, gramsVisible: true, outOfBand: false, calculated: false });
    expect(s.kind).toBe('ready_preview');
    expect(s.label).toBe('Receptura gotowa do podglądu');
    expect(s.label).not.toBe('Gotowa do przeliczenia');
    // …and it honestly flags that nothing was engine-calculated yet.
    expect(s.guidance).toContain('podglądowa struktura');
  });

  it('NEVER emits both „prawie gotowa” and „wyliczona przez silnik” at once', () => {
    for (const input of [
      { unresolvedCount: 3, gramsVisible: false, outOfBand: false, calculated: true },
      { unresolvedCount: 0, gramsVisible: false, outOfBand: false, calculated: true },
      { unresolvedCount: 0, gramsVisible: true, outOfBand: true, calculated: true },
      { unresolvedCount: 0, gramsVisible: true, outOfBand: false, calculated: false },
    ]) {
      const s = resultStatus(input);
      // The status label itself is never the old „prawie gotowa” phrasing.
      expect(s.label).not.toContain('prawie gotowa');
    }
  });
});

describe('showTechnicalDetails (§3/§10 — Home hides „Dane techniczne”, Pro keeps it)', () => {
  it('is false for demo and home, true only for pro', () => {
    expect(showTechnicalDetails('demo')).toBe(false);
    expect(showTechnicalDetails('home')).toBe(false);
    expect(showTechnicalDetails('pro')).toBe(true);
  });
});
