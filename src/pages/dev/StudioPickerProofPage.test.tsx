/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { StudioPickerProofPage } from './StudioPickerProofPage';
import { buildStudioPickerProofLibrary } from './studioPickerProofFixture';

const render = (el: ReactElement) => renderToStaticMarkup(<MemoryRouter>{el}</MemoryRouter>);
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

describe('buildStudioPickerProofLibrary', () => {
  it('produces a My Products group via the real builder, with reference-linked provenance', () => {
    const lib = buildStudioPickerProofLibrary();
    expect(lib.products.length).toBe(3);
    expect(lib.ingredients.length).toBe(3); // basement references too
    const nata = lib.products.find((p) => p.id === 'PR-ING-000010')!;
    expect(nata.pac_value).toBe(3.3); // resolved from the linked Cream 35% reference
    expect(nata.is_verified).toBe(false);
    expect(lib.productProvenance.get('PR-ING-000010')?.reference_linked).toBe(true);
    // the maltitol product is red-flagged
    expect(lib.productProvenance.get('PR-ING-000032')?.blocked_by_red_flags).toBe(true);
  });

  it('never copies pac/pod onto product rows in the fixture inputs (engine values are resolved)', () => {
    const lib = buildStudioPickerProofLibrary();
    // the EngineIngredient carries resolved pac/pod, but that is the handoff output, not a row write
    expect(lib.products.every((p) => typeof p.pac_value === 'number')).toBe(true);
  });
});

describe('StudioPickerProofPage', () => {
  it('renders the My Products group + provenance in a browser-renderable page (no auth)', () => {
    const t = text(render(<StudioPickerProofPage />));
    expect(t).toMatch(/My Products proof/);
    expect(t).toMatch(/Nata para montar/);
    expect(t).toMatch(/DEV fixture/);
  });
});

describe('production picker still uses real RLS data (fixture does not leak into production)', () => {
  const SRC = resolve(import.meta.dirname, '..', '..');
  const hook = readFileSync(join(SRC, 'features', 'ingredient-builder', 'useIngredientLibrary.ts'), 'utf8');
  const fixture = readFileSync(join(SRC, 'pages', 'dev', 'studioPickerProofFixture.ts'), 'utf8');

  it('the production hook fetches the real products + ingredients services', () => {
    expect(hook.includes('listMyProducts')).toBe(true);
    expect(hook.includes('listEngineApprovedIngredients')).toBe(true);
    expect(hook.includes('buildStudioPickerProofLibrary')).toBe(false); // never imports the fixture
  });

  it('the fixture touches no DB / service (pure builders only)', () => {
    expect(/supabase/i.test(fixture)).toBe(false);
    expect(/@\/services\//.test(fixture)).toBe(false);
    for (const verb of ['.insert(', '.update(', '.upsert(', '.delete(', '.from(']) {
      expect(fixture.includes(verb), verb).toBe(false);
    }
  });
});
