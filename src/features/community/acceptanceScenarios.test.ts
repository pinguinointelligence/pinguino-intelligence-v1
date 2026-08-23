/**
 * Acceptance scenarios A–O (§64–§78), mapped to the guarantee that enforces
 * each one.
 *
 * HONEST SCOPE. These are not end-to-end tests — there is no live database in
 * this suite, so a scenario whose proof is „the RPC refuses" is asserted here
 * against the migration SOURCE (the same static-scan discipline the billing
 * platform uses), and a scenario whose proof is a pure decision is asserted
 * against that decision. Scenarios that genuinely need a live Postgres and a
 * real Stripe event are listed at the bottom as EXPLICITLY NOT COVERED HERE,
 * with what would prove them — rather than being quietly implied by a green
 * suite.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decideShareAttribution } from './domain/partnerShareAttribution';
import { resolveLineage } from './domain/lineage';
import { rankSubjects, scorePublication } from './domain/ranking';
import { toDemoSafeRecipe, findDemoLeaks } from './domain/demoSafeRecipe';
import { postCheckoutDestination, checkoutReturnUrls } from './domain/shareContinuation';
import { isCommunityContent, visibilityOf, robotsPolicyFor } from './domain/visibility';

const SQL = readFileSync(
  resolve(
    import.meta.dirname,
    '../../../supabase/migrations/20260823140000_community_creators_sharing_v1.sql',
  ),
  'utf8',
).replace(/\r\n?/g, '\n');

/** The body of one SQL function, for behaviour-level assertions. */
const fn = (name: string): string =>
  SQL.split(`create or replace function public.${name}`)[1]?.split('\n$$;')[0] ?? '';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 7, 1);

describe('A (§64) — creator publication binds an immutable version', () => {
  it('publishing proves ownership against the version row, not the mutable recipe', () => {
    const publish = fn('gellatti_publish_recipe_v1');
    expect(publish).toContain('from public.recipe_versions');
    expect(publish).toContain('owner_user_id = v_uid');
    expect(publish).toContain('recipe_version_not_found');
  });

  it('A.8 — publishing V2 cannot mutate the public V1', () => {
    // A publication points at recipe_version_id and republishing the SAME
    // version is idempotent; a DIFFERENT version is a different row, guarded
    // by a partial unique index on the live version.
    expect(SQL).toContain('community_publications_version_live_uniq');
    expect(fn('gellatti_publish_recipe_v1')).toContain('where recipe_version_id = v_version.id');
  });

  it('A.7 — a private recipe stays protected; publication requires a Creator profile', () => {
    expect(fn('gellatti_publish_recipe_v1')).toContain('creator_profile_required');
    expect(visibilityOf({ hasActiveShare: false, hasLivePublication: false })).toBe('private');
  });
});

describe('B (§65) — using a Community recipe counts once', () => {
  it('B.6 — the usage event is idempotent per derived recipe', () => {
    expect(SQL).toContain('derived_recipe_id uuid unique');
    expect(fn('gellatti_record_derivation_v1')).toContain(
      'on conflict (derived_recipe_id) do nothing',
    );
  });

  it('B.4 — the original is never mutated: the derivation only writes lineage + event', () => {
    const derive = fn('gellatti_record_derivation_v1');
    expect(derive).not.toMatch(/update\s+public\.saved_recipes/i);
    expect(derive).not.toMatch(/update\s+public\.recipe_versions/i);
    expect(derive).not.toMatch(/update\s+public\.community_publications/i);
  });

  it('B.5 — source attribution is preserved on the derived recipe', () => {
    expect(fn('gellatti_record_derivation_v1')).toContain('insert into public.recipe_lineage');
  });
});

