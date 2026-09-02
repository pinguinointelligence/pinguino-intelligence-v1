import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'scripts/nonMapperProductCleanup.sql'), 'utf8');

describe('non-Mapper cleanup artifact', () => {
  it('is dry-run by default and gates every write behind an explicit setting', () => {
    expect(sql).toContain("current_setting('pinguino.mapper_only_cleanup_apply',true)='on'");
    const writeSection = sql.slice(sql.indexOf('delete from public.user_product_relations'));
    expect(
      writeSection.match(/current_setting\('pinguino\.mapper_only_cleanup_apply',true\)='on'/g),
    ).toHaveLength(3);
  });

  it('never mutates Mapper or immutable recipe versions', () => {
    expect(sql).not.toMatch(/(?:update|delete from|insert into)\s+public\.mapper_basement/i);
    expect(sql).not.toMatch(/(?:update|delete from|insert into)\s+public\.recipe_versions/i);
  });

  it('audits favorites, recents, current recipes and immutable history before cleanup', () => {
    for (const source of [
      'public.user_product_relations',
      'public.saved_recipes',
      'public.recipe_versions',
      'public.product_behavior_bindings',
    ])
      expect(sql).toContain(source);
    expect(sql).toContain('archive_preserve_history');
    expect(sql).toContain('archive_referenced_active_recipe');
  });

  it('archives identities conservatively and removes only private ranking overlays', () => {
    expect(sql).toContain('set is_active=false');
    expect(sql).toContain('delete from public.user_product_relations');
    expect(sql).not.toMatch(/delete from public\.products/i);
  });
});
