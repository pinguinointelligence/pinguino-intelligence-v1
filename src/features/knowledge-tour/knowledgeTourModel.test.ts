import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OWNER_GUIDE_ASSET_SHA256,
  knowledgeTourSteps,
  projectKnowledgeTourAnchor,
} from './knowledgeTourModel';

describe('Owner Knowledge Tour source contract', () => {
  it('uses one canonical nine-step story for every shell mode', () => {
    const steps = knowledgeTourSteps();

    expect(steps).toHaveLength(9);
    expect(steps.map((step) => step.ownerAsset)).toEqual([
      '01.png',
      '02.png',
      '03.png',
      '04.png',
      '05.png',
      '06.png',
      '07.png',
      '08.png',
      '09.png',
    ]);
    expect(steps[7]?.id).toBe('home-machines');
    expect(steps[8]?.id).toBe('professional-production');
  });

  it('keeps every supplied Owner PNG byte-for-byte unchanged', () => {
    for (const [fileName, expectedSha256] of Object.entries(OWNER_GUIDE_ASSET_SHA256)) {
      const bytes = readFileSync(resolve(process.cwd(), 'public', 'guide', fileName));
      expect(createHash('sha256').update(bytes).digest('hex'), fileName).toBe(expectedSha256);
    }
  });

  it('locks all labels to normalized image-coordinate anchors', () => {
    const steps = knowledgeTourSteps();
    const expected = [
      ['gelato', 'sorbet', 'vegan', 'protein'],
      ['hard', 'balanced', 'soft'],
      ['sucrose', 'dextrose', 'fructose'],
      ['milk', 'cream', 'milk-powder', 'inulin', 'result'],
      ['strawberry', 'banana', 'pistachio', 'chocolate'],
      ['without', 'with'],
      ['minus-11', 'minus-12', 'minus-13'],
      ['frozen-container', 'frozen-soft', 'compressor', 'frozen-bowl'],
      ['machine', 'product', 'serving'],
    ];

    expect(steps.map((step) => step.annotations.map((item) => item.id))).toEqual(expected);
    for (const step of steps) {
      expect(step.annotations.every((item) => item.anchorX > 0 && item.anchorX < 1)).toBe(true);
      expect(step.annotations.map((item) => item.anchorX)).toEqual(
        [...step.annotations].map((item) => item.anchorX).sort((a, b) => a - b),
      );
    }
  });

  it('projects normalized anchors proportionally at any rendered image size', () => {
    expect(projectKnowledgeTourAnchor(120, 1000, 0.25)).toBe(370);
    expect(projectKnowledgeTourAnchor(40, 520, 0.25)).toBe(170);
    expect(projectKnowledgeTourAnchor(0, 800, 0.82)).toBe(656);
  });

  it('uses the exact Owner copy for sucrose, gellattissimo and temperatures', () => {
    const steps = knowledgeTourSteps();
    expect(steps[2]?.annotations[0]?.title).toBe('Cukier (sacharoza)');
    expect(steps[3]?.annotations.at(-1)?.title).toBe('gellattissimo!');
    expect(steps[6]?.annotations.map((item) => item.title)).toEqual(['−11°C', '−12°C', '−13°C']);
  });

  it('applies the visual blend in CSS while asset hashes remain the source authority', () => {
    const styles = readFileSync(
      resolve(process.cwd(), 'src/features/knowledge-tour/KnowledgeTour.css'),
      'utf8',
    );
    expect(styles).toContain('-webkit-mask-image:');
    expect(styles).toContain('mask-image:');
    expect(styles).toContain('.knowledge-tour__artwork::after');
  });
});