describe('C (§66) — remix lineage', () => {
  const remix = resolveLineage({
    derivedRecipeId: 'recipe-jan',
    derivedUserId: 'user-jan',
    relation: 'remix',
    parentPublicationId: 'pub-marysia',
    parentRecipeVersionId: 'version-marysia-v1',
    parentCreatorUserId: 'user-marysia',
    parentRecipeId: 'recipe-marysia',
  });

  it('C.3/C.4 — Jan is the remix creator; Marysia stays the source creator', () => {
    expect(remix.ok).toBe(true);
    if (!remix.ok) return;
    expect(remix.stamp.derivedUserId).toBe('user-jan');
    expect(remix.stamp.rootCreatorUserId).toBe('user-marysia');
  });

  it('C.6/C.7 — parent and root are correct and cycles are refused', () => {
    expect(remix.ok && remix.stamp.depth).toBe(1);
    expect(
      resolveLineage({
        derivedRecipeId: 'recipe-marysia',
        derivedUserId: 'user-jan',
        relation: 'remix',
        parentPublicationId: 'pub-marysia',
        parentRecipeVersionId: 'v',
        parentCreatorUserId: 'user-marysia',
        parentRecipeId: 'recipe-marysia',
      }),
    ).toEqual({ ok: false, reason: 'circular_lineage' });
    expect(fn('gellatti_record_derivation_v1')).toContain('circular_lineage');
  });
});

describe('D (§67) — a non-customer opens a direct share', () => {
  it('D.7/D.8 — the Demo body is the projection; exact grams are absent SERVER-side', () => {
    const resolver = fn('gellatti_resolve_share_v1');
    expect(resolver).toContain('gellatti_demo_safe_projection_v1');
    expect(resolver).not.toContain('v_version.recipe_input,');
    expect(findDemoLeaks(toDemoSafeRecipe({ items: [{ planned_grams: 512 }] }))).toEqual([]);
  });

  it('D.6 — opening files the recipe under „Udostępnione mi"', () => {
    expect(fn('gellatti_open_share_v1')).toContain(
      'insert into public.recipe_share_recipients',
    );
  });

  it('D.9 — the creator is named on the share, even to a logged-out visitor', () => {
    expect(fn('gellatti_resolve_share_v1')).toContain("'created_by'");
  });

  it('D.5 — the exact share survives authentication', () => {
    const { successUrl } = checkoutReturnUrls('https://gellatti.com', {
      kind: 'share',
      token: 'kJ8s-Zq2_1aBcDeFgHiJkLmNoPqRsTuV',
    });
    expect(postCheckoutDestination(new URL(successUrl).search, 'success')).toBe(
      '/share/kJ8s-Zq2_1aBcDeFgHiJkLmNoPqRsTuV',
    );
  });
});

describe('E (§68) — Demo security', () => {
  it('every door to a formulation checks entitlement, and none is open to anon', () => {
    for (const door of [
      'gellatti_open_share_v1',
      'gellatti_open_received_share_v1',
      'gellatti_get_publication_full_v1',
    ]) {
      expect(fn(door), door).toContain('gellatti_has_paid_access_v1');
      expect(
        new RegExp(`grant execute on function public\\.${door}[^;]*to anon`).test(SQL),
        door,
      ).toBe(false);
    }
  });

  it('there is no alternative endpoint: no table grant exposes recipe_versions', () => {
    expect(/grant[^;]*on public\.recipe_versions/i.test(SQL)).toBe(false);
  });

  it('a manipulated frontend cannot change the branch — it runs in the database', () => {
    const opener = fn('gellatti_open_share_v1');
    expect(opener).toContain('v_entitled := public.gellatti_has_paid_access_v1(v_uid);');
    // No parameter can influence it: the only parameter is the token.
    expect(SQL).toContain('create or replace function public.gellatti_open_share_v1(p_token text)');
  });
});

describe('F (§69) — subscription conversion returns to THE recipe', () => {
  it('F.6 — a successful checkout lands back on the exact share, not a dashboard', () => {
    const { successUrl } = checkoutReturnUrls('https://gellatti.com', {
      kind: 'publication',
      handle: 'marysia',
      slug: 'pistachio-salted-caramel',
    });
    expect(postCheckoutDestination(new URL(successUrl).search, 'success')).toBe(
      '/@marysia/pistachio-salted-caramel',
    );
  });

  it('F.7 — after payment the entitled branch opens automatically on the next read', () => {
    expect(fn('gellatti_open_share_v1')).toContain("'entitlement', 'full'");
  });
});

