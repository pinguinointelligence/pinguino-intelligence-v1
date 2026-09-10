import { describe, expect, it } from 'vitest';
import type { LiveIdentifyResponse } from '@/services/productScanner';
import {
  HOME_VISION_MIN_CONFIDENCE,
  decideVisionOutcome,
  isConfidentFruit,
} from './homeVisionRecognition';

const answer = (over: Partial<LiveIdentifyResponse> = {}): LiveIdentifyResponse => ({
  status: 'RESOLVED',
  identity: { name: 'banana', brand: null, variant: null },
  confidence: 0.92,
  evidenceType: 'VISUAL',
  kind: 'FRESH_PRODUCE',
  resolution: { productId: 'PI-ING-000101', displayName: 'BANAN', brand: null },
  usage: { visionCalls: 1, estimatedCostUsd: 0.001 },
  ...over,
});

describe('§30 — AI Vision v1 accepts fruit the catalogue can name, and nothing else', () => {
  it('accepts a confident fresh-produce answer the catalogue resolved', () => {
    expect(isConfidentFruit(answer())).toBe(true);
    expect(decideVisionOutcome([answer()])).toEqual({ kind: 'recognised', names: ['BANAN'] });
  });

  it('refuses a packaged product — that is the barcode scanner’s job', () => {
    expect(isConfidentFruit(answer({ kind: 'PACKAGED' }))).toBe(false);
    expect(decideVisionOutcome([answer({ kind: 'PACKAGED' })])).toEqual({ kind: 'unsure' });
  });

  it('refuses when the recogniser could not tell what it was looking at', () => {
    expect(isConfidentFruit(answer({ kind: 'UNCLEAR' }))).toBe(false);
  });

  it('refuses a name the CATALOGUE never confirmed, however sure the model was', () => {
    expect(isConfidentFruit(answer({ confidence: 1, resolution: null }))).toBe(false);
  });

  it('refuses below the confidence floor and accepts exactly at it', () => {
    expect(isConfidentFruit(answer({ confidence: HOME_VISION_MIN_CONFIDENCE - 0.01 }))).toBe(false);
    expect(isConfidentFruit(answer({ confidence: HOME_VISION_MIN_CONFIDENCE }))).toBe(true);
  });

  it('treats a failed call as "unsure", never as an empty success', () => {
    expect(decideVisionOutcome([null])).toEqual({ kind: 'unsure' });
    expect(decideVisionOutcome([])).toEqual({ kind: 'unsure' });
  });

  it('§31: several confidently recognised fruits become several chips', () => {
    const cherry = answer({
      resolution: { productId: 'PI-ING-000202', displayName: 'WIŚNIA', brand: null },
    });
    expect(decideVisionOutcome([answer(), cherry])).toEqual({
      kind: 'recognised',
      names: ['BANAN', 'WIŚNIA'],
    });
  });

  it('never adds the same fruit twice, and drops an empty catalogue name', () => {
    expect(decideVisionOutcome([answer(), answer()])).toEqual({
      kind: 'recognised',
      names: ['BANAN'],
    });
    expect(
      decideVisionOutcome([
        answer({ resolution: { productId: 'x', displayName: '   ', brand: null } }),
      ]),
    ).toEqual({ kind: 'unsure' });
  });

  it('keeps a confident fruit even when the surrounding answers failed', () => {
    expect(decideVisionOutcome([null, answer(), answer({ kind: 'PACKAGED' })])).toEqual({
      kind: 'recognised',
      names: ['BANAN'],
    });
  });
});
