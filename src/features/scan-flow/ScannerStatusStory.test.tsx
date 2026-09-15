// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScannerMissingDataNotice, ScannerStatusStory } from './ScannerStatusStory';
import {
  SCANNER_STORY,
  humanVerificationMessage,
  missingDataPromptForFields,
  missingDataPromptForGaps,
  type ScannerStoryStage,
} from './scannerStatusCopy';

describe('Scanner status story — owner-approved GELLATTI UIX', () => {
  it('SCANNER-UIX-001: maps the six visible stages to progressively fuller gelato', () => {
    const stages: ScannerStoryStage[] = [
      'captured',
      'recognized',
      'organizing',
      'verifying',
      'assembling',
      'success',
    ];

    expect(stages.map((stage) => SCANNER_STORY[stage].level)).toEqual([0, 24, 50, 75, 90, 100]);
    expect(stages.map((stage) => SCANNER_STORY[stage].message)).toEqual([
      'Mamy to. Sprawdzam, co to za jeden.',
      'A, już wiem. Rozpoznaję produkt.',
      'Teraz porządkuję skład, żeby wszystko miało ręce i nogi.',
      'Chwileczkę — wysyłam brygadę do magazynu po więcej informacji.',
      'Dobra, mam wszystko. Kończę układać wynik.',
      'Gellattissimo! Gotowe.',
    ]);
  });

  it('SCANNER-UIX-002: exposes one calm live status without a numeric progress claim', () => {
    const html = renderToStaticMarkup(<ScannerStatusStory stage="organizing" />);

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('data-testid="scanner-status-story"');
    expect(html).toContain('data-gelato-level="50"');
    expect(html).not.toMatch(/\b50\s*%/);
    expect(html).not.toMatch(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/);
  });

  it('SCANNER-UIX-003: keeps all six qualitative states usable at mobile width', () => {
    const html = renderToStaticMarkup(
      <div className="w-[320px]">
        <ScannerStatusStory stage="verifying" />
      </div>,
    );

    expect(html).toContain('w-full');
    expect(html).toContain('min-w-0');
    expect(html).toContain('wysyłam brygadę do magazynu');
  });

  it('SCANNER-UIX-004: a completed scan shows the full ice cream and approved success line', () => {
    const html = renderToStaticMarkup(<ScannerStatusStory stage="success" />);

    expect(html).toContain('data-gelato-level="100"');
    expect(html).toContain('Gellattissimo! Gotowe.');
  });
});

describe('Scanner missing-data and human-verification copy', () => {
  it('SCANNER-UIX-005: names the exact package view without exposing a gap code', () => {
    const ingredients = missingDataPromptForGaps(['INGREDIENTS_EVIDENCE_REQUIRED']);
    const nutrition = missingDataPromptForGaps(['nutrition.energyKcal']);
    const identity = missingDataPromptForGaps(['product_identity']);

    expect(ingredients).toContain('skład i alergeny');
    expect(nutrition).toContain('tabelę wartości odżywczych');
    expect(identity).toContain('przód opakowania z nazwą produktu');
    expect([ingredients, nutrition, identity].join(' ')).not.toMatch(
      /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/,
    );
  });

  it('SCANNER-UIX-006: names concrete editable fields and keeps internal keys private', () => {
    const message = missingDataPromptForFields([
      { key: 'productionDeclarations.totalSolidsPercent', label: 'Sucha masa produktu', unit: '%' },
    ]);

    expect(message).toBe(
      'Ej, tu bez Ciebie nie damy rady. Podaj nam jeszcze Sucha masa produktu (%) i lecimy dalej.',
    );
    expect(message).not.toContain('productionDeclarations');
  });

  it('SCANNER-UIX-007: freezes the visual and removes the active loader for user action', () => {
    const html = renderToStaticMarkup(
      <ScannerMissingDataNotice
        stage="organizing"
        message={missingDataPromptForGaps(['nutrition.energyKcal'])}
      />,
    );

    expect(html).toContain('data-testid="scanner-missing-data"');
    expect(html).toContain('data-paused="true"');
    expect(html).toContain('data-gelato-level="50"');
    expect(html).not.toContain('data-testid="scanner-status-story"');
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain('transition-transform');
  });

  it('SCANNER-UIX-008: offers a truthful human fallback without technical language', () => {
    expect(humanVerificationMessage).toBe(
      'Tym zajmie się człowiek z naszej ekipy. Damy znać, gdy produkt będzie gotowy.',
    );
    expect(humanVerificationMessage).not.toMatch(
      /\b(?:backend|pipeline|diagnostic|enum|field|readiness)\b/i,
    );
  });
});
