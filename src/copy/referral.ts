/**
 * POLEĆ GELLATTI — the regular-user referral copy.
 *
 * A SEPARATE product from Affiliate, and the copy has to make that obvious:
 * no commission, no payout, no application, no tier. The reward is time in
 * Gellatti PRO and nothing else.
 *
 * Follows the `CommunityCopy` pattern (`src/copy/locale.ts` rule 3).
 */

export interface ReferralCopy {
  readonly panel: {
    readonly eyebrow: string;
    readonly title: string;
    readonly blurb: string;
    readonly linkLabel: string;
    readonly copyLink: string;
    readonly copyCode: string;
    readonly copied: string;
    readonly codeLabel: string;
    readonly loading: string;
    readonly unavailable: string;
  };
  readonly rules: {
    readonly title: string;
    /** Rendered with the canonical day counts interpolated — never hardcoded. */
    readonly monthlyTemplate: string;
    readonly annualTemplate: string;
    readonly honest: string;
    readonly notAffiliate: string;
    readonly affiliateLink: string;
  };
  readonly stats: {
    readonly invited: string;
    readonly rewarded: string;
    readonly daysEarned: string;
    readonly bank: string;
    readonly bankHelp: string;
    readonly activeUntil: string;
    readonly bankedWhilePro: string;
    readonly empty: string;
  };
  readonly rewardStatus: {
    readonly earned: string;
    readonly reversed: string;
  };
  readonly product: {
    readonly home: string;
    readonly pro: string;
    readonly monthly: string;
    readonly annual: string;
  };
  /** Customer wording for every typed refusal the claim RPC can return. */
  readonly claim: {
    readonly claimed: string;
    readonly not_authenticated: string;
    readonly code_required: string;
    readonly code_not_found: string;
    readonly self_referral: string;
    readonly already_claimed_same: string;
    readonly already_claimed_other: string;
    readonly partner_attribution_exists: string;
  };
}

export const referralCopyPl: ReferralCopy = {
  panel: {
    eyebrow: 'Poleć Gellatti',
    title: 'Poleć Gellatti znajomym.',
    blurb: 'Za każdą pierwszą opłaconą subskrypcję osoby z Twojego linku dopisujemy Ci dni Gellatti PRO.',
    linkLabel: 'Twój link',
    copyLink: 'Kopiuj link',
    copyCode: 'Kopiuj kod',
    copied: 'Skopiowano',
    codeLabel: 'Twój kod',
    loading: 'Przygotowuję Twój link…',
    unavailable: 'Nie udało się wczytać Twojego linku. Odśwież stronę.',
  },
  rules: {
    title: 'Jak liczymy dni',
    monthlyTemplate: 'Plan miesięczny — {days} dni PRO',
    annualTemplate: 'Plan roczny — {days} dni PRO',
    honest: 'Liczy się pierwsza opłacona subskrypcja poleconej osoby. Zwrot płatności cofa nagrodę.',
    notAffiliate: 'To nie jest program Affiliate — tutaj nie ma prowizji ani wypłat.',
    affiliateLink: 'Zobacz Gellatti Affiliate',
  },
  stats: {
    invited: 'Polecone osoby',
    rewarded: 'Nagrodzone polecenia',
    daysEarned: 'Zdobyte dni PRO',
    bank: 'Bank dni PRO',
    bankHelp: 'Dni czekają w banku i włączają się, gdy nie masz opłaconego PRO.',
    activeUntil: 'Bonus PRO aktywny do',
    bankedWhilePro: 'Masz opłacone PRO, więc dni czekają w banku.',
    empty: 'Nikt jeszcze nie skorzystał z Twojego linku.',
  },
  rewardStatus: {
    earned: 'Zdobyte',
    reversed: 'Cofnięte',
  },
  product: {
    home: 'HOME',
    pro: 'PRO',
    monthly: 'miesięcznie',
    annual: 'rocznie',
  },
  claim: {
    claimed: 'Gotowe — Twoje polecenie zostało zapisane.',
    not_authenticated: 'Zaloguj się, aby zapisać polecenie.',
    code_required: 'Podaj kod polecenia.',
    code_not_found: 'Nie znamy takiego kodu.',
    self_referral: 'To Twój własny kod.',
    already_claimed_same: 'To polecenie jest już zapisane.',
    already_claimed_other: 'Twoje konto ma już zapisane inne polecenie.',
    partner_attribution_exists: 'Twoje konto jest już przypisane do programu Affiliate.',
  },
};

export const referralCopyEn: ReferralCopy = {
  panel: {
    eyebrow: 'Refer Gellatti',
    title: 'Recommend Gellatti to a friend.',
    blurb: 'For every first paid subscription from your link we add days of Gellatti PRO to your account.',
    linkLabel: 'Your link',
    copyLink: 'Copy link',
    copyCode: 'Copy code',
    copied: 'Copied',
    codeLabel: 'Your code',
    loading: 'Preparing your link…',
    unavailable: 'Your link could not be loaded. Refresh the page.',
  },
  rules: {
    title: 'How the days are counted',
    monthlyTemplate: 'Monthly plan — {days} PRO days',
    annualTemplate: 'Annual plan — {days} PRO days',
    honest: 'The first paid subscription of the referred person counts. A refund reverses the reward.',
    notAffiliate: 'This is not the Affiliate programme — there is no commission and no payout here.',
    affiliateLink: 'See Gellatti Affiliate',
  },
  stats: {
    invited: 'People referred',
    rewarded: 'Rewarded referrals',
    daysEarned: 'PRO days earned',
    bank: 'PRO day bank',
    bankHelp: 'Days wait in the bank and switch on when you have no paid PRO.',
    activeUntil: 'PRO bonus active until',
    bankedWhilePro: 'You have paid PRO, so the days are waiting in the bank.',
    empty: 'Nobody has used your link yet.',
  },
  rewardStatus: {
    earned: 'Earned',
    reversed: 'Reversed',
  },
  product: {
    home: 'HOME',
    pro: 'PRO',
    monthly: 'monthly',
    annual: 'annual',
  },
  claim: {
    claimed: 'Done — your referral has been recorded.',
    not_authenticated: 'Sign in to record the referral.',
    code_required: 'Enter a referral code.',
    code_not_found: 'We do not know that code.',
    self_referral: 'That is your own code.',
    already_claimed_same: 'That referral is already recorded.',
    already_claimed_other: 'Your account already has a different referral recorded.',
    partner_attribution_exists: 'Your account is already attributed to the Affiliate programme.',
  },
};

export type ReferralLanguage = 'pl' | 'en';

export const resolveReferralCopy = (language: ReferralLanguage = 'pl'): ReferralCopy =>
  language === 'en' ? referralCopyEn : referralCopyPl;

/** Polish is the shipped reference language. */
export const referralCopy: ReferralCopy = referralCopyPl;
