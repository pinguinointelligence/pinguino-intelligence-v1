import { describe, expect, it } from 'vitest';
import { diffSnapshot, extractSnapshotFields, parseDetectedChanges, type SnapshotFields } from './productSnapshotDiff';

describe('parseDetectedChanges', () => {
  it('flattens a stored {field:{from,to}} map into a list', () => {
    const list = parseDetectedChanges({ fat_percent: { from: null, to: 30.9 }, salt_percent: { from: 0.1, to: 0.2 } });
    expect(list).toHaveLength(2);
    expect(list.find((c) => c.field === 'fat_percent')).toEqual({ field: 'fat_percent', from: null, to: 30.9 });
  });
  it('returns [] for null / non-object / malformed values', () => {
    expect(parseDetectedChanges(null)).toEqual([]);
    expect(parseDetectedChanges('nope')).toEqual([]);
    expect(parseDetectedChanges([1, 2])).toEqual([]);
    expect(parseDetectedChanges({ x: 5 })).toEqual([]); // not a {from,to} entry
  });
});

describe('extractSnapshotFields', () => {
  it('maps product/insert fields to the snapshot set and coerces DB numeric strings', () => {
    const f = extractSnapshotFields({
      cost_per_kg: '3.90', package_size: 'Brick 1 L', detected_text: 'Leche UHT', product_url: 'https://x',
      fat_percent: '3.6', total_sugars_percent: 4.7, kcal_per_100g: '63',
    });
    expect(f.price).toBe(3.9);
    expect(f.package_size).toBe('Brick 1 L');
    expect(f.ingredients_text).toBe('Leche UHT');
    expect(f.source_url).toBe('https://x'); // falls back to product_url
    expect(f.fat_percent).toBe(3.6);
    expect(f.total_sugars_percent).toBe(4.7);
    expect(f.kcal_per_100g).toBe(63);
    expect(f.protein_percent).toBeNull(); // absent stays null, never 0
  });

  it('prefers source_url over product_url and blanks → null', () => {
    expect(extractSnapshotFields({ source_url: 'a', product_url: 'b' }).source_url).toBe('a');
    expect(extractSnapshotFields({ package_size: '   ' }).package_size).toBeNull();
  });
});

const base: SnapshotFields = {
  price: 1, package_size: 'P', ingredients_text: 'I', source_url: 'S', ocr_text: null,
  fat_percent: 3, saturated_fat_percent: 2, carbohydrate_percent: 5, total_sugars_percent: 4,
  protein_percent: 3, salt_percent: 0.1, kcal_per_100g: 60,
};

describe('diffSnapshot', () => {
  it('no previous snapshot → created', () => {
    expect(diffSnapshot(base, null)).toEqual({ changed: true, change_type: 'created', detected_changes: {} });
  });

  it('identical → no change', () => {
    const d = diffSnapshot({ ...base }, { ...base });
    expect(d.changed).toBe(false);
  });

  it('a nutrition change dominates and records from→to', () => {
    const d = diffSnapshot({ ...base, fat_percent: 9 }, base);
    expect(d.changed).toBe(true);
    expect(d.change_type).toBe('nutrition');
    expect(d.detected_changes.fat_percent).toEqual({ from: 3, to: 9 });
  });

  it('classifies price / package / ingredients / source changes', () => {
    expect(diffSnapshot({ ...base, price: 2 }, base).change_type).toBe('price');
    expect(diffSnapshot({ ...base, package_size: 'Q' }, base).change_type).toBe('package');
    expect(diffSnapshot({ ...base, ingredients_text: 'J' }, base).change_type).toBe('ingredients');
    expect(diffSnapshot({ ...base, source_url: 'T' }, base).change_type).toBe('source');
  });

  it('nutrition takes priority when several fields change at once', () => {
    expect(diffSnapshot({ ...base, price: 2, fat_percent: 9 }, base).change_type).toBe('nutrition');
  });
});
