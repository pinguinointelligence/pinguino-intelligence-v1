/**
 * Community / share / partner analytics event catalogue (§47) — PURE.
 *
 * A closed, typed list. Two rules it enforces structurally:
 *
 *  1. NO PERSONAL DATA. Payloads carry ids and counts, never emails, names,
 *     handles or recipe formulations. `assertEventPayloadSafe` refuses a
 *     payload containing a demo-forbidden key, so a formulation cannot leak
 *     through telemetry the way it cannot leak through the API (§16).
 *  2. NO INVENTED EVENTS. The union is the contract; a typo is a type error.
 */
import { findDemoLeaks } from './demoSafeRecipe';

export const COMMUNITY_EVENTS = [
  'community_recipe_viewed',
  'community_recipe_used',
  'community_recipe_made',
  'community_recipe_rated',
  'community_remix_created',
  'creator_profile_viewed',
] as const;

export const SHARE_EVENTS = [
  'shared_recipe_created',
  'shared_recipe_opened',
  'shared_recipe_demo_viewed',
  'shared_recipe_signup',
  'shared_recipe_checkout_started',
  'shared_recipe_subscription_attributed',
  'shared_recipe_unlocked',
  'shared_recipe_used',
] as const;

export const PARTNER_EVENTS = [
  'partner_referral_opened',
  'partner_signup_attributed',
  'partner_checkout_attributed',
  'partner_subscription_attributed',
  'partner_commission_created',
  'partner_commission_reversed',
] as const;

export type CommunityEvent = (typeof COMMUNITY_EVENTS)[number];
export type ShareEvent = (typeof SHARE_EVENTS)[number];
export type PartnerEvent = (typeof PARTNER_EVENTS)[number];
export type GellattiCommunityEvent = CommunityEvent | ShareEvent | PartnerEvent;

export const ALL_COMMUNITY_EVENTS: readonly GellattiCommunityEvent[] = [
  ...COMMUNITY_EVENTS,
  ...SHARE_EVENTS,
  ...PARTNER_EVENTS,
];

/** Scalar-only payloads: no nested objects means no accidental object dumps. */
export type EventPayload = Readonly<Record<string, string | number | boolean | null>>;

/** Keys that must never appear in telemetry, on top of the formulation keys. */
export const FORBIDDEN_EVENT_KEYS: readonly string[] = [
  'email', 'user_email', 'display_name', 'name', 'handle', 'phone',
  'recipe_input', 'items', 'token', 'share_token', 'ip', 'user_agent',
];

const FORBIDDEN_EVENT = new Set(FORBIDDEN_EVENT_KEYS);

export type EventRefusal =
  | { readonly key: string; readonly reason: 'personal_data' }
  | { readonly key: string; readonly reason: 'formulation_leak' };

/** Every reason this payload may not be sent. Empty means it is safe. */
export function eventPayloadViolations(payload: EventPayload): readonly EventRefusal[] {
  const violations: EventRefusal[] = [];
  for (const key of Object.keys(payload)) {
    if (FORBIDDEN_EVENT.has(key)) violations.push({ key, reason: 'personal_data' });
  }
  for (const leak of findDemoLeaks(payload)) {
    violations.push({ key: leak.key, reason: 'formulation_leak' });
  }
  return violations;
}

export function assertEventPayloadSafe(event: GellattiCommunityEvent, payload: EventPayload): void {
  const violations = eventPayloadViolations(payload);
  if (violations.length > 0) {
    throw new Error(
      `[Gellatti] unsafe analytics payload for ${event}: ${violations
        .map((violation) => `${violation.key} (${violation.reason})`)
        .join(', ')}`,
    );
  }
}
