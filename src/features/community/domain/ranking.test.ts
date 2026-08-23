import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MEANINGFUL_RANK_MIN_MAKERS,
  RANKING_WEIGHTS_V1,
  hasMeaningfulRank,
  rankSubjects,
  scoreCreator,
  scorePublication,
  verifiedAverage,
  type RankingComponents,
} from './ranking';

const components = (over: Partial<RankingComponents> = {}): RankingComponents => ({
  unique_makers: 0,
  total_makes: 0,
  remix_count: 0,
  unique_users: 0,
  rating_count: 0,
  rating_sum: 0,
  makes_last_7d: 0,
  ...over,
});

describe('§38 — ranking measures whether people actually MADE it', () => {
  it('views are not an input at all: there is no view field to weight', () => {
    expect(Object.keys(components())).not.toContain('views');
    expect(Object.keys(RANKING_WEIGHTS_V1)).not.toContain('views');
  });

  it('a confirmed maker outweighs a raw make (§38: repeat use ≠ reach)', () => {
    const oneMakerFiveMakes = scorePublication(components({ unique_makers: 1, total_makes: 5 }));
    const fiveMakersFiveMakes = scorePublication(components({ unique_makers: 5, total_makes: 5 }));
    expect(fiveMakersFiveMakes).toBeGreaterThan(oneMakerFiveMakes);
  });

  it('§79: three perfect ratings do NOT beat hundreds of confirmed makes', () => {
    const threePerfectRatings = scorePublication(
      components({ unique_makers: 3, total_makes: 3, rating_count: 3, rating_sum: 15 }),
    );
    const hundredsOfMakes = scorePublication(
      components({ unique_makers: 120, total_makes: 300, rating_count: 0, rating_sum: 0 }),
    );
    expect(hundredsOfMakes).toBeGreaterThan(threePerfectRatings);
    expect(hundredsOfMakes / threePerfectRatings).toBeGreaterThan(10);
  });

  it('ratings below the confidence floor move the score by exactly nothing', () => {
    const base = components({ unique_makers: 10, total_makes: 20 });
    expect(scorePublication({ ...base, rating_count: 2, rating_sum: 10 })).toBe(
      scorePublication(base),
    );
  });

  it('a 3.0 average is neutral — never a bonus for being average', () => {
    const base = components({ unique_makers: 10, total_makes: 20 });
    expect(scorePublication({ ...base, rating_count: 20, rating_sum: 60 })).toBe(
      scorePublication(base),
    );
  });

  it('a bad verified average pulls a score DOWN', () => {
    const base = components({ unique_makers: 10, total_makes: 20 });
    expect(scorePublication({ ...base, rating_count: 20, rating_sum: 20 })).toBeLessThan(
      scorePublication(base),
    );
  });

  it('time decay: `trending` rewards recent makes, `all_time` ignores them', () => {
    const fresh = components({ unique_makers: 10, total_makes: 20, makes_last_7d: 15 });
    const stale = components({ unique_makers: 10, total_makes: 20, makes_last_7d: 0 });
    expect(scorePublication(fresh, 'trending')).toBeGreaterThan(scorePublication(stale, 'trending'));
    expect(scorePublication(fresh, 'all_time')).toBe(scorePublication(stale, 'all_time'));
  });

  it('verified average is null when nobody rated — never a fabricated 0 or 3 (§59)', () => {
    expect(verifiedAverage({ rating_count: 0, rating_sum: 0 })).toBeNull();
    expect(verifiedAverage({ rating_count: 4, rating_sum: 18 })).toBe(4.5);
  });
});