describe('G (§70) — an existing paid recipient sees no paywall', () => {
  it('an entitled caller receives the full payload from the same call', () => {
    const opener = fn('gellatti_open_share_v1');
    expect(opener).toContain("'recipe_input', v_version.recipe_input");
    expect(opener).toContain('if v_entitled then');
  });
});

describe('H (§71) — the received library', () => {
  it('H.5 — removing hides the recipient row only; nothing is deleted', () => {
    expect(SQL).toContain('removed_by_recipient boolean not null default false');
    const policy = /create policy recipe_share_recipients_update_own[\s\S]*?;/.exec(SQL)?.[0] ?? '';
    expect(policy).toContain('auth.uid() = recipient_user_id');
    expect(/grant[^;]*delete[^;]*on public\.recipe_share_recipients/i.test(SQL)).toBe(false);
    expect(fn('gellatti_list_received_shares_v1')).toContain('not r.removed_by_recipient');
  });

  it('H.4 — Demo vs unlocked state is resolved server-side per recipient', () => {
    expect(fn('gellatti_list_received_shares_v1')).toContain(
      'public.gellatti_has_paid_access_v1(auth.uid())',
    );
  });
});

describe('I (§72) — share revocation', () => {
  it('I.4 — a revoked link denies new access through every entry point', () => {
    expect(fn('gellatti_resolve_share_v1')).toContain("v_link.status <> 'active'");
    expect(fn('gellatti_open_received_share_v1')).toContain("v_link.status <> 'active'");
  });

  it('I.5 — an already-made independent copy is untouched by a revoke', () => {
    // Revocation flips a status on recipe_share_links. Nothing cascades to
    // saved_recipes or recipe_lineage.
    const policy = /create policy recipe_share_links_revoke_own[\s\S]*?;/.exec(SQL)?.[0] ?? '';
    expect(policy).toContain("status = 'revoked'");
    expect(/delete\s+from\s+public\.saved_recipes/i.test(SQL)).toBe(false);
    expect(/delete\s+from\s+public\.recipe_lineage/i.test(SQL)).toBe(false);
  });
});

describe('J (§73) — Partner shares their OWN recipe', () => {
  it('creator, sharer and partner all resolve to Marysia — attributed once', () => {
    expect(
      decideShareAttribution({
        shareJourney: {
          partnerId: 'partner-marysia',
          partnerUserId: 'user-marysia',
          partnerStatusNow: 'active',
          shareLinkId: 'share-1',
          openedAtUtcMs: T0,
        },
        subjectUserId: 'user-katarzyna',
        paymentAtUtcMs: T0 + DAY,
      }),
    ).toEqual({ attributed: true, partnerId: 'partner-marysia', source: 'share_journey' });
  });

  it('creator metrics move on a different code path from commission', () => {
    // Two different functions, two different tables. Neither reads the other.
    expect(fn('gellatti_recompute_creator_metrics_v1')).not.toMatch(/commission|partner/i);
    expect(fn('gellatti_partner_dashboard_v1')).not.toMatch(/creator_metrics/i);
  });
});

describe('K (§74) — Partner shares ANOTHER creator\'s recipe', () => {
  it('Jan earns the commission', () => {
    expect(
      decideShareAttribution({
        shareJourney: {
          partnerId: 'partner-jan',
          partnerUserId: 'user-jan',
          partnerStatusNow: 'active',
          shareLinkId: 'share-1',
          openedAtUtcMs: T0,
        },
        subjectUserId: 'user-katarzyna',
        paymentAtUtcMs: T0 + DAY,
      }),
    ).toMatchObject({ attributed: true, partnerId: 'partner-jan' });
  });

  it('and Jan does NOT become the author — the share stamps the ORIGINAL creator', () => {
    const create = fn('gellatti_create_share_link_v1');
    expect(create).toContain('root_creator_user_id');
    expect(create).toContain('v_creator_user_id');
    // creator_user_id and shared_by_user_id are separate columns on the link.
    expect(SQL).toContain('creator_user_id uuid not null references auth.users (id) on delete restrict');
    expect(SQL).toContain('shared_by_user_id uuid not null references auth.users (id) on delete cascade');
  });
});

