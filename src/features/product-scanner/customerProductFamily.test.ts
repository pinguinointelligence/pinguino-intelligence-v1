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

  it('maps the generic beverage choice to a neutral beverage family, not plant milk', () => {
    const classification = classifyProductSemantics(evidence('Sport 002'));
    const confirmed = applyCustomerProductFamily(classification, 'beverage');

    expect(confirmed).toMatchObject({
      ingredientFamily: 'beverage',
      productArchetype: 'NORMAL_INGREDIENT',
      physicalForm: 'LIQUID',
      intendedUsageRole: 'BASE_ONLY',
    });
    expect(confirmed.ingredientFamily).not.toBe('plant_beverage');
  });
});
