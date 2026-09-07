/**
 * OWNER QA 2026-09-06, acceptance item 11: no customer surface renders „Mapper", „ProductBehavior",
 * „BASE_RECIPE", a UUID or a raw status.
 *
 * The sentence the owner was actually shown is the first case below, verbatim.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { customerSafeNotice, exposesInternals } from './customerSafeNotice';

const SERVED_TO_THE_OWNER =
  'Dla produkt 16eba716-4f75-4675-842f-0b2e32c8937a · wersja 16eba716-4f75-4675-842f-0b2e32c8937a ' +
  '· Mapper brak · moduł BASE_RECIPE brakuje aktualnego ProductBehavior binding. ' +
  'Odśwież dane produktu i uruchom klasyfikację ponownie.';

const CALM = 'Nie możemy teraz potwierdzić danych tego produktu.';

describe('the sentence the owner was shown can never reach a customer again', () => {
  it('is recognised as internal', () => {
    expect(exposesInternals(SERVED_TO_THE_OWNER)).toBe(true);
    expect(customerSafeNotice(SERVED_TO_THE_OWNER, CALM)).toBe(CALM);
  });

  it('every piece of it is caught on its own, so a shorter variant cannot slip through', () => {
    for (const fragment of [
      'brakuje aktualnego ProductBehavior binding',
      'Mapper brak',
      'moduł BASE_RECIPE',
      '16eba716-4f75-4675-842f-0b2e32c8937a',
      'produkt PI-ING-001876',
      'behavior_binding_missing',
      'roleReadiness: REVIEW',
      'INGREDIENTS_EVIDENCE_REQUIRED',
    ])
      expect(exposesInternals(fragment), fragment).toBe(true);
  });

  it('leaves an ordinary customer sentence exactly as it is', () => {
    for (const safe of [
      'Nie możemy teraz potwierdzić danych jednego ze składników.',
      'Ten produkt nie ma jeszcze wszystkich danych potrzebnych do receptury.',
      'Nie mamy jeszcze tego produktu. Czy chcesz go dodać?',
      'Zapisano jako Twój produkt (prywatny, widoczny tylko na Twoim koncie).',
    ]) {
      expect(exposesInternals(safe), safe).toBe(false);
      expect(customerSafeNotice(safe, CALM)).toBe(safe);
    }
  });

  it('silence stays silence — a screen with no refusal never gains one', () => {
    expect(customerSafeNotice(null, CALM)).toBeNull();
    expect(customerSafeNotice(undefined, CALM)).toBeNull();
    expect(customerSafeNotice('   ', CALM)).toBeNull();
  });

  it('a refusal is never dropped: an unsafe sentence becomes the calm one, not nothing', () => {
    expect(customerSafeNotice(SERVED_TO_THE_OWNER, CALM)).not.toBeNull();
  });
});

describe('the shared picker is calm by default, not by opting in', () => {
  const PICKER = readFileSync('src/features/ingredient-builder/ProductPickerPopover.tsx', 'utf8');

  it('applies a sanitiser even when the mount passes none', () => {
    // THE REGRESSION: `sanitizeNotice?.(text) ?? text` let an un-opted mount render raw internals.
    expect(PICKER).not.toMatch(/sanitizeNotice\?\.\(text\)\s*\?\?\s*text/);
    expect(PICKER).toMatch(/\(sanitizeNotice \?\? defaultCustomerNotice\)\(text\)/);
    expect(PICKER).toContain('customerSafeNotice(');
  });

  it('and HOME keeps its own wording rather than the neutral fallback', () => {
    const HOME = readFileSync('src/features/home-creator/ui/HomeRecipeSection.tsx', 'utf8');
    expect(HOME).toMatch(/sanitizeNotice=\{homeCustomerNotice\}/);
  });

  it('one denylist serves every surface', () => {
    const HOME_NOTICE = readFileSync('src/features/home-creator/homeCustomerNotice.ts', 'utf8');
    expect(HOME_NOTICE).toContain("from '@/copy/customerSafeNotice'");
    // the list must not be duplicated back into a feature folder
    expect(HOME_NOTICE).not.toContain('const INTERNAL_VOCABULARY');
  });
});
