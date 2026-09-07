/**
 * HOME-S1 — a refused save must say why.
 *
 * Served on staging as a HOME-plan account: „Zapisz recepturę" was enabled, the click
 * registered, nothing was written, and NOTHING was shown — no dialog, no live region,
 * no text change. The canonical handler had already produced a customer sentence
 * (`setError(practicalGate.message)`) and HOME simply never rendered it.
 *
 * The fix is presentation only: the reason the canonical authority already owns is
 * displayed, filtered through the same customer-language filter as every other HOME
 * notice so a pipeline sentence can never leak `ProductBehavior` or `Mapper` onto the
 * screen.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = readFileSync('src/pages/home/HomeCreatorPage.tsx', 'utf8');
const section = readFileSync('src/features/home-creator/ui/HomeRecipeSection.tsx', 'utf8');

describe('a refused save is explained, not silent', () => {
  it('renders the canonical handler’s own reason', () => {
    expect(page).toContain('saveNotice={homeCustomerNotice(recipeSave.error)}');
  });

  it('shows it where the customer just pressed Save', () => {
    expect(section).toContain('data-testid="home-save-notice"');
    const notice = section.slice(
      section.indexOf('data-testid="home-save-notice"') - 400,
      section.indexOf('data-testid="home-save-notice"') + 200,
    );
    expect(notice).toContain('{saveNotice}');
  });

  it('announces it to assistive technology', () => {
    const notice = section.slice(
      section.indexOf('{saveNotice ? ('),
      section.indexOf('{saveNotice}') + 40,
    );
    expect(notice).toContain('role="status"');
    expect(notice).toContain('aria-live="polite"');
  });

  it('passes the reason through the HOME customer-language filter', () => {
    // The gate can return `productBehaviorSaveGateMessage(...)`, which is pipeline
    // language; unfiltered it would put internal vocabulary on a HOME screen.
    expect(page).toContain('homeCustomerNotice(recipeSave.error)');
  });

  it('invents no reason of its own — HOME re-decides no entitlement', () => {
    const handler = page.slice(page.indexOf('onSave={() => {'), page.indexOf('onLetsMakeIt='));
    // The routed refusals stay exactly as they were.
    expect(handler).toContain("recipeSave.blocked === 'signin'");
    expect(handler).toContain("recipeSave.blocked === 'plan'");
    // No new copy string is introduced for the refusal.
    expect(handler).not.toMatch(/saveNotice\s*=\s*['"]/);
  });
});
