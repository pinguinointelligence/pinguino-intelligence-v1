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
    headline: 'The demo studio is on its way.',
    body: 'This is where the deterministic engine, the ingredient builder and the PI Profile Indicators Panel will live. The scaffold is complete — the engine arrives in the next build step.',
    back: 'Back to landing',
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
