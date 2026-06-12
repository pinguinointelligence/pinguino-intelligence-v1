/**
 * Product modes as calculation policies, not visual styles (spec §11).
 * Score weights are masterplan §4 defaults — tunable, CONFIG_VERSION-guarded.
 * PREMIUM/SIGNATURE main-ingredient protection is the spec §12 hard floor.
 */
import type { ModePolicy, ProductMode } from '../types';

export const MODES: Record<ProductMode, ModePolicy> = {
  eco: {
    mode: 'eco',
    objective: 'Lowest cost while every technical band stays satisfied (stable).',
    score_weights: { cost: 0.45, technical: 0.4, flavor: 0.15 },
    main_ingredient: { reduce_forbidden: false, floor: 'category_min' },
    candidate_ranking: 'cheapest_first',
    boosters: 'none',
  },
  classic: {
    mode: 'classic',
    objective: 'Balanced taste / cost / structure — pure Golden Middle.',
    score_weights: { cost: 0.25, technical: 0.4, flavor: 0.35 },
    main_ingredient: { reduce_forbidden: false, floor: 'category_min' },
    candidate_ranking: 'balanced',
    boosters: 'none',
  },
  premium: {
    mode: 'premium',
    objective:
      'Stronger main ingredient and better mouthfeel — preserve the main ingredient as much as possible.',
    score_weights: { cost: 0.15, technical: 0.4, flavor: 0.45 },
    main_ingredient: { reduce_forbidden: true, floor: 'raised' },
    candidate_ranking: 'mouthfeel_first',
    boosters: 'allowed',
  },
  signature: {
    mode: 'signature',
    objective:
      'Maximum perceived flavor with boosters if needed — must remain technically stable.',
    score_weights: { cost: 0.1, technical: 0.35, flavor: 0.55 },
    main_ingredient: { reduce_forbidden: true, floor: 'maximum' },
    candidate_ranking: 'flavor_first',
    boosters: 'suggested',
  },
};
