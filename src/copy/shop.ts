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
 * hidden in terms after payment. It is written in customer language: what the
 * ingredient does in a batch, not what the Engine calls it.
 */

export interface ShopCopy {
  readonly page: {
    readonly eyebrow: string;
    readonly title: string;
    readonly blurb: string;
    readonly contextLabel: string;
  };
  /** The three commerce facts the hero states before anyone scrolls. */
  readonly hero: {
    readonly shippingLabel: string;
    readonly shippingValue: string;
    readonly starterLabel: string;
    readonly starterValue: string;
    readonly paymentLabel: string;
    readonly paymentValue: string;
  };
  readonly starterPack: {
    readonly kicker: string;
    readonly body: string;
    readonly contents: string;
    readonly specimenSub: string;
    readonly packTotal: string;
    readonly lede: string;
    readonly whyTitle: string;
    readonly whyBodyTitle: string;
    readonly whyBodyText: string;
    readonly whySweetTitle: string;
    readonly whySweetText: string;
    readonly whyCreamTitle: string;
    readonly whyCreamText: string;
    readonly allergens: string;
    readonly contentsRecap: string;
    readonly contentsRecapValue: string;
    readonly shippingRow: string;
    readonly deliveryRow: string;
    readonly deliveryValue: string;
    readonly finalAmountNote: string;
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
    readonly singlesKicker: string;
    readonly singlesTitle: string;
    readonly singlesHelper: string;
    readonly containsMilk: string;
    readonly containsEgg: string;
  };
  readonly cart: {
    readonly title: string;
    readonly kicker: string;
    readonly empty: string;
    readonly emptyCta: string;
    readonly quantity: string;
    readonly decrease: string;
    readonly increase: string;
    readonly perUnit: string;
    readonly remove: string;
    readonly total: string;
    readonly summaryTitle: string;
    readonly itemsRow: string;
    readonly shippingRow: string;
    readonly grandTotal: string;
    readonly checkout: string;
    readonly redirecting: string;
    readonly signInFirst: string;
    readonly signInCta: string;
    readonly preorderNotice: string;
    readonly preorderLineItem: string;
    readonly finalAmountNote: string;
    readonly testMode: string;
    readonly error: string;
  };
  readonly admin: {
    readonly sessionReference: string;
    readonly intentReference: string;
    readonly syncPayment: string;
    readonly articlesTitle: string;
    readonly ordersTitle: string;
    readonly queueToShip: string;
    readonly queueWaiting: string;
    readonly queueUnpaid: string;
    readonly queueShipped: string;
    readonly packingList: string;
    readonly shipTo: string;
    readonly noAddress: string;
    readonly customer: string;
    readonly money: string;
    readonly recordTracking: string;
    readonly carrier: string;
    readonly trackingNumber: string;
    readonly markShipped: string;
    readonly filterAll: string;
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
    readonly shipTo: string;
    readonly tracking: string;
    readonly items: string;
    readonly shippingCost: string;
    readonly subtotal: string;
  };
  /** The screen that closes the purchase after the payment page. */
  readonly confirmation: {
    readonly kicker: string;
    readonly checking: string;
    readonly paidTitle: string;
    readonly pendingTitle: string;
    readonly pendingBody: string;
    readonly failedTitle: string;
    readonly failedBody: string;
    readonly cancelledTitle: string;
    readonly cancelledBody: string;
    readonly paidLabel: string;
    readonly step1: string;
    readonly step2: string;
    readonly step2Preorder: string;
    readonly step3: string;
    readonly viewOrders: string;
    readonly back: string;
  };
}

