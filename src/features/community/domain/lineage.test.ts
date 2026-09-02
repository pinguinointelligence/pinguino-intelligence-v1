import { describe, expect, it } from 'vitest';
import {
  MAX_LINEAGE_DEPTH,
  attributionLine,
  resolveLineage,
  sourceLabel,
  type DerivationRequest,
} from './lineage';

const MARYSIA = 'user-marysia';
const JAN = 'user-jan';
const KATARZYNA = 'user-katarzyna';

const request = (over: Partial<DerivationRequest> = {}): DerivationRequest => ({
  derivedRecipeId: 'recipe-derived',
  derivedUserId: JAN,
  relation: 'remix',
  parentPublicationId: 'pub-marysia-v1',
  parentRecipeVersionId: 'version-marysia-v1',
  parentCreatorUserId: MARYSIA,
  parentRecipeId: 'recipe-marysia',
  ...over,
});

describe('§66 — remix lineage', () => {
  it('a depth-1 remix records Marysia as both parent and root creator', () => {
    const decision = resolveLineage(request());
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.stamp).toMatchObject({
      relation: 'remix',
      derivedUserId: JAN,
      parentCreatorUserId: MARYSIA,
      rootCreatorUserId: MARYSIA,
      rootPublicationId: 'pub-marysia-v1',
      depth: 1,
    });
  });

  it('binds the IMMUTABLE version, so a later V2 cannot rewrite what it came from (§5)', () => {
    const decision = resolveLineage(request());
    expect(decision.ok && decision.stamp.parentRecipeVersionId).toBe('version-marysia-v1');
  });

  it('a remix OF a remix still names MARYSIA as root — authorship travels down', () => {
    const decision = resolveLineage(
      request({
        derivedUserId: KATARZYNA,
        parentPublicationId: 'pub-jan-remix',
        parentCreatorUserId: JAN,
        parentRecipeId: 'recipe-jan',
        parentLineage: {
          rootPublicationId: 'pub-marysia-v1',
          rootCreatorUserId: MARYSIA,
          depth: 1,
        },
      }),
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.stamp.parentCreatorUserId).toBe(JAN);
    expect(decision.stamp.rootCreatorUserId).toBe(MARYSIA);
    expect(decision.stamp.rootPublicationId).toBe('pub-marysia-v1');
    expect(decision.stamp.depth).toBe(2);
  });

  it('refuses circular lineage', () => {
    expect(resolveLineage(request({ parentRecipeId: 'recipe-derived' }))).toEqual({
      ok: false,
      reason: 'circular_lineage',
    });
  });

  it('refuses a source-less derivation and an over-deep chain', () => {
    expect(
      resolveLineage(request({ parentPublicationId: null, parentShareLinkId: null })),
    ).toEqual({ ok: false, reason: 'source_required' });
    expect(
      resolveLineage(
        request({
          parentLineage: { rootPublicationId: 'p', rootCreatorUserId: MARYSIA, depth: MAX_LINEAGE_DEPTH },
        }),
      ),
    ).toEqual({ ok: false, reason: 'lineage_too_deep' });
  });

  it('a direct-share derivation credits the share, not a publication', () => {
    const decision = resolveLineage(
      request({ relation: 'copy', parentPublicationId: null, parentShareLinkId: 'share-1' }),
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.stamp.parentShareLinkId).toBe('share-1');
    expect(decision.stamp.parentPublicationId).toBeNull();
    expect(decision.stamp.rootCreatorUserId).toBe(MARYSIA);
  });
});

describe('§22 — attribution cannot be removed', () => {
  it('a remix line ALWAYS names its source; the type cannot express one without', () => {
    const line = attributionLine({
      creatorDisplayName: 'Jan',
      parent: { title: 'Pistachio Salted Caramel', creatorDisplayName: 'Marysia' },
    });
    expect(line).toEqual({
      kind: 'remix',
      creatorDisplayName: 'Jan',
      basedOnTitle: 'Pistachio Salted Caramel',
      basedOnCreatorDisplayName: 'Marysia',
    });
  });

  it('an original recipe has no „based on" clause to strip', () => {
    expect(attributionLine({ creatorDisplayName: 'Marysia', parent: null })).toEqual({
      kind: 'original',
      creatorDisplayName: 'Marysia',
    });
  });
});

describe('§53/§55 — an unavailable source degrades, it never breaks a derived recipe', () => {
  it('labels an unpublished source honestly', () => {
    expect(sourceLabel('available', 'Marysia')).toBe('Marysia');
    expect(sourceLabel('unpublished', 'Marysia')).toBe('Marysia (receptura wycofana)');
    expect(sourceLabel('creator_unavailable', 'Marysia')).toBe('Twórca niedostępny');
    expect(sourceLabel('available', null)).toBe('Twórca niedostępny');
  });
});
