import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ALL_INTAKE_FIELD_KEYS } from '../evidenceExtractor';
import { resolvedField, reviewSession } from '../session/__fixtures__/builders';
import { CustomerOcrSummary } from './CustomerOcrSummary';
import { customerOcrMissingActions, settleCustomerReview } from './customerOcrReviewPolicy';

describe('customer OCR summary', () => {
  it('keeps every low-confidence value pending while settling optional absences as unknown', () => {
    const session = reviewSession('customer-1', [
      resolvedField('product_name', 'Heuristic legal line', 'img-1', {
        reviewStatus: 'needs_confirmation',
        chosenCandidate: null,
      }),
      resolvedField('package_size', '220', 'img-1', {
        reviewStatus: 'needs_confirmation',
        chosenCandidate: null,
      }),
      resolvedField('package_unit', 'g', 'img-1', {
        reviewStatus: 'needs_confirmation',
        chosenCandidate: null,
      }),
    ]);
    const settled = settleCustomerReview(session);
    expect(settled.fields.find((field) => field.fieldKey === 'product_name')?.reviewStatus).toBe(
      'needs_confirmation',
    );
    expect(settled.fields.find((field) => field.fieldKey === 'package_size')?.reviewStatus).toBe(
      'needs_confirmation',
    );
    expect(
      settled.fields.find((field) => field.fieldKey === 'energy_kcal')?.reviewStatus ??
        'marked_unknown',
    ).toBe('marked_unknown');
  });

  it('renders four concise Polish sections without internal diagnostics', () => {
    const fields = reviewSession('customer-2', [
      resolvedField('product_name', 'Oreo'),
      resolvedField('package_size', '220'),
      resolvedField('package_unit', 'g'),
      resolvedField('ingredients_text', 'mąka, cukier'),
    ]).fields;
    const html = renderToStaticMarkup(
      <CustomerOcrSummary
        fields={fields}
        missingActions={[]}
        market="ES"
        onEdit={vi.fn()}
        onConfirm={vi.fn()}
        onMarkUnknown={vi.fn()}
        onChooseCandidate={vi.fn()}
      />,
    );
    expect(html).toContain('Tożsamość produktu');
    expect(html).toContain('Opakowanie');
    expect(html).toContain('Podsumowanie etykiety');
    expect(html).toContain('Rynek');
    expect(html).toContain('ES');
    expect(html).toContain('Sprawdzenie braków');
    expect(html).not.toMatch(/[1-5]\. (Tożsamość|Opakowanie|Skład|Sprawdzenie)/);
    expect(html).not.toMatch(/provenance|confidence|source line|fieldKey|needs_confirmation/i);
  });

  it('keeps detected languages in evidence instead of expanding the customer summary', () => {
    const fields = reviewSession('customer-languages', [
      resolvedField('product_name', 'Ciastka'),
      resolvedField('brand', 'Oreo'),
    ]).fields;
    const html = renderToStaticMarkup(
      <CustomerOcrSummary
        fields={fields}
        missingActions={[]}
        market={null}
        onEdit={vi.fn()}
        onConfirm={vi.fn()}
        onMarkUnknown={vi.fn()}
        onChooseCandidate={vi.fn()}
      />,
    );
    expect(html).not.toContain('Języki etykiety');
    expect(html).toContain('Nie wybrano');
  });

  it('shows exact photo guidance and never calls a back-label-only review ready', () => {
    const session = settleCustomerReview(
      reviewSession('owner-back-label', [
        resolvedField('package_size', '220'),
        resolvedField('package_unit', 'g'),
        resolvedField('ingredients_text', 'mąka, cukier'),
        resolvedField('may_contain_text', 'mleko'),
      ]),
    );
    const actions = customerOcrMissingActions(session).map((action) => action.label);
    expect(actions).toEqual([
      'Dodaj zdjęcie przodu opakowania',
      'Dodaj zdjęcie kodu kreskowego',
      'Dodaj zdjęcie tabeli wartości odżywczych',
    ]);
    const html = renderToStaticMarkup(
      <CustomerOcrSummary
        fields={session.fields}
        missingActions={actions}
        market={null}
        onEdit={vi.fn()}
        onConfirm={vi.fn()}
        onMarkUnknown={vi.fn()}
        onChooseCandidate={vi.fn()}
      />,
    );
    for (const action of actions) expect(html).toContain(action);
    expect(html).toContain('Nazwa produktu nie została jeszcze rozpoznana');
    expect(html).not.toContain('Dane są gotowe do zapisu');
  });

  it('shows an actionable prompt when only identity still needs confirmation', () => {
    const fields = settleCustomerReview(
      reviewSession('identity-only', [
        resolvedField('product_name', 'Niepewna nazwa', 'img-1', {
          reviewStatus: 'needs_confirmation',
          chosenCandidate: null,
        }),
        resolvedField('brand', 'Marka'),
        resolvedField('package_size', '220'),
        resolvedField('package_unit', 'g'),
      ]),
    ).fields;
    const html = renderToStaticMarkup(
      <CustomerOcrSummary
        fields={fields}
        missingActions={[]}
        market="ES"
        onEdit={vi.fn()}
        onConfirm={vi.fn()}
        onMarkUnknown={vi.fn()}
        onChooseCandidate={vi.fn()}
      />,
    );
    expect(html).toContain('Popraw nazwę produktu lub markę w sekcji „Tożsamość produktu”.');
  });

  it('shows ingredient evidence as a concise status, never as a long customer correction field', () => {
    const fields = reviewSession('customer-long-ingredients', [
      resolvedField('product_name', 'Ciastka'),
      resolvedField('brand', 'Marka'),
      resolvedField('ingredients_text', 'mąka pszenna, cukier, kakao, olej palmowy', 'img-1', {
        reviewStatus: 'needs_confirmation',
        chosenCandidate: null,
      }),
    ]).fields;
    const html = renderToStaticMarkup(
      <CustomerOcrSummary
        fields={fields}
        missingActions={[]}
        market={null}
        onEdit={vi.fn()}
        onConfirm={vi.fn()}
        onMarkUnknown={vi.fn()}
        onChooseCandidate={vi.fn()}
      />,
    );
    expect(html).toContain('Skład i alergeny');
    expect(html).toContain('Odczytano z etykiety');
    expect(html).not.toContain('Popraw Składniki');
    expect(html).not.toContain('mąka pszenna, cukier, kakao, olej palmowy');
  });

  it('never recreates the 28-field expert form for low-confidence customer evidence', () => {
    const allLowConfidence = ALL_INTAKE_FIELD_KEYS.map((fieldKey) =>
      resolvedField(fieldKey, `wartość ${fieldKey}`, 'img-1', {
        reviewStatus: 'needs_confirmation',
        chosenCandidate: null,
      }),
    );
    const settled = settleCustomerReview(reviewSession('all-low-confidence', allLowConfidence));
    const unresolved = settled.fields.filter(
      (field) =>
        field.reviewStatus === 'needs_confirmation' || field.reviewStatus === 'conflict_unresolved',
    );
    expect(unresolved.map((field) => field.fieldKey)).toEqual([
      'product_name',
      'brand',
      'package_size',
      'package_unit',
      'ean_code',
    ]);
    const html = renderToStaticMarkup(
      <CustomerOcrSummary
        fields={settled.fields}
        missingActions={[]}
        market="ES"
        onEdit={vi.fn()}
        onConfirm={vi.fn()}
        onMarkUnknown={vi.fn()}
        onChooseCandidate={vi.fn()}
      />,
    );
    expect(html.match(/data-customer-review-card=/g) ?? []).toHaveLength(3);
    expect(html).not.toContain('wartość ingredients_text');
    expect(html).not.toContain('wartość energy_kcal');
  });
});