export const shopCopyPl: ShopCopy = {
  page: {
    eyebrow: 'Ekosystem Gellatti',
    title: 'Sklep',
    blurb: 'Składniki, na których Gellatti liczy receptury. Nic więcej.',
    contextLabel: 'Sklep',
  },
  hero: {
    shippingLabel: 'Wysyłka',
    shippingValue: 'Kurier · {shipping}\n2–5 dni roboczych',
    starterLabel: 'Zestaw startowy',
    starterValue: 'Na zamówienie\nokoło {weeks} tygodni',
    paymentLabel: 'Płatność',
    paymentValue: 'Karta\nkwota końcowa',
  },
  starterPack: {
    kicker: 'Zestaw startowy',
    body:
      'Siedem składników dobranych tak, żeby Gellatti mogło policzyć recepturę bez szukania ' +
      'specjalistycznych produktów po sklepach. Nie musisz go kupować, żeby korzystać z Gellatti.',
    contents: 'W zestawie',
    specimenSub: 'Siedem składników · zawartość opakowania',
    packTotal: 'Razem w opakowaniu',
    lede:
      'Siedem składników, na których Gellatti liczy receptury — w proporcjach dobranych pod ' +
      'pierwsze wyroby. Zamiast szukać każdego z nich osobno, dostajesz komplet gotowy do pracy.',
    whyTitle: 'Dlaczego te siedem',
    whyBodyTitle: 'Sucha masa i ciało',
    whyBodyText: 'Odtłuszczone mleko w proszku i inulina budują strukturę bez dodatkowej wody.',
    whySweetTitle: 'Słodycz i miękkość',
    whySweetText: 'Dekstroza i fruktoza ustawiają słodycz oraz twardość po zamrożeniu.',
    whyCreamTitle: 'Kremowość i stabilność',
    whyCreamText: 'Śmietanka 42%, żółtko i Gellatti Stabilizer trzymają teksturę.',
    allergens: 'Zawiera mleko i jaja. Skład każdego składnika opisany osobno niżej.',
    contentsRecap: 'Zawartość',
    contentsRecapValue: '{count} składników · {grams}',
    shippingRow: 'Wysyłka',
    deliveryRow: 'Dostawa',
    deliveryValue: '2–5 dni po wysyłce',
    finalAmountNote: 'Kwota końcowa — przy płatności nie doliczamy dodatkowych opłat.',
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
    singlesKicker: 'Pojedyncze składniki',
    singlesTitle: 'Każdy składnik osobno',
    singlesHelper: 'Te same składniki co w zestawie, w opakowaniach 500 g.',
    containsMilk: 'Zawiera mleko',
    containsEgg: 'Zawiera jaja',
  },
  cart: {
    title: 'Twoje zamówienie',
    kicker: 'Koszyk',
    empty: 'Koszyk jest pusty. Zacznij od zestawu startowego.',
    emptyCta: 'Zobacz zestaw startowy',
    quantity: 'Ilość',
    decrease: 'Zmniejsz ilość',
    increase: 'Zwiększ ilość',
    perUnit: 'za sztukę',
    remove: 'Usuń',
    total: 'Razem',
    summaryTitle: 'Podsumowanie',
    itemsRow: 'Produkty ({count} szt.)',
    shippingRow: 'Wysyłka kurierem',
    grandTotal: 'Do zapłaty',
    checkout: 'Przejdź do płatności',
    redirecting: 'Przekierowuję do płatności…',
    signInFirst: 'Zaloguj się, aby złożyć zamówienie.',
    signInCta: 'Zaloguj się',
    preorderNotice:
      'Zamówienie zawiera pozycję na zamówienie — całość wysyłamy za około {weeks} tyg.',
    preorderLineItem: 'Na zamówienie · wysyłka za około {weeks} tyg.',
    finalAmountNote: 'Kwota końcowa. Płatność kartą.',
    testMode: 'Staging: płatność w trybie testowym Stripe. Karta nie zostanie obciążona.',
    error: 'Nie udało się rozpocząć płatności. Spróbuj ponownie.',
  },
  admin: {
    sessionReference: 'Sesja płatności (Stripe)',
    intentReference: 'Płatność (Stripe payment intent)',
    syncPayment: 'Sprawdź płatność u dostawcy',
    articlesTitle: 'Artykuły',
    ordersTitle: 'Zamówienia',
    queueToShip: 'Do wysyłki',
    queueWaiting: 'Czeka na zestaw startowy',
    queueUnpaid: 'Nieopłacone i nieudane',
    queueShipped: 'Wysłane',
    packingList: 'Do spakowania',
    shipTo: 'Wysyłka do',
    noAddress: 'Brak adresu — zamówienie nieopłacone.',
    customer: 'Klient',
    money: 'Kwoty',
    recordTracking: 'Zapisz przesyłkę',
    carrier: 'Przewoźnik',
    trackingNumber: 'Numer przesyłki',
    markShipped: 'Oznacz jako wysłane',
    filterAll: 'Wszystkie',
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
    shipTo: 'Wysyłka do',
    tracking: 'Przesyłka',
    items: 'Pozycje',
    shippingCost: 'Wysyłka',
    subtotal: 'Produkty',
  },
  confirmation: {
    kicker: 'Zamówienie',
    checking: 'Sprawdzam płatność u dostawcy…',
    paidTitle: 'Dziękujemy — zamówienie jest opłacone.',
    pendingTitle: 'Płatność nie została jeszcze potwierdzona.',
    pendingBody:
      'Jeżeli płatność się powiodła, potwierdzenie pojawi się w ciągu kilku minut. ' +
      'Status sprawdzisz też w swoich zamówieniach.',
    failedTitle: 'Płatność nie doszła do skutku.',
    failedBody: 'Nic nie zostało pobrane. Możesz spróbować ponownie z tym samym koszykiem.',
    cancelledTitle: 'Płatność została przerwana.',
    cancelledBody: 'Nic nie zostało pobrane. Koszyk czeka nietknięty.',
    paidLabel: 'Zapłacono',
    step1: 'Potwierdzenie trafia na Twój adres e-mail.',
    step2: 'Kompletujemy zamówienie i pakujemy.',
    step2Preorder: 'Zestaw startowy kompletujemy około {weeks} tygodni.',
    step3: 'Wysyłka kurierem, 2–5 dni roboczych. Numer przesyłki dostaniesz mailem.',
    viewOrders: 'Zobacz swoje zamówienia',
    back: 'Wróć do sklepu',
  },
};

