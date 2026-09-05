import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OWNER_GUIDE_ASSET_SHA256, knowledgeTourSteps } from './knowledgeTourModel';

describe('Owner Knowledge Tour source contract', () => {
  it('uses eight steps with the shared seven-step story and the correct audience ending', () => {
    const home = knowledgeTourSteps('home');
    const pro = knowledgeTourSteps('pro');

    expect(home).toHaveLength(8);
    expect(pro).toHaveLength(8);
    expect(home.slice(0, 7).map((step) => step.ownerAsset)).toEqual(
      pro.slice(0, 7).map((step) => step.ownerAsset),
    );
    expect(home.map((step) => step.ownerAsset)).toEqual([
      '01.png',
      '02.png',
      '03.png',
      '04.png',
      '05.png',
      '06.png',
      '07.png',
      '08.png',
    ]);
    expect(pro.at(-1)?.ownerAsset).toBe('09.png');
  });

  it('keeps every supplied Owner PNG byte-for-byte unchanged', () => {
    for (const [fileName, expectedSha256] of Object.entries(OWNER_GUIDE_ASSET_SHA256)) {
      const bytes = readFileSync(resolve(process.cwd(), 'public', 'guide', fileName));
      expect(createHash('sha256').update(bytes).digest('hex'), fileName).toBe(expectedSha256);
    }
  });

  it('binds every label rail directly to its visual column, including all temperatures', () => {
    const steps = knowledgeTourSteps('home');
    expect(steps[2]?.annotations.map((item) => item.id)).toEqual([
      'sucrose',
      'dextrose',
      'fructose',
    ]);
    expect(steps[6]?.annotations.map((item) => item.id)).toEqual([
      'minus-11',
      'minus-12',
      'minus-13',
    ]);
    expect(steps[3]?.annotationLayout).toBe('ingredient-chain');
    expect(knowledgeTourSteps('pro')[7]?.annotationLayout).toBe('pro-process');
  });
});
