/**
 * Shop copy — catalogue, cart, checkout, orders and the Admin commerce
 * workspace.
 *
 * Follows the `CommunityCopy` reference pattern (`src/copy/locale.ts` rule 3):
 * one interface, one complete object per locale, a resolver. A source test
 * asserts identical key sets.
 *
 * Commerce copy is factual: what it is, how much, how many grams, whether it
 * is in stock, and — for a preorder — the lead time BEFORE checkout, never
 * hidden in terms after payment.
 */

export interface ShopCopy {
  readonly page: {
    readonly eyebrow: string;
    readonly title: string;
    readonly blurb: string;
    readonly contextLabel: string;
  };
  readonly starterPack: {
    readonly kicker: string;
    readonly body: string;
    readonly contents: string;
  };
  readonly product: {
    readonly packSize: string;
    readonly perKg: string;
    readonly add: string;
    readonly added: string;
    readonly inStock: string;
    readonly preorder: string;
    readonly preorderWeeks: string;
    readonly outOfStock: string;
    readonly usedFor: string;
  };
  readonly cart: {
    readonly title: string;
    readonly empty: string;
    readonly quantity: string;
    readonly remove: string;
    readonly total: string;
    readonly checkout: string;
    readonly redirecting: string;
    readonly signInFirst: string;
    readonly signInCta: string;
    readonly preorderNotice: string;
    readonly testMode: string;
    readonly error: string;
  };
  readonly admin: {
    readonly sessionReference: string;
    readonly intentReference: string;
    readonly syncPayment: string;
    readonly articlesTitle: string;
    readonly ordersTitle: string;
  };
  readonly orders: {
    readonly title: string;
    readonly empty: string;
    readonly number: string;
    readonly placed: string;
    readonly total: string;
    readonly statusPending: string;
    readonly statusPaid: string;
    readonly statusFailed: string;
    readonly statusCancelled: string;
    readonly statusRefunded: string;
    readonly fulfillmentAwaiting: string;
    readonly fulfillmentPreparing: string;
    readonly fulfillmentShipped: string;
    readonly fulfillmentDelivered: string;
    readonly fulfillmentCancelled: string;
    readonly preorderLine: string;
    readonly checkPayment: string;
    readonly paidConfirmation: string;
  };
}

export const shopCopyPl: ShopCopy = {
  page: {
    eyebrow: 'Ekosystem Gellatti',
    title: 'Sklep',
    blurb: 'Składniki, na których Gellatti liczy receptury. Nic więcej.',
    contextLabel: 'Sklep',
  },
  starterPack: {
    kicker: 'Zestaw startowy',
    body:
      'Siedem składników dobranych tak, żeby Gellatti mogło policzyć recepturę bez szukania ' +
      'specjalistycznych produktów po sklepach. Nie musisz go kupować, żeby korzystać z Gellatti.',
    contents: 'W zestawie',
  },
  product: {
    packSize: 'Opakowanie',
    perKg: 'za kg',
    add: 'Dodaj do koszyka',
    added: 'W koszyku',
    inStock: 'Dostępny',
    preorder: 'Na zamówienie',
    preorderWeeks: 'Na zamówienie · wysyłka za około {weeks} tyg.',
    outOfStock: 'Chwilowo niedostępny',
    usedFor: 'Do czego służy',
  },
  cart: {
    title: 'Koszyk',
    empty: 'Koszyk jest pusty.',
    quantity: 'Ilość',
    remove: 'Usuń',
    total: 'Razem',
    checkout: 'Przejdź do płatności',
    redirecting: 'Przekierowuję do płatności…',
    signInFirst: 'Zaloguj się, aby złożyć zamówienie.',
    signInCta: 'Zaloguj się',
    preorderNotice: 'Zamówienie zawiera produkt na zamówienie · wysyłka za około {weeks} tyg.',
    testMode: 'Staging: płatność w trybie testowym Stripe. Karta nie zostanie obciążona.',
    error: 'Nie udało się rozpocząć płatności. Spróbuj ponownie.',
  },
  admin: {
    sessionReference: 'Sesja płatności (Stripe)',
    intentReference: 'Płatność (Stripe payment intent)',
    syncPayment: 'Sprawdź płatność u dostawcy',
    articlesTitle: 'Artykuły',
    ordersTitle: 'Zamówienia',
  },
  orders: {
    title: 'Zamówienia',
    empty: 'Nie masz jeszcze zamówień.',
    number: 'Numer',
    placed: 'Złożone',
    total: 'Wartość',
    statusPending: 'Oczekuje na płatność',
    statusPaid: 'Opłacone',
    statusFailed: 'Płatność nieudana',
    statusCancelled: 'Anulowane',
    statusRefunded: 'Zwrócone',
    fulfillmentAwaiting: 'Oczekuje na realizację',
    fulfillmentPreparing: 'W przygotowaniu',
    fulfillmentShipped: 'Wysłane',
    fulfillmentDelivered: 'Dostarczone',
    fulfillmentCancelled: 'Anulowane',
    preorderLine: 'Na zamówienie · około {weeks} tyg.',
    checkPayment: 'Sprawdź płatność',
    paidConfirmation: 'Zamówienie opłacone.',
  },
};

