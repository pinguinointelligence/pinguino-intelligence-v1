import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseINTIMPORT } from '@/data/products/intimport';
import { runIntimportLocalIntelligence } from '../intimportIntelligence';

const FILE = join(homedir(), 'Desktop', 'PL_Poland.csv');

describe.runIf(existsSync(FILE))('Full 820 offline research plan', () => {
  it('plans every row without a single external call', () => {
    const parsed = parseINTIMPORT(readFileSync(FILE, 'utf8'));
    const { rows } = runIntimportLocalIntelligence(parsed.candidates);

    const firstStep: Record<string, number> = {};
    const authority: Record<string, number> = {};
    let officialPrimary = 0, technicalPdf = 0, knownDomain = 0, retailerStrongest = 0;
    let normal = 0, technical = 0, officialFirst = 0, needsResearch = 0;

    for (const r of rows) {
      authority[r.sourceAuthority.authority] = (authority[r.sourceAuthority.authority] ?? 0) + 1;
      if (r.kind === 'technical') technical += 1; else normal += 1;
      if (['OFFICIAL_MANUFACTURER','OFFICIAL_BRAND','OFFICIAL_TECHNICAL_PDF'].includes(r.sourceAuthority.authority)) officialPrimary += 1;
      if (r.researchIdentity.technicalPdfUrl) technicalPdf += 1;
      if (r.researchPlan.officialDomain) knownDomain += 1;
      if (r.sourceAuthority.authority === 'AUTHORITATIVE_RETAILER') retailerStrongest += 1;
      if (r.enrichmentTargets.length === 0) continue;
      needsResearch += 1;
      const k = r.researchPlan.steps[0]!.kind;
      firstStep[k] = (firstStep[k] ?? 0) + 1;
      if (['OWNER_TECHNICAL_PDF','OWNER_OFFICIAL_URL','OFFICIAL_DOMAIN_SEARCH'].includes(k)) officialFirst += 1;
    }

    console.log('PLAN ' + JSON.stringify({
      rows: rows.length, needsResearch, normal, technical,
      officialPrimarySourceRows: officialPrimary, technicalPdfRows: technicalPdf,
      knownOfficialDomainRows: knownDomain, retailerStrongestRows: retailerStrongest,
      firstStepDistribution: firstStep,
      officialFirstShare: `${((officialFirst / Math.max(1, needsResearch)) * 100).toFixed(1)}%`,
      sourceAuthorities: authority,
    }, null, 2));

    // Comprital audit
    const comp = rows.filter((r) => (r.researchIdentity.brand ?? '').toLowerCase() === 'comprital');
    const s = (r: (typeof comp)[number], f: string) => r.evidence.fields[f as never] !== undefined;
    console.log('COMPRITAL ' + JSON.stringify({
      total: comp.length,
      officialSource: comp.filter((r) => r.researchPlan.officialDomain !== null).length,
      technicalPdf: comp.filter((r) => r.researchIdentity.technicalPdfUrl).length,
      dosagePresent: comp.filter((r) => s(r, 'dosage')).length,
      dosageMissing: comp.filter((r) => !s(r, 'dosage')).length,
      ingredientsMissing: comp.filter((r) => !s(r, 'ingredients')).length,
      nutritionMissing: comp.filter((r) => !s(r, 'energyKcal')).length,
      productBehaviorMissing: comp.filter((r) => r.assessment.technicalBlocked).length,
      startsOfficial: comp.filter((r) => r.enrichmentTargets.length > 0 &&
        ['OWNER_TECHNICAL_PDF','OWNER_OFFICIAL_URL','OFFICIAL_DOMAIN_SEARCH'].includes(r.researchPlan.steps[0]!.kind)).length,
      startsRetailerOrOpen: comp.filter((r) => r.enrichmentTargets.length > 0 &&
        ['RETAILER_SEARCH','OPEN_WEB_SEARCH'].includes(r.researchPlan.steps[0]!.kind)).length,
    }, null, 2));

    expect(rows.length).toBe(820);
  });
});
