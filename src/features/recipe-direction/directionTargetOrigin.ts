/**
 * OD-29 (Owner 19.09.2026) — WHOSE Direction level each axis carries.
 *
 * Provenance, not a click in this session: `user_explicit` survives saving, closing the
 * app and opening it tomorrow, because otherwise a reload would let the product change a
 * deliberate choice without asking. `legacy_unknown` is for levels stored before this was
 * recorded — we do not know who chose them, so they are treated as the customer's.
 *
 * A LEAF module on purpose: the profile store and the feasibility assembler both need
 * these words, and neither may pull the other's dependencies in to get them (the first
 * version imported them from `directionFeasibility`, which reaches `applyPipeline`
 * through `lockRelaxation` and closed an import cycle that broke CORE at module init).
 */
export type DirectionTargetOrigin = 'system_default' | 'user_explicit' | 'legacy_unknown';

export type DirectionTargetOriginAxis = 'sweetness' | 'softness' | 'creaminess' | 'flavor';

export type DirectionTargetOrigins = Readonly<
  Record<DirectionTargetOriginAxis, DirectionTargetOrigin>
>;

/** A new recipe, or a profile's own defaults: nobody has chosen anything yet. */
export const DEFAULT_DIRECTION_TARGET_ORIGINS: DirectionTargetOrigins = Object.freeze({
  sweetness: 'system_default',
  softness: 'system_default',
  creaminess: 'system_default',
  flavor: 'system_default',
});

/** Levels restored from a record written before provenance existed. Consent-required. */
export const LEGACY_DIRECTION_TARGET_ORIGINS: DirectionTargetOrigins = Object.freeze({
  sweetness: 'legacy_unknown',
  softness: 'legacy_unknown',
  creaminess: 'legacy_unknown',
  flavor: 'legacy_unknown',
});

/**
 * Whose level may be changed for them without asking: only one the system itself chose.
 * Unknown provenance counts as the customer's — the safe mistake is asking a question
 * nobody needed; the unsafe one is silently undoing a decision.
 */
export const directionTargetNeedsConsent = (origin: DirectionTargetOrigin): boolean =>
  origin !== 'system_default';

const AXES: readonly DirectionTargetOriginAxis[] = [
  'sweetness',
  'softness',
  'creaminess',
  'flavor',
];

/**
 * Read provenance off a stored record. Anything the record does not state is
 * `legacy_unknown`, never `system_default`: a missing word is not permission.
 */
export function normalizeDirectionTargetOrigins(value: unknown): DirectionTargetOrigins {
  if (!value || typeof value !== 'object') return LEGACY_DIRECTION_TARGET_ORIGINS;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    AXES.map((axis) => {
      const stored = record[axis];
      return [
        axis,
        stored === 'system_default' || stored === 'user_explicit' || stored === 'legacy_unknown'
          ? stored
          : 'legacy_unknown',
      ];
    }),
  ) as DirectionTargetOrigins;
}
