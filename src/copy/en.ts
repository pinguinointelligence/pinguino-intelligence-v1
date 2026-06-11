/**
 * All user-facing copy lives here (typed, English-only MVP).
 * Centralized for later i18n extraction — never hardcode strings in components.
 */
export const copy = {
  brand: {
    name: 'PINGÜINO',
    sub: 'INTELLIGENCE',
    full: 'PINGÜINO Intelligence',
  },
  /** PI status vocabulary (design-system subset of Masterplan §12.7). */
  status: {
    ideal: 'Ideal',
    good: 'Good',
    risky: 'Risky',
    tooSoft: 'Too soft',
    tooHard: 'Too hard',
    locked: 'Locked',
    pro: 'Pro',
    demo: 'Demo',
  },
  /** Ingredient confidence levels (Masterplan §16). */
  confidence: {
    verified: 'Verified',
    veryHigh: 'Very high confidence',
    high: 'High confidence',
    estimated: 'Estimated',
    needsVerification: 'Needs verification',
  },
  /** Gating + upgrade teaser catalog (Masterplan §6, §10). */
  gate: {
    proLabel: 'PINGÜINO Pro',
    unlockCta: 'Unlock Pro',
    prompts: {
      exactGrams: 'Unlock Pro to see exact correction grams.',
      exactAmount: 'PINGÜINO Pro calculates the exact amount to add.',
      labelExport: 'Label export is available in Pro.',
    },
  },
  landing: {
    eyebrow: 'Gelato Intelligence Platform',
    headline: 'From idea to production-ready gelato.',
    subline:
      'PINGÜINO Intelligence pairs a deterministic recipe engine with AI guidance — taste, structure, serving temperature, cost and production reality, balanced in one workspace.',
    ctaPrimary: 'Start PI Demo',
    ctaSecondary: 'Explore the four modes',
    pillars: [
      {
        title: 'Deterministic engine',
        body: 'Formula-based, reproducible calculations. Same recipe in, same numbers out — always. AI explains; it never replaces the math.',
      },
      {
        title: 'PI Profile Indicators',
        body: 'Structure, sweetness, freezing stability and cost — read at a glance on one laboratory panel while you build.',
      },
      {
        title: 'Exact corrections',
        body: '“Add 34.7 g sucrose and 178.0 g milk 3.5 %.” PINGÜINO Pro tells you precisely how to rebalance — even mid-production.',
      },
    ],
    modesEyebrow: 'Product Modes',
    modesHeadline: 'Four ways to balance a recipe. One engine.',
    modes: [
      {
        name: 'ECO',
        body: 'Lowest cost, technically stable. Built for hotels, buffets and high-volume production.',
      },
      {
        name: 'CLASSIC',
        body: 'The balanced gelato-shop product. Good taste, good cost, reliable structure.',
      },
      {
        name: 'PREMIUM',
        body: 'High flavor intensity. The recipe is rebalanced around the main ingredient — never against it.',
      },
      {
        name: 'SIGNATURE',
        body: 'Maximum perceived flavor, boosters where needed. Technically stable, worthy of your name.',
      },
    ],
  },
  studio: {
    eyebrow: 'PI Studio',
    headline: 'The instruments are in place.',
    body: 'A static preview of the PINGÜINO design system — indicators, corrections and gating, exactly as they will behave once the deterministic engine arrives in the next build step.',
    back: 'Back to landing',
    preview: {
      panelTitle: 'PI Profile Indicators',
      panelNote: 'Static design preview — live values arrive with the engine.',
      indicators: {
        pod: 'Sweetness · POD',
        npac: 'Freezing stability · NPAC',
        solids: 'Total solids',
        fat: 'Fat',
      },
      corrections: {
        title: 'Active corrections',
        rows: ['Add sucrose', 'Add milk 3.5 %'],
      },
      confidence: {
        title: 'Ingredient confidence',
        samples: ['Sucrose', 'Skimmed milk powder', 'Pistachio paste', 'Producer label scan'],
      },
      empty: {
        title: 'No saved recipes yet.',
        body: 'Your recipe library will live here once saving is unlocked.',
      },
      next: {
        label: 'Next build step',
        body: 'The deterministic calculation engine — composition, POD, PAC/NPAC, ice fraction, scoring and exact corrections.',
      },
    },
  },
  notFound: {
    code: '404',
    headline: 'This page does not exist.',
    back: 'Back to landing',
  },
  footer: {
    line: 'PINGÜINO Intelligence — precision gelato intelligence.',
  },
} as const;
