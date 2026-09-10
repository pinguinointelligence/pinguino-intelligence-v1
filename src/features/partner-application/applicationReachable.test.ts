/// <reference types="node" />
/**
 * The Affiliate application form must be REACHABLE.
 *
 * It was not, for a while, and nothing in the repo could see it. The
 * collaboration IA change turned `/work-with-us` into a redirect to Franchise.
 * `WorkWithUsPage` was the only surface that rendered
 * `PartnerApplicationPanel`, and it kept its export, so every type check and
 * every test stayed green while the form silently left the product — and
 * `/partner` still told applicants to go there.
 *
 * That is the exact failure this file exists to prevent: a route can be
 * retired without anyone noticing that it was the last door to a form.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8');

const router = read('../../app/router.tsx');
const partnerPage = read('../../pages/community/PartnerPage.tsx');

describe('the Affiliate application form has a reachable home', () => {
  it('is rendered by a ROUTED page', () => {
    // /partner is routed and is the authenticated Affiliate workspace.
    expect(router).toContain('path="/partner"');
    expect(partnerPage).toContain('<PartnerApplicationPanel />');
  });

  it('no surface sends an applicant to the retired Work With Us route', () => {
    // That route now redirects to Franchise, which is a different product lane.
    expect(partnerPage).not.toMatch(/to="\/work-with-us/);
  });

  it('/work-with-us is a redirect, so nothing may rely on it rendering', () => {
    expect(router).toContain('path="/work-with-us"');
    expect(router).toContain('<LegacyDestinationRedirect pathname="/franchise" />');
    expect(router).not.toContain('<WorkWithUsPage />');
  });

  it('an applicant who needs to act is shown the form, not a link', () => {
    // more_information_needed and rejected both mean "act now". Sending them to
    // another page to find a form is how the form got lost in the first place.
    expect(partnerPage).toMatch(/applicationStatus !== 'submitted'[\s\S]{0,160}PartnerApplicationPanel/);
  });
});