export const shopCopyEn: ShopCopy = {
  page: {
    eyebrow: 'Gellatti ecosystem',
    title: 'Shop',
    blurb: 'The ingredients Gellatti formulates with. Nothing else.',
    contextLabel: 'Shop',
  },
  starterPack: {
    kicker: 'Starter pack',
    body:
      'Seven ingredients chosen so Gellatti can work out a recipe without you hunting for ' +
      'specialist products. You do not need it to use Gellatti.',
    contents: 'In the pack',
  },
  product: {
    packSize: 'Pack',
    perKg: 'per kg',
    add: 'Add to cart',
    added: 'In cart',
    inStock: 'In stock',
    preorder: 'On order',
    preorderWeeks: 'On order · ships in about {weeks} weeks',
    outOfStock: 'Currently unavailable',
    usedFor: 'What it does',
  },
  cart: {
    title: 'Cart',
    empty: 'Your cart is empty.',
    quantity: 'Quantity',
    remove: 'Remove',
    total: 'Total',
    checkout: 'Go to payment',
    redirecting: 'Taking you to payment…',
    signInFirst: 'Sign in to place an order.',
    signInCta: 'Sign in',
    preorderNotice: 'This order contains an on-order item · ships in about {weeks} weeks',
    testMode: 'Staging: Stripe test mode. No card is charged.',
    error: 'Payment could not be started. Please try again.',
  },
  admin: {
    sessionReference: 'Payment session (Stripe)',
    intentReference: 'Payment (Stripe payment intent)',
    syncPayment: 'Check payment with the provider',
    articlesTitle: 'Articles',
    ordersTitle: 'Orders',
  },
  orders: {
    title: 'Orders',
    empty: 'You have no orders yet.',
    number: 'Number',
    placed: 'Placed',
    total: 'Total',
    statusPending: 'Awaiting payment',
    statusPaid: 'Paid',
    statusFailed: 'Payment failed',
    statusCancelled: 'Cancelled',
    statusRefunded: 'Refunded',
    fulfillmentAwaiting: 'Awaiting fulfilment',
    fulfillmentPreparing: 'Being prepared',
    fulfillmentShipped: 'Shipped',
    fulfillmentDelivered: 'Delivered',
    fulfillmentCancelled: 'Cancelled',
    preorderLine: 'On order · about {weeks} weeks',
    checkPayment: 'Check payment',
    paidConfirmation: 'Order paid.',
  },
};

export type ShopLanguage = 'pl' | 'en';

export const resolveShopCopy = (language: ShopLanguage = 'pl'): ShopCopy =>
  language === 'en' ? shopCopyEn : shopCopyPl;

export const shopCopy: ShopCopy = shopCopyPl;

/** Display maps over the raw contract values (locale rule 2). */
export const shopAvailabilityLabelPl = (
  availability: 'in_stock' | 'preorder' | 'out_of_stock',
  leadTimeWeeks: number | null,
): string => {
  if (availability === 'preorder') {
    return leadTimeWeeks && leadTimeWeeks > 0
      ? shopCopyPl.product.preorderWeeks.replace('{weeks}', String(leadTimeWeeks))
      : shopCopyPl.product.preorder;
  }
  return availability === 'out_of_stock' ? shopCopyPl.product.outOfStock : shopCopyPl.product.inStock;
};

export const shopOrderStatusLabelPl = (
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded',
): string =>
  ({
    pending: shopCopyPl.orders.statusPending,
    paid: shopCopyPl.orders.statusPaid,
    failed: shopCopyPl.orders.statusFailed,
    cancelled: shopCopyPl.orders.statusCancelled,
    refunded: shopCopyPl.orders.statusRefunded,
  })[status];

export const shopFulfillmentLabelPl = (
  status: 'awaiting' | 'preparing' | 'shipped' | 'delivered' | 'cancelled',
): string =>
  ({
    awaiting: shopCopyPl.orders.fulfillmentAwaiting,
    preparing: shopCopyPl.orders.fulfillmentPreparing,
    shipped: shopCopyPl.orders.fulfillmentShipped,
    delivered: shopCopyPl.orders.fulfillmentDelivered,
    cancelled: shopCopyPl.orders.fulfillmentCancelled,
  })[status];

/** One money formatter for every shop surface. */
export const shopMoney = (cents: number, currency = 'eur'): string =>
  new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
