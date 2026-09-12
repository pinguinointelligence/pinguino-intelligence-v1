import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { labelPhotoRequest } from './scanFlowLogic';

/*
  The photograph is a fallback for the fields that were NOT found — not a fixed ritual.

  Owner session 81014331-… (Queso fresco, 88.4%) had read the ingredients, the nutrition table and
  the allergens; the single outstanding field was `evidence_identity.brand`. The screen still asked
  for "zdjęcie składu i tabeli wartości odżywczych". Asking for data the app is already holding is
  how a customer concludes the scan failed, and it is the exact complaint the owner raised:
  "chce odemnie zdjecia, jak wiemy z testów że nie było to konieczne".
*/
describe('the label screen asks for the part of the label it is actually missing', () => {
  it('asks only for the brand when only the brand is missing', () => {
    expect(labelPhotoRequest(['evidence_identity.brand'])).toBe(
      'Brakuje marki. Zrób zdjęcie przodu opakowania.',
    );
  });

  it('sends the customer to the front of the pack for name and maker', () => {
    expect(labelPhotoRequest(['product_identity', 'brand_or_unbranded'])).toBe(
      'Brakuje nazwy produktu i marki. Zrób zdjęcie przodu opakowania.',
    );
  });

  it('names the panel it needs, one field or several', () => {
    expect(labelPhotoRequest(['evidence_ingredients'])).toBe(
      'Brakuje składu. Zrób zdjęcie tej części etykiety.',
    );
    expect(labelPhotoRequest(['nutrition.sugars_g'])).toBe(
      'Brakuje tabeli wartości odżywczych. Zrób zdjęcie tej części etykiety.',
    );
    expect(
      labelPhotoRequest(['evidence_ingredients', 'nutrition.fat_g', 'allergen_statement']),
    ).toBe(
      'Brakuje składu, tabeli wartości odżywczych i oznaczenia alergenów. Zrób zdjęcie tej części etykiety.',
    );
  });

  it('asks for the ingredient panel when identity is missing alongside it, not instead of it', () => {
    // A brand gap does not cancel a real ingredient gap; the ingredient panel is the bigger ask.
    expect(labelPhotoRequest(['brand_or_unbranded', 'evidence_ingredients'])).toBe(
      'Brakuje składu. Zrób zdjęcie tej części etykiety.',
    );
  });

  it('never turns an unknown or technical gap into a generic photo request', () => {
    const notSolvable = 'Tego braku nie da się potwierdzić zdjęciem etykiety.';
    expect(labelPhotoRequest([])).toBe(notSolvable);
    expect(labelPhotoRequest(['something_nobody_has_seen_before'])).toBe(notSolvable);
    expect(labelPhotoRequest(['MISSING_WATER_PERCENT'])).toBe(notSolvable);
  });

  it('is the sentence the screen actually renders', () => {
    // Without this the helper can be correct and unreachable — which is how the hardcoded string
    // survived. Pin the call site, not just the function.
    const screen = readFileSync(
      resolve(process.cwd(), 'src/features/scan-flow/ScanFlow.tsx'),
      'utf8',
    );
    expect(screen).toContain('labelPhotoRequest(phase.session.missingCritical)');
    expect(screen).not.toContain(
      "? 'Brakuje jeszcze danych z etykiety. Zrób zdjęcie składu i tabeli wartości odżywczych.'",
    );
  });
});
