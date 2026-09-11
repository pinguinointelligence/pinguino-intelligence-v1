/**
 * I-ADM-05 — a sensitive admin action asks first, and asks why.
 *
 * The Partners panel fired every action on one click, with a reason field
 * prefilled "Admin Partner operation" (activation: "Admin activation"). The
 * RPCs refuse an empty reason, but the placeholder always satisfied them, so
 * the audit log recorded the same words for every suspension, code disable and
 * commission change. Now each action opens a confirmation that says what will
 * happen and, wherever the RPC records a reason, refuses to run until the
 * operator has written one. Every one of these RPCs already writes an audit row
 * through `gellatti_write_audit_v1`.
 */
export type AdminPartnerPendingAction =
  | {
      kind:
        | 'suspend'
        | 'active'
        | 'connect'
        | 'profile-approve'
        | 'profile-disable'
        | 'logo-remove';
      partnerId: string;
      partner: string;
    }
  | {
      kind: 'code-disable' | 'code-enable';
      partnerId: string;
      partner: string;
      codeId: string;
      item: string;
    }
  | {
      kind: 'link-disable' | 'link-enable';
      partnerId: string;
      partner: string;
      linkId: string;
      item: string;
    }
  | {
      kind: 'commission';
      product: 'home' | 'pro';
      cadence: 'monthly' | 'annual';
      tier: 'standard' | 'gold' | 'elite';
      amountCents: number;
    }
  | { kind: 'activate'; partner: string };

export interface AdminActionCopy {
  title: string;
  body: string;
  confirmLabel: string;
  /** Takes something away or changes money — the notice's attention tone. */
  attention: boolean;
  /** The RPC records a reason, so the operator must write one. */
  needsReason: boolean;
}

export const REASON_REQUIRED = 'Wpisz powód — trafi do dziennika audytu.';

/** The server's own rule: a reason that is not blank. */
export const reasonProblem = (reason: string): string | null =>
  reason.trim() === '' ? REASON_REQUIRED : null;

const PRODUCT = { home: 'Home', pro: 'Pro' } as const;
const CADENCE = { monthly: 'Miesięcznie', annual: 'Rocznie' } as const;
const TIER = { standard: 'Standard', gold: 'Gold', elite: 'Elite' } as const;

const copy = (
  title: string,
  body: string,
  confirmLabel: string,
  attention: boolean,
  needsReason = true,
): AdminActionCopy => ({ title, body, confirmLabel, attention, needsReason });

export function adminPartnerActionCopy(action: AdminPartnerPendingAction): AdminActionCopy {
  switch (action.kind) {
    case 'suspend':
      return copy(
        `Zawiesić partnera ${action.partner}?`,
        'Status zmieni się na „Wstrzymany”.',
        'Zawieś',
        true,
      );
    case 'active':
      return copy(
        `Przywrócić partnera ${action.partner}?`,
        'Status zmieni się na „Aktywny”.',
        'Przywróć',
        false,
      );
    case 'connect':
      return copy(
        `Przygotować konto Connect dla ${action.partner}?`,
        'Gellatti utworzy konto wypłat Stripe Connect dla tego partnera.',
        'Przygotuj konto',
        false,
        false,
      );
    case 'profile-approve':
      return copy(
        `Zatwierdzić profil ${action.partner}?`,
        'Profil publiczny stanie się widoczny.',
        'Zatwierdź profil',
        false,
      );
    case 'profile-disable':
      return copy(
        `Wyłączyć profil ${action.partner}?`,
        'Profil publiczny i linki prowadzące do niego przestaną działać.',
        'Wyłącz profil',
        true,
      );
    case 'logo-remove':
      return copy(
        `Usunąć logo ${action.partner}?`,
        'Logo zniknie z profilu publicznego.',
        'Usuń logo',
        true,
      );
    case 'code-disable':
      return copy(
        `Wyłączyć kod ${action.item}?`,
        'Kod przestanie przypisywać nowe osoby. Jego historia i rozliczenia zostają.',
        'Wyłącz kod',
        true,
      );
    case 'code-enable':
      return copy(
        `Włączyć ponownie kod ${action.item}?`,
        'Kod znów będzie przypisywać nowe osoby.',
        'Włącz kod',
        false,
      );
    case 'link-disable':
      return copy(
        `Wyłączyć link ${action.item}?`,
        'Link przestanie przypisywać nowe osoby. Jego wyniki zostają w historii.',
        'Wyłącz link',
        true,
      );
    case 'link-enable':
      return copy(
        `Włączyć ponownie link ${action.item}?`,
        'Link znów będzie przypisywać nowe osoby.',
        'Włącz link',
        false,
      );
    case 'commission':
      return copy(
        'Utworzyć nową wersję zasad prowizji?',
        `${PRODUCT[action.product]} · ${CADENCE[action.cadence]} · ${TIER[action.tier]} · ` +
          `${action.amountCents} (w centach). Zmiana kopiuje pełną bieżącą tabelę do nowej ` +
          'wersji; historyczne wpisy prowizji zachowują poprzednią.',
        'Utwórz wersję',
        true,
      );
    case 'activate':
      return copy(
        `Aktywować ${action.partner} jako Partnera?`,
        'Konto otrzyma tryb Partner.',
        'Aktywuj',
        true,
      );
  }
}
