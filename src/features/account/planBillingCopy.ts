/**
 * Konto → Plan i rozliczenia — the panel's Polish copy, in one place.
 *
 * DESIGN V3.0 §P2 („osiem stanów"): one panel, the same shape in every state —
 * plan name, status, facts, ONE sentence, actions. The sentence is what the
 * customer needs to know; the facts carry the dates and the money.
 *
 * Every date and amount is passed IN from the billing authority
 * (`src/billing/account/planPanelState.ts`, `customer_subscriptions`). Nothing
 * here computes one, and no example date from the design ever ships: a state
 * without a date from the server renders without a date.
 */
import type { BillingPlanStatus } from '@/billing/account/planPanelState';

/** Polish long date, e.g. "19 października 2026". Null in, null out. */
export function formatPlanDate(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Cadence word for the facts row. */
export const CADENCE_LABEL: Readonly<Record<string, string>> = {
  monthly: 'Miesięcznie',
  annual: 'Rocznie',
  initial_15_month: '15 miesięcy',
};

export const PRODUCT_LABEL: Readonly<Record<string, string>> = {
  home: 'Home',
  pro: 'Pro',
};

/** The chip tone per state — muted laboratory tones, never candy (Design Lock §3). */
export type PlanChipTone = 'live' | 'ending' | 'ended' | 'attention' | 'none';

export const STATUS_CHIP: Readonly<Record<BillingPlanStatus, { label: string; tone: PlanChipTone }>> = {
  active: { label: 'Aktywny', tone: 'live' },
  cancelling: { label: 'Anulowany', tone: 'ending' },
  scheduled_change: { label: 'Zmiana planu', tone: 'ending' },
  payment_problem: { label: 'Problem z płatnością', tone: 'attention' },
  expired: { label: 'Wygasł', tone: 'ended' },
  none: { label: 'Brak planu', tone: 'none' },
};

export const planBillingCopy = {
  sectionTitle: 'Plan i rozliczenia',

  /** Fact labels. The values come from the authority. */
  facts: {
    plan: 'Plan',
    cadence: 'Rozliczanie',
    price: 'Cena',
    renewal: 'Następne odnowienie',
    accessUntil: 'Dostęp do',
    expiredAt: 'Wygasł',
    changesAt: 'Zmiana planu',
  },

  /** The ONE sentence per state. `{date}` is replaced with the authority's date. */
  sentence: {
    activeHome: 'Twój plan odnawia się automatycznie {date}.',
    activePro: 'Twój plan odnawia się automatycznie {date}.',
    activeNoDate: 'Twój plan odnawia się automatycznie.',
    cancellingHome: 'Subskrypcja została anulowana. Możesz korzystać z Home do {date}.',
    cancellingPro: 'Subskrypcja została anulowana. Możesz korzystać z Pro do {date}.',
    cancellingNoDate: 'Subskrypcja została anulowana i nie odnowi się.',
    scheduledChange: '{from} pozostaje aktywny do {date}. Potem przejdziesz na {to}.',
    expiredHome: 'Twój plan Home wygasł {date}. Zapisana receptura czeka na Ciebie.',
    expiredPro: 'Twój plan Pro wygasł {date}. Receptury i historia produkcji czekają, Produkcja jest zamknięta do odnowienia.',
    expiredNoDate: 'Twój plan wygasł. Możesz odnowić go w każdej chwili.',
    paymentProblem: 'Nie udało się odnowić subskrypcji.',
    paymentProblemUntil: 'Nie udało się odnowić subskrypcji. Dostęp masz do {date}.',
    none: 'Nie masz aktywnego planu.',
  },

  /** What stops working — Pro cancelled/expired says it plainly (design §4, §6). */
  proEnds: 'Po tej dacie przestaną działać Produkcja, etykiety i przestrzeń Pro.',

  actions: {
    upgradeToPro: 'Przejdź na Pro',
    downgradeToHome: 'Zmień na Home',
    cancel: 'Anuluj subskrypcję',
    resume: 'Wznów subskrypcję',
    cancelScheduledChange: 'Anuluj zmianę planu',
    renewHome: 'Odnów Home',
    renewPro: 'Odnów Pro',
    chooseHome: 'Wybierz Home',
    choosePro: 'Wybierz Pro',
    updatePaymentMethod: 'Zaktualizuj metodę płatności',
    contact: 'Napisz do nas',
  },

  /** State 7 — the upgrade preview. Amounts come from the Stripe preview. */
  upgrade: {
    title: 'Przejście na Pro',
    immediate: 'Pro zacznie działać od razu.',
    difference: 'Zapłacisz tylko różnicę za pozostały czas bieżącego okresu.',
    dueToday: 'Dzisiaj zapłacisz',
    nextRenewal: 'Następne odnowienie',
    fromNextPeriod: 'Od kolejnego okresu',
    confirm: 'Potwierdzam przejście na Pro',
    back: 'Wróć',
    loading: 'Liczymy kwotę…',
  },

  /** Scheduled downgrade preview (no money moves today). */
  downgrade: {
    title: 'Zmiana na Home',
    effective: 'Pro pozostaje aktywny do {date}. Od tej daty Twój plan zmieni się na Home.',
    nothingToday: 'Dzisiaj nic nie płacisz.',
    confirm: 'Zaplanuj zmianę na Home',
  },

  /**
   * HONEST FAILURES. Every one of these is a real answer from the server or a
   * real absence of it — the panel never reports a change it did not make.
   */
  errors: {
    unavailable:
      'Zarządzanie subskrypcją jest chwilowo niedostępne. Nic nie zostało zmienione.',
    not_signed_in: 'Zaloguj się ponownie, żeby zarządzać subskrypcją.',
    no_subscription: 'Nie znaleźliśmy aktywnej subskrypcji do zmiany.',
    already_cancelling: 'Ta subskrypcja jest już anulowana.',
    not_cancelling: 'Ta subskrypcja nie jest anulowana.',
    period_already_ended: 'Opłacony okres już się skończył. Odnów plan, żeby korzystać dalej.',
    resume_before_changing_plan: 'Najpierw wznów subskrypcję, potem zmień plan.',
    cancel_scheduled_change_first: 'Najpierw anuluj zaplanowaną zmianę planu.',
    cadence_conversion_not_available:
      'Zmiana z miesięcznego na roczny nie jest jeszcze dostępna w tym panelu.',
    same_offer: 'To jest Twój obecny plan.',
    preview_required: 'Potrzebna jest świeża wycena. Spróbuj jeszcze raz.',
    preview_expired: 'Wycena straciła ważność. Otwórz ją ponownie, żeby zobaczyć aktualną kwotę.',
    no_scheduled_change: 'Nie ma zaplanowanej zmiany planu do anulowania.',
    payment_failed: 'Płatność została odrzucona. Nic nie zostało zmienione.',
    requires_action: 'Bank poprosił o potwierdzenie płatności. Nic nie zostało zmienione.',
    failed: 'Nie udało się wykonać tej operacji. Nic nie zostało zmienione.',
    /** The read itself failed — never render this as "no plan". */
    read: 'Nie udało się odczytać stanu subskrypcji. Odśwież stronę.',
    portal: 'Nie udało się otworzyć płatności. Spróbuj ponownie.',
  },

  loading: 'Wczytujemy Twój plan…',
  working: 'Chwileczkę…',
} as const;

/** Fill `{token}` slots; a missing value drops the whole sentence to its no-date variant. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
}
