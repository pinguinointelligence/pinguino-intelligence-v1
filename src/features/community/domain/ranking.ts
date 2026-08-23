/**
 * Community ranking (§38, §39, §79) — PURE, deterministic, recomputable.
 *
 * Rankings answer one question: DID PEOPLE ACTUALLY MAKE THIS? Not „did
 * people look at it", not „did people like it". So:
 *   * views carry ZERO weight — they are not even an input here (§38);
 *   * a confirmed MAKER outweighs a raw make, because ten makes by one person
 *     is one person's opinion;
 *   * ratings are a MODIFIER, never a base: a perfect 5.0 from three people
 *     nudges a score, it does not beat hundreds of confirmed makes (§79);
 *   * trending applies recency on top of the same components, so the boards
 *     never disagree about what „successful" means.
 *
 * WEIGHTS ARE DATA. `RANKING_WEIGHTS_V1` is versioned and the raw components
 * are stored alongside every snapshot, so changing a weight re-scores history
 * instead of destroying it. These values are mirrored EXACTLY in
 * `gellatti_list_community_v1` / `gellatti_snapshot_rankings_v1`; a source
 * test pins the two together.
 */

export interface RankingComponents {
  readonly unique_makers: number;
  readonly total_makes: number;
  readonly remix_count: number;
  readonly unique_users: number;
  readonly rating_count: number;
  readonly rating_sum: number;
  readonly makes_last_7d: number;
}

export interface RankingWeights {
  readonly version: string;
  readonly uniqueMakers: number;
  readonly totalMakes: number;
  readonly remixes: number;
  readonly uniqueUsers: number;
  /** Applied to (average − 3), so a 3.0 average is neutral, not a bonus. */
  readonly verifiedRating: number;
  /** Ratings below this count do not move the score at all (§42, §79). */
  readonly ratingConfidenceFloor: number;
  /** Rating influence reaches full strength at this many ratings. */
  readonly ratingConfidenceFull: number;
  /** Trending only: each make in the last 7 days adds this share of a multiplier. */
  readonly recencyPerMake: number;
}

export const RANKING_WEIGHTS_V1: RankingWeights = Object.freeze({
  version: 'v1',
  uniqueMakers: 5,
  totalMakes: 2,
  remixes: 3,
  uniqueUsers: 1,
  verifiedRating: 4,
  ratingConfidenceFloor: 3,
  ratingConfidenceFull: 50,
  recencyPerMake: 0.1,
});

export type RankingWindow = 'trending' | 'week' | 'month' | 'all_time';

export const RANKING_WINDOWS: readonly RankingWindow[] = [
  'trending',
  'week',
  'month',
  'all_time',
];

/**
 * The verified average, or null. NEVER a default: a recipe nobody has rated
 * shows no rating, not a 0 and not a 3 (§42, §59 — no fabricated metrics).
 */
export function verifiedAverage(components: Pick<RankingComponents, 'rating_count' | 'rating_sum'>): number | null {
  if (components.rating_count <= 0) return null;
  return components.rating_sum / components.rating_count;
}

/**
 * Score one publication. Deterministic: same components + same window + same
 * weights → bit-identical result, which is what makes a snapshot auditable.
 */
export function scorePublication(
  components: RankingComponents,
  window: RankingWindow = 'all_time',
  weights: RankingWeights = RANKING_WEIGHTS_V1,
): number {
  const base =
    weights.uniqueMakers * components.unique_makers +
    weights.totalMakes * components.total_makes +
    weights.remixes * components.remix_count +
    weights.uniqueUsers * components.unique_users;

  // Ratings modify, they do not carry. Below the floor they contribute
  // nothing; above it their influence ramps to full only with volume, so a
  // handful of five-star ratings cannot outrank demonstrated use.
  let ratingTerm = 0;
  const average = verifiedAverage(components);
  if (average !== null && components.rating_count >= weights.ratingConfidenceFloor) {
    const confidence =
      Math.min(components.rating_count, weights.ratingConfidenceFull) /
      weights.ratingConfidenceFull;
    ratingTerm = weights.verifiedRating * (average - 3) * confidence;
  }

  const recency =
    window === 'trending' ? 1 + components.makes_last_7d * weights.recencyPerMake : 1;

  return (base + ratingTerm) * recency;
}

export interface RankableSubject {
  readonly id: string;
  readonly components: RankingComponents;
  /** ISO timestamp — the deterministic tie-breaker after score. */
  readonly publishedAt: string;
  /** Moderation or anti-gaming exclusion (§50). */
  readonly rankingEligible?: boolean;
}

export interface RankedEntry {
  readonly rank: number;
  readonly id: string;
  readonly score: number;
  readonly components: RankingComponents;
}

/**
 * Rank a set of subjects. Total order — score, then recency, then id — so
 * recomputation is stable and two runs over unchanged data cannot disagree.
 * Zero-score subjects are omitted: an unproven recipe has no rank, and
 * inventing one would be a fabricated metric.
 */
export function rankSubjects(
  subjects: readonly RankableSubject[],
  window: RankingWindow = 'all_time',
  weights: RankingWeights = RANKING_WEIGHTS_V1,
  limit = 100,
): readonly RankedEntry[] {
  return subjects
    .filter((subject) => subject.rankingEligible !== false)
    .map((subject) => ({
      id: subject.id,
      publishedAt: subject.publishedAt,
      components: subject.components,
      score: scorePublication(subject.components, window, weights),
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.publishedAt.localeCompare(a.publishedAt) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, limit)
    .map((entry, index) => ({
      rank: index + 1,
      id: entry.id,
      score: entry.score,
      components: entry.components,
    }));
}

/** Creator ranking (§39): recipe performance, never follower count. */
export interface CreatorRankingComponents {
  readonly unique_makers: number;
  readonly total_makes: number;
  readonly remix_count: number;
  readonly unique_users: number;
  readonly public_recipe_count: number;
}

export const CREATOR_WEIGHTS_V1 = Object.freeze({
  version: 'v1',
  uniqueMakers: 5,
  totalMakes: 2,
  remixes: 3,
  uniqueUsers: 1,
  publicRecipes: 2,
});

export function scoreCreator(components: CreatorRankingComponents): number {
  return (
    CREATOR_WEIGHTS_V1.uniqueMakers * components.unique_makers +
    CREATOR_WEIGHTS_V1.totalMakes * components.total_makes +
    CREATOR_WEIGHTS_V1.remixes * components.remix_count +
    CREATOR_WEIGHTS_V1.uniqueUsers * components.unique_users +
    CREATOR_WEIGHTS_V1.publicRecipes * components.public_recipe_count
  );
}

/**
 * A rank is shown only where it means something (§39). One make and one
 * recipe is not a position in a global ranking, and displaying it as one
 * would be the fake-activity §59 forbids.
 */
export const MEANINGFUL_RANK_MIN_MAKERS = 3;

export function hasMeaningfulRank(components: CreatorRankingComponents): boolean {
  return (
    components.public_recipe_count > 0 &&
    components.unique_makers >= MEANINGFUL_RANK_MIN_MAKERS
  );
}