describe('L (§75) — the Partner link survives the whole journey, once', () => {
  it('attribution is a DB row keyed to the user, not a fragile URL parameter', () => {
    const opener = fn('gellatti_open_share_v1');
    expect(opener).toContain('insert into public.referral_attributions');
    expect(opener).toContain("'pending'");
  });

  it('L.10 — only one attribution is ever created for a user', () => {
    expect(fn('gellatti_open_share_v1')).toContain(
      'if not exists (select 1 from public.referral_attributions ra where ra.user_id = v_uid)',
    );
  });

  it('the precedence policy yields exactly one partner even with stacked evidence', () => {
    const decision = decideShareAttribution({
      explicitCode: {
        partnerId: 'p-code',
        partnerUserId: 'u-code',
        enteredAtUtcMs: T0,
        codeValid: true,
      },
      shareJourney: {
        partnerId: 'p-share',
        partnerUserId: 'u-share',
        partnerStatusNow: 'active',
        shareLinkId: 's',
        openedAtUtcMs: T0,
      },
      storedReferral: { partnerId: 'p-cookie', partnerUserId: 'u-cookie', clickedAtUtcMs: T0 },
      subjectUserId: 'user-katarzyna',
      paymentAtUtcMs: T0 + DAY,
    });
    expect(decision).toEqual({ attributed: true, partnerId: 'p-code', source: 'explicit_code' });
  });
});

describe('M (§76) — an explicitly entered Partner code', () => {
  it('an explicit valid code outranks a passive stored referral', () => {
    expect(
      decideShareAttribution({
        explicitCode: {
          partnerId: 'p-code',
          partnerUserId: 'u-code',
          enteredAtUtcMs: T0,
          codeValid: true,
        },
        storedReferral: { partnerId: 'p-cookie', partnerUserId: 'u-cookie', clickedAtUtcMs: T0 },
        subjectUserId: 'user-katarzyna',
        paymentAtUtcMs: T0 + DAY,
      }),
    ).toEqual({ attributed: true, partnerId: 'p-code', source: 'explicit_code' });
  });

  it('an invalid code attributes nobody rather than falling back silently', () => {
    expect(
      decideShareAttribution({
        explicitCode: {
          partnerId: 'p-code',
          partnerUserId: 'u-code',
          enteredAtUtcMs: T0,
          codeValid: false,
        },
        subjectUserId: 'user-katarzyna',
        paymentAtUtcMs: T0 + DAY,
      }),
    ).toEqual({ attributed: false, reason: 'invalid_code' });
  });
});

describe('O (§78) — anti-fraud', () => {
  it('a partner id can never come from the frontend', () => {
    const signatures = SQL.match(/create or replace function public\.[a-z0-9_]+\([^)]*\)/g) ?? [];
    const leaky = signatures.filter(
      (signature) =>
        /p_partner_id/.test(signature) &&
        !/gellatti_partner_is_active_v1|gellatti_active_partner_for_user_v1/.test(signature),
    );
    expect(leaky).toEqual([]);
  });

  it('a user cannot award themselves a commission client-side', () => {
    // No commission table is created here, and no client grant touches the
    // existing ledger from this migration.
    expect(/create table if not exists public\.[a-z_]*commission/i.test(SQL)).toBe(false);
    expect(/grant[^;]*on public\.commission_entries/i.test(SQL)).toBe(false);
    expect(/grant[^;]*on public\.referral_attributions/i.test(SQL)).toBe(false);
  });

  it('a refresh cannot duplicate a recipe use', () => {
    expect(fn('gellatti_record_derivation_v1')).toContain(
      'on conflict (derived_recipe_id) do nothing',
    );
  });

  it('self-referral earns nothing, in the domain AND in the RPC', () => {
    expect(
      decideShareAttribution({
        shareJourney: {
          partnerId: 'p',
          partnerUserId: 'u-self',
          partnerStatusNow: 'active',
          shareLinkId: 's',
          openedAtUtcMs: T0,
        },
        subjectUserId: 'u-self',
        paymentAtUtcMs: T0 + DAY,
      }),
    ).toEqual({ attributed: false, reason: 'self_referral' });
    expect(fn('gellatti_open_share_v1')).toContain('v_link.shared_by_user_id <> v_uid');
  });

  it('a suspended Partner stops generating new eligible attributions', () => {
    expect(
      decideShareAttribution({
        shareJourney: {
          partnerId: 'p',
          partnerUserId: 'u-jan',
          partnerStatusNow: 'suspended',
          shareLinkId: 's',
          openedAtUtcMs: T0,
        },
        subjectUserId: 'user-katarzyna',
        paymentAtUtcMs: T0 + DAY,
      }),
    ).toEqual({ attributed: false, reason: 'partner_not_active' });
    expect(fn('gellatti_open_share_v1')).toContain('gellatti_partner_is_active_v1');
  });
});

