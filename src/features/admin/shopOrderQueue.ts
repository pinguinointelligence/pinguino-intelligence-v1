import type { ShopFulfillmentStatus, ShopOrder, ShopOrderStatus } from '@/services/shop';

/**
 * The operator's four questions, answered from the lifecycle that already
 * exists.
 *
 * `shop_orders` already carries `status` (pending | paid | failed | cancelled |
 * refunded) and `fulfillment_status` (awaiting | preparing | shipped |
 * delivered | cancelled). Between them they express every state the owner
 * listed — NEW, PAID, TO SHIP, WAITING-PREORDER, SHIPPED, CANCELLED, REFUNDED —
 * so nothing new is stored here. "To ship" is paid + not yet out the door;
 * "waiting" is the same thing when the order contains the preorder that is
 * holding it. Deriving them keeps ONE source of truth instead of a second,
 * quietly divergent status column.
 */
export type ShopOrderQueue = 'toShip' | 'waiting' | 'unpaid' | 'shipped';

const OPEN: readonly ShopFulfillmentStatus[] = ['awaiting', 'preparing'];
const OUT: readonly ShopFulfillmentStatus[] = ['shipped', 'delivered'];
const NOT_PAID: readonly ShopOrderStatus[] = ['pending', 'failed', 'cancelled'];

export const shopOrderQueue = (
  order: Pick<ShopOrder, 'status' | 'fulfillmentStatus' | 'containsPreorder'>,
): ShopOrderQueue | null => {
  if (OUT.includes(order.fulfillmentStatus)) return 'shipped';
  if (NOT_PAID.includes(order.status)) return 'unpaid';
  // A refunded order still needs to leave the queues: nothing is packed for it.
  if (order.status === 'refunded' || order.fulfillmentStatus === 'cancelled') return null;
  if (!OPEN.includes(order.fulfillmentStatus)) return null;
  // `preparing` is the operator saying the goods are in hand.
  if (order.fulfillmentStatus === 'preparing') return 'toShip';
  return order.containsPreorder ? 'waiting' : 'toShip';
};

export const shopOrderQueueCounts = (
  orders: readonly Pick<ShopOrder, 'status' | 'fulfillmentStatus' | 'containsPreorder'>[],
): Record<ShopOrderQueue, number> => {
  const counts: Record<ShopOrderQueue, number> = { toShip: 0, waiting: 0, unpaid: 0, shipped: 0 };
  for (const order of orders) {
    const queue = shopOrderQueue(order);
    if (queue) counts[queue] += 1;
  }
  return counts;
};
