import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL(
    '../../../supabase/migrations/20260819030000_positive_presence_behavior_authority.sql',
    import.meta.url,
  ),
  'utf8',
);

describe('positive-presence ProductBehavior authority migration', () => {
  it('keeps the full authority implementation private behind a filtered wrapper', () => {
    expect(sql).toContain('rename to assert_recipe_behavior_authority_all_lines_v1');
    expect(sql).toContain('perform public.assert_recipe_behavior_authority_all_lines_v1(');
    expect(sql).toMatch(
      /revoke all on function public\.assert_recipe_behavior_authority_all_lines_v1\([\s\S]*?service_role/,
    );
    expect(sql).toMatch(
      /revoke all on function public\.assert_recipe_behavior_authority_v1\([\s\S]*?service_role/,
    );
  });

  it('uses actual-over-planned physical presence for both base and topping lines', () => {
    expect(sql.match(/nullif\(item->>'actual_grams',''\)::numeric/g)).toHaveLength(2);
    expect(sql.match(/\(item->>'planned_grams'\)::numeric/g)?.length).toBeGreaterThanOrEqual(4);
    expect(sql.match(/\)>0\),'\[\]'::jsonb\)/g)).toHaveLength(2);
    expect(sql).toContain("'{items}'");
    expect(sql).toContain("'{toppings}'");
  });

  it('rejects missing, malformed, and negative masses instead of filtering them away', () => {
    expect(
      sql.match(/coalesce\(jsonb_typeof\(item->'planned_grams'\),'missing'\)<>'number'/g),
    ).toHaveLength(2);
    expect(sql.match(/not in \('number','null'\)/g)).toHaveLength(2);
    expect(sql.match(/invalid recipe authority mass/g)).toHaveLength(1);
    expect(sql.match(/::numeric<0/g)).toHaveLength(4);
  });
});