describe('§79 — rankings are deterministic and recomputable', () => {
  const subjects = [
    { id: 'a', publishedAt: '2026-08-01T00:00:00Z', components: components({ unique_makers: 5 }) },
    { id: 'b', publishedAt: '2026-08-02T00:00:00Z', components: components({ unique_makers: 9 }) },
    { id: 'c', publishedAt: '2026-08-03T00:00:00Z', components: components({ unique_makers: 5 }) },
    { id: 'd', publishedAt: '2026-08-04T00:00:00Z', components: components() },
  ];

  it('produces the same ordering on every run, including on ties', () => {
    const first = rankSubjects(subjects);
    const second = rankSubjects([...subjects].reverse());
    expect(first).toEqual(second);
    expect(first.map((entry) => entry.id)).toEqual(['b', 'c', 'a']);
  });

  it('omits zero-score subjects instead of inventing a rank for them', () => {
    expect(rankSubjects(subjects).some((entry) => entry.id === 'd')).toBe(false);
  });

  it('excludes moderation/anti-gaming-flagged subjects (§50, §51)', () => {
    const flagged = subjects.map((subject) =>
      subject.id === 'b' ? { ...subject, rankingEligible: false } : subject,
    );
    expect(rankSubjects(flagged).map((entry) => entry.id)).toEqual(['c', 'a']);
  });

  it('keeps the raw components with every entry so a rank stays auditable', () => {
    expect(rankSubjects(subjects)[0]?.components).toEqual(components({ unique_makers: 9 }));
  });
});

describe('§39 — creator ranking derives from recipe performance, not followers', () => {
  it('has no follower input in its signature', () => {
    const score = scoreCreator({
      unique_makers: 10,
      total_makes: 40,
      remix_count: 3,
      unique_users: 25,
      public_recipe_count: 4,
    });
    expect(score).toBe(5 * 10 + 2 * 40 + 3 * 3 + 1 * 25 + 2 * 4);
  });

  it('shows a rank only where the data is meaningful', () => {
    const thin = {
      unique_makers: MEANINGFUL_RANK_MIN_MAKERS - 1,
      total_makes: 1,
      remix_count: 0,
      unique_users: 1,
      public_recipe_count: 1,
    };
    expect(hasMeaningfulRank(thin)).toBe(false);
    expect(hasMeaningfulRank({ ...thin, unique_makers: MEANINGFUL_RANK_MIN_MAKERS })).toBe(true);
    expect(hasMeaningfulRank({ ...thin, unique_makers: 50, public_recipe_count: 0 })).toBe(false);
  });
});

describe('LOCKSTEP — the SQL boards use the SAME weights as this module', () => {
  const sql = readFileSync(
    resolve(
      import.meta.dirname,
      '../../../../supabase/migrations/20260823140000_community_creators_sharing_v1.sql',
    ),
    'utf8',
  ).replace(/\r\n?/g, '\n');

  it('publication scoring appears verbatim in both discovery and snapshots', () => {
    const expression = [
      `${RANKING_WEIGHTS_V1.uniqueMakers} * coalesce(`,
      `${RANKING_WEIGHTS_V1.totalMakes} * coalesce(`,
      `${RANKING_WEIGHTS_V1.remixes} * coalesce(`,
      `${RANKING_WEIGHTS_V1.uniqueUsers} * coalesce(`,
    ];
    for (const fragment of expression) {
      expect(sql.split(fragment).length - 1, fragment).toBeGreaterThanOrEqual(2);
    }
    expect(sql).toContain(`>= ${RANKING_WEIGHTS_V1.ratingConfidenceFloor}`);
    expect(sql).toContain(`least(m.rating_count, ${RANKING_WEIGHTS_V1.ratingConfidenceFull})`);
    expect(sql).toContain(`least(s.rating_count, ${RANKING_WEIGHTS_V1.ratingConfidenceFull})`);
  });

  it('creator scoring weights match the SQL Top Creators board', () => {
    expect(sql).toContain('5 * cm.unique_makers + 2 * cm.total_makes + 3 * cm.remix_count');
    expect(sql).toContain('+ 1 * cm.unique_users + 2 * cm.public_recipe_count');
  });
});
