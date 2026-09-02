import type { MasterLabelData } from '../masterLabel';
import { renderAuNzLabel } from './auNz';
import { renderCanadaLabel } from './canada';
import { renderEuLabel } from './eu';
import { renderUkLabel } from './uk';
import { renderUsLabel } from './us';
import { renderWorldLabel } from './world';

export interface MarketLabelRenderer {
  market: MasterLabelData['market'];
  version: string;
  renderHtml(data: MasterLabelData): string;
}

export const MARKET_LABEL_RENDERERS: Readonly<
  Record<MasterLabelData['market'], MarketLabelRenderer>
> = Object.freeze({
  EU: { market: 'EU', version: 'eu-label-v2', renderHtml: renderEuLabel },
  UK: { market: 'UK', version: 'uk-label-v2', renderHtml: renderUkLabel },
  US: { market: 'US', version: 'fda-nutrition-facts-v2', renderHtml: renderUsLabel },
  CA: { market: 'CA', version: 'canada-nft-v2', renderHtml: renderCanadaLabel },
  AU_NZ: { market: 'AU_NZ', version: 'fsanz-nip-v2', renderHtml: renderAuNzLabel },
  WORLD: { market: 'WORLD', version: 'world-neutral-v1', renderHtml: renderWorldLabel },
});

export function renderMarketLabelHtml(data: MasterLabelData): string {
  return MARKET_LABEL_RENDERERS[data.market].renderHtml(data);
}
