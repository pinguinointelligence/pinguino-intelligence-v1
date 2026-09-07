import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { composeMasterLabelPdf } from './masterLabelPdf';
import { createCompleteLabel } from './masterLabelTestFixture';
import type { MarketProfileCode } from './marketProfiles';

const outputDirectory = process.env.LABEL_PDF_QA_DIR;
const markets: readonly MarketProfileCode[] = ['EU', 'UK', 'US', 'CA', 'AU_NZ', 'WORLD'];

describe.runIf(Boolean(outputDirectory))('independent PDF artifact fixtures', () => {
  it('writes one exact-size, content-bearing document for every renderer and Basic round', async () => {
    mkdirSync(outputDirectory!, { recursive: true });
    const manifest: Array<{
      file: string;
      market: MarketProfileCode;
      widthMm: number;
      heightMm: number;
      expectedProductText: string;
      lotCode: string;
    }> = [];

    for (const market of markets) {
      const label = createCompleteLabel(market, {
        productName: Object.fromEntries(
          createCompleteLabel(market).labelLanguages.map((language) => [
            language,
            `Gellatti PDF QA ${market}`,
          ]),
        ),
        lotCode: `LOT-PDF-QA-${market}`,
        layoutMode: 'manual',
      });
      const artifact = await composeMasterLabelPdf(label);
      const file = `${market.toLowerCase()}.pdf`;
      writeFileSync(`${outputDirectory}/${file}`, artifact.bytes);
      manifest.push({
        file,
        market,
        widthMm: artifact.widthMm,
        heightMm: artifact.heightMm,
        expectedProductText: market === 'US' ? 'Frozen dairy dessert' : `Gellatti PDF QA ${market}`,
        lotCode: label.lotCode,
      });
      expect(artifact.pageCount).toBe(1);
    }

    const roundBase = createCompleteLabel('WORLD');
    const round = createCompleteLabel('WORLD', {
      productName: { en: 'Gellatti PDF QA ROUND' },
      lotCode: 'LOT-PDF-QA-ROUND',
      format: 'round',
      size: { widthMm: 220, heightMm: 220 },
      printer: { ...roundBase.printer, widthMm: 220, heightMm: 220, copies: 1 },
      layoutMode: 'manual',
    });
    const roundArtifact = await composeMasterLabelPdf(round);
    writeFileSync(`${outputDirectory}/round.pdf`, roundArtifact.bytes);
    manifest.push({
      file: 'round.pdf',
      market: 'WORLD',
      widthMm: 220,
      heightMm: 220,
      expectedProductText: 'Gellatti PDF QA ROUND',
      lotCode: round.lotCode,
    });
    writeFileSync(`${outputDirectory}/manifest.json`, JSON.stringify(manifest, null, 2));
    expect(roundArtifact.pageCount).toBe(1);
  });
});
