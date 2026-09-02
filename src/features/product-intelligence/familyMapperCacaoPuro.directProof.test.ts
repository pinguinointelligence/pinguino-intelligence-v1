import { describe, expect, it } from 'vitest';
import { loadMapperKnowledgeRows } from './__dryrun__/mapperFixture';
import { buildMapperKnowledge } from './mapperValueInference';
import { resolveProductWorkingValues } from './productWorkingValues';

/**
 * Direct Family Mapper proof for a commercial defatted cocoa powder.
 * This is not a catalogue fixture: no canonical product is created, and neither
 * moisture field exists anywhere in the supplied product input.
 */
describe('Family Mapper direct proof — generic defatted cocoa powder', () => {
  it('infers water from the nearest cocoa profile and derives solids from that water', () => {
    const mapper = loadMapperKnowledgeRows();
    const knowledge = buildMapperKnowledge(mapper.rows, mapper.fingerprint);

    const suppliedProfile = {
      ean: '8410109121551',
      name: 'La Chocolatera Cacao Puro',
      family: 'chocolate / cocoa',
      form: 'POWDER / odtłuszczone kakao w proszku',
      per100g: {
        fat_percent: 16.0,
        carbohydrate_percent: 16.3,
        total_sugars_percent: 0.7,
        protein_percent: 25.5,
        fiber_percent: 31.7,
      },
      special: ['cocoa butter: 16%', 'defatted cocoa powder', '0% added sugars'],
    } as const;

    expect('water_percent' in suppliedProfile.per100g).toBe(false);
    expect('total_solids_percent' in suppliedProfile.per100g).toBe(false);

    const resolved = resolveProductWorkingValues(
      {
        declared: suppliedProfile.per100g,
        declaredConfidence: 0.95,
        identity: {
          barcode: suppliedProfile.ean,
          name: suppliedProfile.name,
          category: suppliedProfile.family,
          variant: `${suppliedProfile.form} · defatted cocoa powder · 0% added sugars`,
          subcategory: suppliedProfile.form,
        },
        technical: false,
      },
      knowledge,
    );
    const profileMatch = resolved.profileMatch;
    expect(profileMatch).not.toBeNull();
    if (!profileMatch) throw new Error('Family Mapper did not return a profile match');

    const proof = {
      family: profileMatch.family,
      profileMatch: {
        basis: profileMatch.basis,
        confidence: profileMatch.confidence,
        references: profileMatch.references,
        reasons: profileMatch.reasons,
        rejected: profileMatch.rejected,
      },
      matchedAuthority: profileMatch.rows.map((row) => ({
        ingredient_id: row.ingredient_id,
        name: row.ingredient_name_display ?? row.ingredient_name_internal,
        category: row.ingredient_category,
        subcategory: row.ingredient_subcategory,
        water_percent: row.water_percent,
        total_solids_percent: row.total_solids_percent,
      })),
      water_percent: resolved.fields.water_percent,
      total_solids_percent: resolved.fields.total_solids_percent,
      missingEngineFields: resolved.missingEngineFields,
      criticalPhysicsBlockers: resolved.criticalPhysicsBlockers,
      mapperTiersUsed: resolved.mapperTiersUsed,
      trace: resolved.trace,
    };

    console.info(`CACAO_PURO_DIRECT_PROOF=${JSON.stringify(proof, null, 2)}`);

    expect(profileMatch).toMatchObject({
      family: 'chocolate',
      basis: 'neighbour_set',
      confidence: 0.94,
      rejected: null,
    });
    expect(profileMatch.references).toEqual(['PI-ING-001579', 'PI-ING-001670', 'PI-ING-001313']);
    expect(profileMatch.reasons).toContain('podobienstwo makro 0.7753');
    expect(profileMatch.rows.map((row) => row.ingredient_subcategory)).toEqual([
      'cocoa_powder',
      'low_fat_cocoa_powder',
      'cocoa_powder',
    ]);
    expect(profileMatch.rows[0]).toMatchObject({
      ingredient_id: 'PI-ING-001579',
      ingredient_name_display: 'DEFATTED COCOA 12% · Cocoa Powder',
    });
    expect(resolved.mapperTiersUsed).toContain('mapper_similar_profile');
    expect(resolved.mapperTiersUsed).not.toContain('mapper_exact');
    expect(profileMatch.basis).not.toBe('gtin_identity');

    const water = resolved.fields.water_percent;
    expect(water).toMatchObject({
      value: 0,
      provenance: {
        state: 'ESTIMATED',
        confidence: 0.94,
        basis: 'mapper_similar_profile',
        mapperReferences: ['PI-ING-001579'],
        algorithmVersion: 'mapper-first-v1',
        mapperFingerprint: mapper.fingerprint,
      },
    });

    const solids = resolved.fields.total_solids_percent;
    expect(solids).toMatchObject({
      value: 100,
      provenance: {
        state: 'ESTIMATED',
        confidence: 0.94,
        basis: 'derived',
        mapperReferences: ['PI-ING-001579'],
        algorithmVersion: 'mapper-first-v1',
        mapperFingerprint: mapper.fingerprint,
        note: '100 − water_percent',
      },
    });
    expect(solids.provenance.mapperReferences).toEqual(water.provenance.mapperReferences);
    expect(solids.provenance.mapperFingerprint).toBe(water.provenance.mapperFingerprint);
    expect(solids.provenance.confidence).toBe(water.provenance.confidence);
    expect(solids.value).toBe(100 - water.value!);
    expect(resolved.trace).toContain('derived: total_solids_percent = 100 − water_percent');

    expect(resolved.missingEngineFields).not.toContain('water_percent');
    expect(resolved.missingEngineFields).not.toContain('total_solids_percent');
    expect(resolved.criticalPhysicsBlockers).not.toContain('MISSING_WATER_PERCENT');
    expect(resolved.criticalPhysicsBlockers).not.toContain('MISSING_TOTAL_SOLIDS_PERCENT');
  });
});
