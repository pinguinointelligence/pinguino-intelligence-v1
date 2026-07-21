import { describe, expect, it } from 'vitest';
import { recipePersistPartialize, type RecipeState } from './recipeStore';

const state = {
  mode: 'classic',
  category: 'milk_gelato',
  target_temperature_c: -11,
  target_batch_grams: 1000,
  machine_capacity_grams: null,
  flavor_intensity: 'balanced',
  cost_priority: 'balanced',
  items: [{ id: 'line-1' }],
  activePresetId: 'milk-base',
  savedRecipeId: 'aggregate-42',
  savedRecipeName: 'Moja receptura',
  currentVersionNumber: 3,
  dirty: true,
} as unknown as RecipeState;

describe('recipePersistPartialize', () => {
  it('PERSISTS the canonical aggregate link (S2 repair — version continuity survives reload)', () => {
    // The link is persisted so the next save appends v(n+1) to the SAME aggregate instead of a
    // new v1. Stale ids are safe: the adapter re-reads the DB-authoritative version and fails
    // honestly if the aggregate is gone (see supabaseRecipes.saveNewVersion).
    const persisted = recipePersistPartialize(state) as Record<string, unknown>;
    expect(persisted.savedRecipeId).toBe('aggregate-42');
    expect(persisted.savedRecipeName).toBe('Moja receptura');
    expect(persisted.currentVersionNumber).toBe(3);
    expect(persisted.dirty).toBe(true);
  });

  it('still persists the in-progress recipe content + preset highlight', () => {
    const persisted = recipePersistPartialize(state);
    expect(persisted.mode).toBe('classic');
    expect(persisted.category).toBe('milk_gelato');
    expect(persisted.items).toBe(state.items);
    expect(persisted.activePresetId).toBe('milk-base');
    expect(persisted.target_batch_grams).toBe(1000);
  });
});
