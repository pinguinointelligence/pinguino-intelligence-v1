import { describe, expect, it } from 'vitest';
import { classifyProductSemantics } from '@/features/product-intelligence/productRecognition';
import { applyCustomerProductFamily, resolveCustomerProductFamily } from './customerProductFamily';

const evidence = (name: string) => ({
  name,
  brand: null,
  manufacturer: null,
  manufacturerCode: null,
  gtin: '4001686322536',
  productType: 'consumer_scanner',
  category: null,
  subcategory: null,
  variant: null,
  ingredients: null,
  nutrition: null,
  description: null,
  dosage: null,
  technicalParameters: null,
  sourceUrls: [],
});

describe('customer product family gate', () => {
  it('resolves a confident cocoa family before Mapper completion', () => {
    const classification = classifyProductSemantics(evidence('Cacao puro desgrasado en polvo'));
    expect(resolveCustomerProductFamily(classification)).toMatchObject({
      status: 'RESOLVED',
      family: 'cocoa',
    });
  });

  it('requires a customer family when Recognition remains unknown', () => {
    const classification = classifyProductSemantics(evidence('Produkt X'));
    expect(resolveCustomerProductFamily(classification).status).toBe(
      'CUSTOMER_CONFIRMATION_REQUIRED',
    );
  });

  it('uses customer confirmation only for unresolved semantics and never fabricates chemistry', () => {
    const classification = classifyProductSemantics(evidence('Produkt X'));
    const confirmed = applyCustomerProductFamily(classification, 'fruit');
    expect(confirmed).toMatchObject({
      classificationSource: 'CUSTOMER_CONFIRMED',
      ingredientFamily: 'fruit',
      productArchetype: 'FRUIT_PRODUCT',
      intendedUsageRole: 'BASE_ONLY',
    });
    expect(confirmed).not.toHaveProperty('technicalComposition');
  });

  /*
    FA-SCAN retest, 2026-09-07. On the served chain the model answered Cola Zero with
    modelReasonCodes [ARCHETYPE_UNKNOWN, FAMILY_UNKNOWN, FORM_UNKNOWN, ROLE_UNKNOWN]. The customer's
    `beverage` answer fills all four, yet only FAMILY_UNKNOWN was dropped, so modelRequired stayed
    true and both authorities kept gating: productBehavior 8 -> 4, PRODUCT_SEMANTICS_UNRESOLVED,
    ready false. That is the missing 4.12 of the owner's 94.12.
  */
  const modelUnresolved = (reasons: string[]) => ({
    ...classifyProductSemantics(evidence('Cola Zero')),
    classificationSource: 'SERVER_MODEL' as const,
    modelReasonCodes: reasons,
    modelRequired: true,
  });

  it('stops requiring the model once the answer has resolved every field a code named', () => {
    const confirmed = applyCustomerProductFamily(
      modelUnresolved(['ARCHETYPE_UNKNOWN', 'FAMILY_UNKNOWN', 'FORM_UNKNOWN', 'ROLE_UNKNOWN']),
      'beverage',
    );
    expect(confirmed).toMatchObject({
      ingredientFamily: 'plant_beverage',
      productArchetype: 'NORMAL_INGREDIENT',
      physicalForm: 'LIQUID',
      intendedUsageRole: 'BASE_ONLY',
    });
    expect(confirmed.modelReasonCodes).toEqual([]);
    expect(confirmed.modelRequired).toBe(false);
  });

  it('keeps requiring the model for a field the answer did not resolve', () => {
    // `fruit` supplies no form, so FORM_UNKNOWN is still true and must survive.
    const confirmed = applyCustomerProductFamily(
      modelUnresolved(['FAMILY_UNKNOWN', 'FORM_UNKNOWN']),
      'fruit',
    );
    expect(confirmed.physicalForm).toBe('UNKNOWN');
    expect(confirmed.modelReasonCodes).toEqual(['FORM_UNKNOWN']);
    expect(confirmed.modelRequired).toBe(true);
  });

  it('leaves an unrelated reason code alone', () => {
    const confirmed = applyCustomerProductFamily(
      modelUnresolved(['FAMILY_UNKNOWN', 'SOMETHING_ELSE']),
      'beverage',
    );
    expect(confirmed.modelReasonCodes).toEqual(['SOMETHING_ELSE']);
    expect(confirmed.modelRequired).toBe(true);
  });
});
