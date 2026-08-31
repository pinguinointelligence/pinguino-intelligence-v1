import { describe, expect, it } from 'vitest';
import { shopOrderQueue, shopOrderQueueCounts } from './shopOrderQueue';

/**
 * The owner's question was operational, not visual: standing at the bench, what
 * do I pack today, what am I still waiting on, and what has already gone? These
 * are the answers, derived from the two status columns the shop already has.
 */
const order = (
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded',
  fulfillmentStatus: 'awaiting' | 'preparing' | 'shipped' | 'delivered' | 'cancelled',
  containsPreorder = false,
) => ({ status, fulfillmentStatus, containsPreorder }) as const;

describe('shopOrderQueue', () => {
  it('puts a paid, unshipped, in-stock order in front of the packer', () => {
    expect(shopOrderQueue(order('paid', 'awaiting'))).toBe('toShip');
    expect(shopOrderQueue(order('paid', 'preparing'))).toBe('toShip');
  });

  it('holds a paid order that is waiting on a preorder', () => {
    expect(shopOrderQueue(order('paid', 'awaiting', true))).toBe('waiting');
  });

  it('keeps money that never arrived out of the packing queues', () => {
    expect(shopOrderQueue(order('pending', 'awaiting'))).toBe('unpaid');
    expect(shopOrderQueue(order('failed', 'awaiting'))).toBe('unpaid');
    expect(shopOrderQueue(order('cancelled', 'awaiting'))).toBe('unpaid');
  });

  it('takes anything already out of the door off the bench', () => {
    expect(shopOrderQueue(order('paid', 'shipped'))).toBe('shipped');
    expect(shopOrderQueue(order('paid', 'delivered'))).toBe('shipped');
    // Shipped wins even for a preorder: it is no longer waiting on anything.
    expect(shopOrderQueue(order('paid', 'shipped', true))).toBe('shipped');
  });

  it('never queues an order nobody should pack', () => {
    expect(shopOrderQueue(order('refunded', 'awaiting'))).toBeNull();
    expect(shopOrderQueue(order('paid', 'cancelled'))).toBeNull();
  });

  it('counts the bench', () => {
    expect(
      shopOrderQueueCounts([
        order('paid', 'awaiting'),
        order('paid', 'awaiting', true),
        order('pending', 'awaiting'),
        order('paid', 'shipped'),
        order('refunded', 'awaiting'),
      ]),
    ).toEqual({ toShip: 1, waiting: 1, unpaid: 1, shipped: 1 });
  });
});
