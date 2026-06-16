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
  savedRecipeId: 'stale-id-from-a-previous-session',
  savedRecipeName: 'Old Recipe',
} as unknown as RecipeState;

describe('recipePersistPartialize', () => {
  it('does NOT persist the saved-recipe link (no stale id across reloads)', () => {
    const persisted = recipePersistPartialize(state) as Record<string, unknown>;
    expect('savedRecipeId' in persisted).toBe(false);
    expect('savedRecipeName' in persisted).toBe(false);
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
