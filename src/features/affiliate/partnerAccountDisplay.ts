/**
 * E-REV-04 — the rest of `/partner` reads as copy too.
 *
 * E-REV-03 took raw contract values out of the commissions and payouts tables,
 * and D-LINK-03 out of the codes and links. Three more were still printed
 * straight onto the page: the public profile's moderation status in the
 * Profile section (`APPROVED`), and the partner's status and tier in Settings
 * (`active`, `gold`). Same treatment: every database value has copy, and an
 * unknown value degrades to a dash instead of leaking.
 */
import { statusCopyOf, type StatusCopy } from './codeLinkDisplay';

export type ProfileModerationStatus = 'APPROVED' | 'UNDER_REVIEW' | 'DISABLED';
export type PartnerStatus = 'active' | 'suspended' | 'terminated';
export type PartnerTier = 'standard' | 'gold' | 'elite';

/**
 * `partner_public_profiles.moderation_status`. Only an APPROVED profile
 * resolves publicly — `partner-link-resolve` answers 404 otherwise — so the
 * other two states say exactly that: it is what the partner needs to know.
 */
export const PROFILE_MODERATION_COPY: Readonly<Record<ProfileModerationStatus, StatusCopy>> =
  Object.freeze({
    APPROVED: { label: 'Zatwierdzony', help: 'Profil publiczny jest widoczny.' },
    UNDER_REVIEW: {
      label: 'W weryfikacji',
      help: 'Gellatti sprawdza profil. Do decyzji profil i linki prowadzące do niego nie są publicznie dostępne.',
    },
    DISABLED: {
      label: 'Wyłączony',
      help: 'Gellatti wyłączyło profil publiczny. Linki prowadzące do niego nie działają.',
    },
  });

/** `partners.status` — CHECK (status in ('active', 'suspended', 'terminated')). */
export const PARTNER_STATUS_COPY: Readonly<Record<PartnerStatus, StatusCopy>> = Object.freeze({
  active: { label: 'Aktywny', help: 'Tryb Partner jest aktywny.' },
  suspended: { label: 'Wstrzymany', help: 'Współpraca jest wstrzymana.' },
  terminated: { label: 'Zakończony', help: 'Współpraca została zakończona.' },
});

/** `partners.tier` — the programme's own level names, as `/affiliate` writes them. */
export const PARTNER_TIER_COPY: Readonly<Record<PartnerTier, StatusCopy>> = Object.freeze({
  standard: { label: 'Standard', help: 'Poziom Standard.' },
  gold: { label: 'Gold', help: 'Poziom Gold.' },
  elite: { label: 'Elite', help: 'Poziom Elite — indywidualne warunki.' },
});

export const profileModerationCopy = (value: unknown): StatusCopy =>
  statusCopyOf(PROFILE_MODERATION_COPY, value);

export const partnerStatusCopy = (value: unknown): StatusCopy =>
  statusCopyOf(PARTNER_STATUS_COPY, value);

export const partnerTierCopy = (value: unknown): StatusCopy =>
  statusCopyOf(PARTNER_TIER_COPY, value);
