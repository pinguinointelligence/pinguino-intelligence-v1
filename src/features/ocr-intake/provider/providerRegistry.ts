/**
 * Tiny OCR-provider registry (spec §7): providers are selected by EXPLICIT id only —
 * no environment sniffing, no fallback magic. Unknown ids fail loudly.
 */

import type { OcrProvider } from '../intakeContracts';

export interface OcrProviderRegistry {
  /** ids of every registered provider, in registration order. */
  readonly providerIds: readonly string[];
  /** Return the provider with this exact id; throws on unknown ids (never guesses). */
  get(providerId: string): OcrProvider;
}

export function createOcrProviderRegistry(providers: readonly OcrProvider[]): OcrProviderRegistry {
  const byId = new Map<string, OcrProvider>();
  for (const provider of providers) {
    if (byId.has(provider.providerId)) {
      throw new Error(`duplicate OCR provider id "${provider.providerId}"`);
    }
    byId.set(provider.providerId, provider);
  }
  return {
    providerIds: [...byId.keys()],
    get(providerId: string): OcrProvider {
      const provider = byId.get(providerId);
      if (!provider) {
        const known = [...byId.keys()].join(', ') || '(none)';
        throw new Error(`unknown OCR provider "${providerId}" — registered: ${known}`);
      }
      return provider;
    },
  };
}
