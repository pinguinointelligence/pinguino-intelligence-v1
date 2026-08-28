import type { MasterLabelData } from './masterLabel';

/** Owner-supplied official public wordmark. It intentionally contains no AI suffix. */
export const OFFICIAL_GELLATTI_WORDMARK_URL = '/brand/gellatti-wordmark-graphite.svg';

const isGellattiPublicBrand = (businessName: string): boolean =>
  /^gellatti(?:\s|$|[-—(])/i.test(businessName.trim());

/**
 * Label output is a public artifact, so Gellatti-owned labels use the approved
 * public wordmark instead of a legacy account upload. Other account brands are
 * kept exactly as supplied.
 */
export function resolveMasterLabelLogoUrl(
  data: Pick<MasterLabelData, 'businessName'>,
  accountLogoUrl: string | null | undefined,
): string | null {
  if (isGellattiPublicBrand(data.businessName)) return OFFICIAL_GELLATTI_WORDMARK_URL;
  return accountLogoUrl ?? null;
}
