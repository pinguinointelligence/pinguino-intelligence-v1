import { shopCopy } from '@/copy/shop';

/**
 * Countries and languages named in the Shop copy's own language ("BE" → "Belgia",
 * "nl" → "niderlandzki"), from the platform's CLDR data rather than a hand-kept list.
 * An unknown code is shown as the code itself, never as a guess.
 */
export const languageDisplayName = (
  code: string,
  locale: string = shopCopy.infopak.displayLocale,
): string => {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
};

export const regionDisplayName = (
  iso2: string,
  locale: string = shopCopy.infopak.displayLocale,
): string => {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(iso2) ?? iso2;
  } catch {
    return iso2;
  }
};
