import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import {
  CURATED_RECIPE_CANDIDATES,
  visibleCuratedCandidates,
} from '@/data/recipes/curatedCollections';
import { isReviewModeEnabled } from '@/features/design-review/reviewMode';
import { RecipesHubPage } from './RecipesHubPage';

const source = readFileSync(resolve(import.meta.dirname, 'RecipesHubPage.tsx'), 'utf8');

const render = () =>
  renderToStaticMarkup(
    <MemoryRouter>
      <RecipesHubPage />
    </MemoryRouter>,
  );

describe('recipe discovery product review', () => {
  it('hides every unpublished candidate in normal customer mode', () => {
    expect(visibleCuratedCandidates({ visibility: 'customer' })).toEqual([]);
    const html = render();
    for (const entry of CURATED_RECIPE_CANDIDATES) expect(html).not.toContain(entry.name);
    expect(html).not.toContain('TRYB OWNER REVIEW');
  });

  it('requires Pro capability plus an explicit owner/QA opt-in on staging', () => {
    expect(isReviewModeEnabled({ isDev: true, envFlag: undefined, persona: 'pro' })).toBe(true);
    expect(isReviewModeEnabled({ isDev: true, envFlag: undefined, persona: 'home' })).toBe(false);
    expect(
      isReviewModeEnabled({
        isDev: false,
        envFlag: '1',
        hostname: 'pinguino-staging-preview.vercel.app',
        persona: 'pro',
        ownerOptIn: true,
      }),
    ).toBe(true);
    expect(
      isReviewModeEnabled({
        isDev: false,
        envFlag: '1',
        hostname: 'www.pinguinoai.com',
        persona: 'pro',
      }),
    ).toBe(false);
    expect(
      isReviewModeEnabled({
        isDev: false,
        envFlag: undefined,
        hostname: 'staging.pinguinoai.com',
        persona: 'pro',
      }),
    ).toBe(false);
    expect(
      isReviewModeEnabled({
        isDev: false,
        envFlag: undefined,
        hostname: 'staging.pinguinoai.com',
        persona: 'pro',
        ownerOptIn: true,
      }),
    ).toBe(true);
    expect(isReviewModeEnabled({ isDev: false, envFlag: undefined, persona: 'pro' })).toBe(false);
    expect(source).toContain('const ownerReviewMode = useReviewMode()');
    expect(source).toContain('<OwnerReviewFrame enabled={ownerReviewMode}>');
  });

  it('presents Proteinowe as a product-type filter, not a flavour-family heading', () => {
    expect(source).toContain('Typ produktu');
    expect(source).toContain('<option value="protein">Proteinowe</option>');
  });
});
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
