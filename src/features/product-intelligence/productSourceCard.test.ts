/**
 * Source-card evidence — the identity gate is the whole safety property here.
 *
 * A brand-level source pack is only safe if it can refuse. These tests are about
 * the refusals: different variant, different brand, unconfirmed pack, wrong
 * basis. Each one is a way a pack could quietly write one product's label onto
 * another.
 */
import { describe, expect, it } from 'vitest';
import {
  assessCardIdentity,
  cardContribution,
  CARD_CONFIDENCE,
  type SourceCardFacts,
  type SourceCardSubject,
} from './productSourceCard';

const subject = (overrides: Partial<SourceCardSubject> = {}): SourceCardSubject => ({
  brand: 'Alpro',
  name: 'Alpro Napój owsiany niesłodzony',
  variant: null,
  netQuantityValue: '1',
  netQuantityUnit: 'l',
  barcode: null,
  ...overrides,
});

const card = (overrides: Partial<SourceCardFacts> = {}): SourceCardFacts => ({
  url: 'https://zakupy.biedronka.pl/alpro-napoj-owsiany-nieslodzony-1-l-0000024295.html',
  heading: 'Alpro Napój owsiany niesłodzony 1 l',
  basis: 'per_100g',
  nutrition: { fat_percent: 1.5, protein_percent: 0.8, carbohydrate_percent: 6.4 },
  ingredients: null,
  allergens: null,
  ...overrides,
});

describe('card identity gate', () => {
  it('accepts a card whose brand, wording and pack all agree', () => {
    expect(assessCardIdentity(subject(), card()).verdict).toBe('EXACT_IDENTITY_MATCH');
  });

  it('refuses a different fat variant of the same product', () => {
    // The case that matters: 2% milk and 3.9% milk share brand, wording and size.
    const assessment = assessCardIdentity(
      subject({ brand: 'goBIO', name: 'Mleko goBIO 2%', netQuantityValue: '1', netQuantityUnit: 'l' }),
      card({ heading: 'goBIO Mleko 3,9% 1 l', nutrition: { fat_percent: 3.9 } }),
    );
    expect(assessment.verdict).toBe('MISMATCH');
    expect(assessment.reasons.join(' ')).toContain('inny wariant');
  });

  it('refuses a card for another brand entirely', () => {
    expect(
      assessCardIdentity(subject({ brand: 'Alpro' }), card({ heading: 'Milka Czekolada mleczna 100 g' }))
        .verdict,
    ).toBe('MISMATCH');
  });

  it('holds back when the card does not confirm the pack size', () => {
    expect(
      assessCardIdentity(subject(), card({ heading: 'Alpro Napój owsiany niesłodzony 250 ml' }))
        .verdict,
    ).toBe('AMBIGUOUS');
  });

  it('prefers an exact GTIN over any wording comparison', () => {
    expect(
      assessCardIdentity(subject({ barcode: '5411188110385' }), card({ barcode: '5411188110385' }))
        .verdict,
    ).toBe('EXACT_EAN_MATCH');
    expect(
      assessCardIdentity(subject({ barcode: '5411188110385' }), card({ barcode: '5901234123457' }))
        .verdict,
    ).toBe('MISMATCH');
  });

  it('says so rather than guessing when the card has no heading', () => {
    expect(assessCardIdentity(subject(), card({ heading: null })).verdict).toBe('AMBIGUOUS');
  });
});

describe('card contribution', () => {
  it('contributes verified fields for a confirmed identity', () => {
    const contribution = cardContribution(card(), 'AUTHORITATIVE_RETAILER', 'EXACT_IDENTITY_MATCH');
    expect(contribution.fields.fat_percent?.value).toBe(1.5);
    expect(contribution.fields.fat_percent?.provenance.state).toBe('VERIFIED');
    // A shop is never described as the manufacturer.
    expect(contribution.fields.fat_percent?.provenance.basis).toBe('retailer_card');
    expect(contribution.fields.fat_percent?.provenance.confidence).toBe(
      CARD_CONFIDENCE.AUTHORITATIVE_RETAILER,
    );
  });

  it('marks a brand-owner card as first-party, and rates it higher', () => {
    const contribution = cardContribution(card(), 'OFFICIAL_PRIVATE_LABEL', 'EXACT_IDENTITY_MATCH');
    expect(contribution.fields.fat_percent?.provenance.basis).toBe('private_label_card');
    expect(CARD_CONFIDENCE.OFFICIAL_PRIVATE_LABEL).toBeGreaterThan(
      CARD_CONFIDENCE.AUTHORITATIVE_RETAILER,
    );
  });

  it('takes nothing at all when identity was not confirmed', () => {
    for (const verdict of ['AMBIGUOUS', 'MISMATCH'] as const) {
      expect(cardContribution(card(), 'AUTHORITATIVE_RETAILER', verdict).fields).toEqual({});
    }
  });

  it('keeps per-100 ml nutrition as per-100 ml, never as per-100 g', () => {
    const contribution = cardContribution(
      card({ basis: 'per_100ml' }),
      'AUTHORITATIVE_RETAILER',
      'EXACT_IDENTITY_MATCH',
    );
    expect(contribution.fields).toEqual({});
    expect(contribution.per100ml?.fat_percent).toBe(1.5);
  });

  it('refuses a card that declares no basis at all', () => {
    expect(
      cardContribution(card({ basis: null }), 'AUTHORITATIVE_RETAILER', 'EXACT_IDENTITY_MATCH')
        .fields,
    ).toEqual({});
  });
});