describe('§79 — ranking', () => {
  it('genuine makes outrank raw reach, and 3 perfect ratings do not beat hundreds of makes', () => {
    expect(
      scorePublication({
        unique_makers: 120,
        total_makes: 300,
        remix_count: 0,
        unique_users: 0,
        rating_count: 0,
        rating_sum: 0,
        makes_last_7d: 0,
      }),
    ).toBeGreaterThan(
      scorePublication({
        unique_makers: 3,
        total_makes: 3,
        remix_count: 0,
        unique_users: 200,
        rating_count: 3,
        rating_sum: 15,
        makes_last_7d: 0,
      }),
    );
  });

  it('recomputation is stable and unpublishing removes the ranking entry', () => {
    const subjects = [
      {
        id: 'a',
        publishedAt: '2026-08-01T00:00:00Z',
        components: {
          unique_makers: 4,
          total_makes: 4,
          remix_count: 0,
          unique_users: 0,
          rating_count: 0,
          rating_sum: 0,
          makes_last_7d: 0,
        },
      },
    ];
    expect(rankSubjects(subjects)).toEqual(rankSubjects(subjects));
    expect(fn('gellatti_unpublish_v1')).toContain('delete from public.ranking_snapshots');
  });
});

describe('§11 — direct sharing never publishes', () => {
  it('an unlisted share is not Community content and is noindex', () => {
    const visibility = visibilityOf({ hasActiveShare: true, hasLivePublication: false });
    expect(isCommunityContent(visibility)).toBe(false);
    expect(robotsPolicyFor('direct_share')).toBe('noindex,nofollow');
  });

  it('creating a share writes NO publication row', () => {
    expect(fn('gellatti_create_share_link_v1')).not.toMatch(
      /insert into public\.community_publications/i,
    );
  });

  it('the discovery reader only ever returns published rows', () => {
    for (const reader of [
      'gellatti_list_community_v1',
      'gellatti_search_community_v1',
      'gellatti_publication_card_v1',
    ]) {
      expect(fn(reader), reader).toContain("status = 'published'");
    }
  });
});

/**
 * EXPLICITLY NOT COVERED BY THIS SUITE — each needs a live Postgres and, for
 * the money paths, a real Stripe event. Listed so a green run is not mistaken
 * for end-to-end proof:
 *
 *   N (§77) REFUND REVERSAL — a Partner-attributed subscription refunded or
 *     charged back must reverse its commission exactly once. The reversal
 *     logic already exists and is unit-tested in
 *     `src/billing/domain/refundAdjustments.test.ts`; what is unproven here is
 *     the live webhook wiring end-to-end.
 *   O (§78) WEBHOOK RETRY IDEMPOTENCY — proven structurally by the unique keys
 *     (`stripe_webhook_events`, `commission_entries` duplicate key) but not
 *     exercised against a real duplicate delivery.
 *   RLS ENFORCEMENT — every cross-account rule here is asserted against the
 *     policy SOURCE. Running them as a second authenticated user against a
 *     live database is the remaining step.
 *   §41 CONFIRMED MAKE END-TO-END — needs a real completed production run.
 */
