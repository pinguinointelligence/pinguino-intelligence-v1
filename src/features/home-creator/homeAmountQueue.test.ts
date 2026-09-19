import { describe, expect, it } from 'vitest';
import { queueAmountQuestion } from './homeAmountQueue';

const q = (id: string) => ({ ingredient: { id }, behavior: null, recommendedDose: null });

describe('Package 2A — every product that needs an amount gets its own question', () => {
  it('asks in arrival order and never replaces a waiting product', () => {
    let queue = queueAmountQuestion([], q('banana'));
    queue = queueAmountQuestion(queue, q('strawberry'));
    queue = queueAmountQuestion(queue, q('cranberry'));
    expect(queue.map((item) => item.ingredient.id)).toEqual(['banana', 'strawberry', 'cranberry']);
  });

  it('closing the question on screen moves on to the next one', () => {
    let queue = [q('banana'), q('strawberry')];
    queue = queueAmountQuestion(queue, null);
    expect(queue.map((item) => item.ingredient.id)).toEqual(['strawberry']);
    expect(queueAmountQuestion(queue, null)).toEqual([]);
  });

  it('asks the same product once', () => {
    const queue = queueAmountQuestion([q('banana')], q('banana'));
    expect(queue).toHaveLength(1);
  });
});