export const shopCopyEn: ShopCopy = {
  page: {
    eyebrow: 'Gellatti ecosystem',
    title: 'Shop',
    blurb: 'The ingredients Gellatti formulates with. Nothing else.',
    contextLabel: 'Shop',
  },
  hero: {
    shippingLabel: 'Shipping',
    shippingValue: 'Courier · {shipping}\n2–5 business days',
    starterLabel: 'Starter pack',
    starterValue: 'On order\nabout {weeks} weeks',
    paymentLabel: 'Payment',
    paymentValue: 'Card\nfinal amount',
  },
  starterPack: {
    kicker: 'Starter pack',
    body:
      'Seven ingredients chosen so Gellatti can work out a recipe without you hunting for ' +
      'specialist products. You do not need it to use Gellatti.',
    contents: 'In the pack',
    specimenSub: 'Seven ingredients · what is in the box',
    packTotal: 'Total in the box',
    lede:
      'The seven ingredients Gellatti formulates with, in the proportions a first batch needs. ' +
      'Instead of sourcing each one separately, you get a set that is ready to work with.',
    whyTitle: 'Why these seven',
    whyBodyTitle: 'Solids and body',
    whyBodyText: 'Skimmed milk powder and inulin build structure without adding water.',
    whySweetTitle: 'Sweetness and softness',
    whySweetText: 'Dextrose and fructose set sweetness and how hard it freezes.',
    whyCreamTitle: 'Creaminess and stability',
    whyCreamText: 'Cream powder 42%, egg yolk and Gellatti Stabilizer hold the texture.',
    allergens: 'Contains milk and eggs. Each ingredient is described separately below.',
    contentsRecap: 'Contents',
    contentsRecapValue: '{count} ingredients · {grams}',
    shippingRow: 'Shipping',
    deliveryRow: 'Delivery',
    deliveryValue: '2–5 days after dispatch',
    finalAmountNote: 'Final amount — nothing is added at payment.',
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
    singlesKicker: 'Single ingredients',
    singlesTitle: 'Every ingredient on its own',
    singlesHelper: 'The same ingredients as the pack, in 500 g bags.',
    containsMilk: 'Contains milk',
    containsEgg: 'Contains eggs',
  },
  cart: {
    title: 'Your order',
    kicker: 'Cart',
    empty: 'Your cart is empty. Start with the starter pack.',
    emptyCta: 'See the starter pack',
    quantity: 'Quantity',
    decrease: 'Decrease quantity',
    increase: 'Increase quantity',
    perUnit: 'each',
    remove: 'Remove',
    total: 'Total',
    summaryTitle: 'Summary',
    itemsRow: 'Items ({count})',
    shippingRow: 'Courier shipping',
    grandTotal: 'To pay',
    checkout: 'Go to payment',
    redirecting: 'Taking you to payment…',
    signInFirst: 'Sign in to place an order.',
    signInCta: 'Sign in',
    preorderNotice:
      'This order contains an on-order item — the whole order ships in about {weeks} weeks.',
    preorderLineItem: 'On order · ships in about {weeks} weeks',
    finalAmountNote: 'Final amount. Card payment.',
    testMode: 'Staging: Stripe test mode. No card is charged.',
    error: 'Payment could not be started. Please try again.',
  },
  admin: {
    sessionReference: 'Payment session (Stripe)',
    intentReference: 'Payment (Stripe payment intent)',
    syncPayment: 'Check payment with the provider',
    articlesTitle: 'Articles',
    ordersTitle: 'Orders',
    queueToShip: 'To ship',
    queueWaiting: 'Waiting on the starter pack',
    queueUnpaid: 'Unpaid and failed',
    queueShipped: 'Shipped',
    packingList: 'Pack this',
    shipTo: 'Ship to',
    noAddress: 'No address — the order is not paid.',
    customer: 'Customer',
    money: 'Amounts',
    recordTracking: 'Save the shipment',
    carrier: 'Carrier',
    trackingNumber: 'Tracking number',
    markShipped: 'Mark as shipped',
    filterAll: 'All',
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
    shipTo: 'Ship to',
    tracking: 'Shipment',
    items: 'Items',
    shippingCost: 'Shipping',
    subtotal: 'Items',
  },
  confirmation: {
    kicker: 'Order',
    checking: 'Checking the payment with the provider…',
    paidTitle: 'Thank you — the order is paid.',
    pendingTitle: 'The payment has not been confirmed yet.',
    pendingBody:
      'If the payment went through, confirmation appears within a few minutes. ' +
      'You can also check the status in your orders.',
    failedTitle: 'The payment did not go through.',
    failedBody: 'Nothing was charged. You can try again with the same cart.',
    cancelledTitle: 'The payment was interrupted.',
    cancelledBody: 'Nothing was charged. Your cart is untouched.',
    paidLabel: 'Paid',
    step1: 'Confirmation goes to your email address.',
    step2: 'We put the order together and pack it.',
    step2Preorder: 'The starter pack takes about {weeks} weeks to assemble.',
    step3: 'Courier delivery, 2–5 business days. The tracking number arrives by email.',
    viewOrders: 'See your orders',
    back: 'Back to the shop',
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

/** One gram formatter, so 1125 never renders as `1125 g` on one surface and
 *  `1 125 g` on the next. The separator is a narrow no-break space. */
export const shopGrams = (grams: number): string =>
  // Grouped by hand rather than through Intl: pl-PL groups only from five
  // digits, so `Intl` renders „1125 g" while the pack is stated as „1 125 g"
  // everywhere else — in the product description, in the migration and on the
  // specimen panel. The separator is the same U+00A0 pl-PL itself uses.
  `${String(Math.round(grams)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')} g`;
