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
    readonly introEyebrow: string;
    readonly introLine: string;
    readonly cartLink: string;
  };
  /** The approved Shop hero — Starter Pack first, one CTA, one honest note. */
  readonly hero: {
    readonly eyebrow: string;
    readonly title: string;
    readonly lede: string;
    readonly note: string;
  };
  /**
   * WHERE ARE YOU STARTING? — one product, two fulfilment modes.
   *
   * The country question is not a shipping form field; it is the thing that
   * decides which offer the customer sees. When a pack cannot ship, the answer
   * is a better offer rather than the word "unavailable".
   */
  readonly country: {
    readonly question: string;
    readonly helper: string;
    readonly placeholder: string;
    readonly change: string;
    readonly shipsHere: string;
    readonly localHere: string;
    readonly noneHere: string;
    readonly noneHelper: string;
  };
  readonly localPack: {
    readonly name: string;
    readonly price: string;
    readonly lede: string;
    readonly body: string;
    readonly cta: string;
    readonly ctaSignedOut: string;
    readonly listTitle: string;
    readonly listHelper: string;
    readonly buy: string;
    readonly countryLabel: string;
  };
  readonly starterPack: {
    readonly kicker: string;
    readonly body: string;
    readonly contents: string;
    readonly packShotTitle: string;
    readonly packCaption: string;
    readonly contentsCta: string;
    readonly contentsTitle: string;
    readonly contentsHelper: string;
    readonly packTotal: string;
    readonly name: string;
    readonly offerLede: string;
    readonly offerFacts: string;
    readonly offerShipping: string;
    readonly contentsTotalShort: string;
    readonly galleryFront: string;
    readonly galleryAngle: string;
    readonly gallerySide: string;
    readonly detailKicker: string;
    readonly detailBody: string;
    readonly massRow: string;
    readonly priceRow: string;
    readonly availabilityRow: string;
    readonly closingTitle: string;
    readonly closingBody: string;
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
    readonly detailKicker: string;
  };
  readonly cart: {
    readonly title: string;
    readonly kicker: string;
    readonly empty: string;
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
    readonly createdNotice: string;
    readonly viewPdf: string;
    readonly pdfReady: string;
    readonly pdfPending: string;
    readonly pdfFailed: string;
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
    /* C3 §5 — the Shop's own utility line, under the frozen global header. */
    introEyebrow: 'Sklep Gellatti',
    introLine: 'Składniki do receptur Gellatti.',
    cartLink: 'Koszyk',
  },
  hero: {
    eyebrow: 'Sklep Gellatti',
    title: 'Gellatti Starter Pack',
    lede:
      'Pierwszy zestaw składników Gellatti — siedem pozycji w proporcjach dobranych pod ' +
      'pierwsze receptury.',
    note: 'Wysyłka kurierem {shipping} · 2–5 dni roboczych. Kwota końcowa przy płatności.',
  },
  country: {
    question: 'Gdzie zaczynasz?',
    helper: 'Wybierz kraj — pokażemy Ci właściwą wersję zestawu.',
    placeholder: 'Wybierz kraj',
    change: 'Zmień',
    shipsHere: 'Wysyłamy tutaj',
    localHere: 'Dostępne lokalnie',
    noneHere: 'Jeszcze nie w Twoim kraju',
    noneHelper:
      'Nie wysyłamy tu jeszcze zestawu i nie mamy kompletnej listy lokalnych zamienników. ' +
      'Pracujemy nad tym.',
  },
  localPack: {
    name: 'Lokalny Zestaw Startowy',
    price: '0 €',
    lede: 'Wszystko, czego potrzebujesz — dostępne lokalnie.',
    body:
      'Pokażemy Ci dokładnie, co kupić w Twoim kraju, żebyś mógł zacząć z Gellatti ' +
      'bez czekania na przesyłkę z zagranicy.',
    cta: 'Odbierz swój Lokalny Zestaw Startowy',
    ctaSignedOut: 'Zaloguj się i odbierz zestaw',
    listTitle: 'Twoja lista zakupów',
    listHelper: 'Te same składniki co w zestawie — u lokalnych dostawców.',
    buy: 'Kup',
    countryLabel: 'Kraj',
  },
  starterPack: {
    kicker: 'Zestaw startowy',
    body:
      'Siedem składników dobranych tak, żeby Gellatti mogło policzyć recepturę bez szukania ' +
      'specjalistycznych produktów po sklepach. Nie musisz go kupować, żeby korzystać z Gellatti.',
    contents: 'W zestawie',
    packShotTitle: 'Starter Pack',
    packCaption: '{count} składników · {grams}',
    contentsCta: 'Zobacz zawartość',
    contentsTitle: 'Zawartość zestawu',
    contentsHelper: 'Dokładne gramatury spakowane w jednym pudełku.',
    packTotal: 'Razem w opakowaniu',
    /* C3 §4 — the one featured offer. The eyebrow names the product line, the
       facts line states what the hero used to repeat, and the two state lines
       carry lead time and shipping once each. */
    /* OWNER, 2026-09-01: the product is called simply „Zestaw Startowy".
       The Gellatti brand is carried by the official wordmark in the global
       header and is not re-set as a second prominent type treatment here. */
    name: 'Zestaw Startowy',
    offerLede: 'Siedem składników w proporcjach dobranych pod pierwsze receptury.',
    offerFacts: '{count} składników · {grams}',
    offerShipping: 'Wysyłka {amount}',
    contentsTotalShort: 'Razem',
    galleryFront: 'Widok z przodu',
    galleryAngle: 'Ujęcie pod kątem',
    gallerySide: 'Bok opakowania',
    detailKicker: 'Zestaw Gellatti',
    detailBody:
      'Karta pokazuje dokładną zawartość, masę, cenę i termin realizacji. Skład każdego ' +
      'składnika opisany jest osobno niżej.',
    massRow: 'Masa',
    priceRow: 'Cena',
    availabilityRow: 'Dostępność',
    closingTitle: 'Zamówienie i wysyłka.',
    closingBody:
      'Płatność kartą, wysyłka kurierem {shipping} do 15 krajów UE. Kwota widoczna w koszyku ' +
      'jest kwotą pobieraną — przy płatności nie doliczamy dodatkowych opłat.',
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
    singlesTitle: 'Kup osobno',
    singlesHelper: 'Te same składniki dostępne również osobno.',
    containsMilk: 'Zawiera mleko',
    containsEgg: 'Zawiera jaja',
    detailKicker: 'Składnik Gellatti',
  },
  cart: {
    title: 'Twoje zamówienie',
    kicker: 'Koszyk',
    empty: 'Koszyk jest pusty.',
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
    createdNotice: 'Zamówienie utworzone. Poniżej znajdziesz swoje zamówienie.',
    viewPdf: 'Otwórz listę zakupów (PDF)',
    pdfReady: 'Gotowa',
    pdfPending: 'Przygotowujemy',
    pdfFailed: 'Nie udało się otworzyć listy. Spróbuj ponownie.',
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
    step1: 'Zamówienie jest zapisane na Twoim koncie — status sprawdzisz w „Zamówienia”.',
    step2: 'Kompletujemy zamówienie i pakujemy.',
    step2Preorder: 'Zestaw startowy kompletujemy około {weeks} tygodni.',
    step3: 'Wysyłka kurierem, 2–5 dni roboczych. Numer przesyłki pojawi się przy zamówieniu.',
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
    introEyebrow: 'Gellatti shop',
    introLine: 'The ingredients Gellatti formulates with.',
    cartLink: 'Cart',
  },
  hero: {
    eyebrow: 'Gellatti shop',
    title: 'Gellatti Starter Pack',
    lede: 'The first Gellatti ingredient set — seven items in the proportions a first batch needs.',
    note: 'Courier shipping {shipping} · 2–5 business days. The amount shown is the amount charged.',
  },
  country: {
    question: 'Where are you starting?',
    helper: 'Pick your country — we will show you the right version of the pack.',
    placeholder: 'Choose your country',
    change: 'Change',
    shipsHere: 'We ship here',
    localHere: 'Available locally',
    noneHere: 'Not in your country yet',
    noneHelper:
      'We do not ship the pack here yet, and we do not have a complete list of local ' +
      'alternatives. We are working on it.',
  },
  localPack: {
    name: 'Local Starter Pack',
    price: '0 €',
    lede: 'Everything you need, available locally.',
    body:
      'We will show you exactly what to buy in your country, so you can start with ' +
      'Gellatti without waiting for international shipping.',
    cta: 'Get my Local Starter Pack',
    ctaSignedOut: 'Sign in to get your pack',
    listTitle: 'Your shopping list',
    listHelper: 'The same ingredients as the pack — from local suppliers.',
    buy: 'Buy',
    countryLabel: 'Country',
  },
  starterPack: {
    kicker: 'Starter pack',
    body:
      'Seven ingredients chosen so Gellatti can work out a recipe without you hunting for ' +
      'specialist products. You do not need it to use Gellatti.',
    contents: 'In the pack',
    packShotTitle: 'Starter Pack',
    packCaption: '{count} ingredients · {grams}',
    contentsCta: 'See what is inside',
    contentsTitle: 'What is in the box',
    contentsHelper: 'Exact packed amounts, in one box.',
    packTotal: 'Total in the box',
    name: 'Zestaw Startowy',
    offerLede: 'Seven ingredients in the proportions a first batch needs.',
    offerFacts: '{count} ingredients · {grams}',
    offerShipping: 'Shipping {amount}',
    contentsTotalShort: 'Total',
    galleryFront: 'Front view',
    galleryAngle: 'Angled view',
    gallerySide: 'Side of the bag',
    detailKicker: 'Gellatti set',
    detailBody:
      'This card shows the exact contents, mass, price and lead time. Each ingredient is ' +
      'described separately below.',
    massRow: 'Mass',
    priceRow: 'Price',
    availabilityRow: 'Availability',
    closingTitle: 'Ordering and delivery.',
    closingBody:
      'Card payment, courier delivery {shipping} to 15 EU countries. The amount shown in the ' +
      'cart is the amount charged — nothing is added at payment.',
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
    singlesTitle: 'Buy separately',
    singlesHelper: 'The same ingredients, also available separately.',
    containsMilk: 'Contains milk',
    containsEgg: 'Contains eggs',
    detailKicker: 'Gellatti ingredient',
  },
  cart: {
    title: 'Your order',
    kicker: 'Cart',
    empty: 'Your cart is empty.',
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
    createdNotice: 'Order created. You will find it below.',
    viewPdf: 'Open shopping list (PDF)',
    pdfReady: 'Ready',
    pdfPending: 'Preparing',
    pdfFailed: 'Could not open the list. Try again.',
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
    step1: 'The order is saved to your account — check its status under “Orders”.',
    step2: 'We put the order together and pack it.',
    step2Preorder: 'The starter pack takes about {weeks} weeks to assemble.',
    step3: 'Courier delivery, 2–5 business days. The tracking number appears on the order.',
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
  return availability === 'out_of_stock'
    ? shopCopyPl.product.outOfStock
    : shopCopyPl.product.inStock;
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
