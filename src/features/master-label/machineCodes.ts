import { code128, drawingSVG, ean13, ean8, itf14, qrcode, upca } from 'bwip-js/browser';

const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

export function normalizeConfirmedGtin(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/[\s-]/g, '');
  if (!/^\d+$/.test(digits) || !GTIN_LENGTHS.has(digits.length)) return null;
  const body = digits.slice(0, -1);
  const expected = Number(digits.at(-1));
  let sum = 0;
  for (let offset = 0; offset < body.length; offset += 1) {
    const digit = Number(body[body.length - 1 - offset]);
    sum += digit * (offset % 2 === 0 ? 3 : 1);
  }
  const check = (10 - (sum % 10)) % 10;
  return check === expected ? digits : null;
}

function withKind(svg: string, kind: 'qr' | 'lot' | 'gtin'): string {
  return svg.replace('<svg ', `<svg data-code-kind="${kind}" aria-label="${kind}" `);
}

function safeSvg(kind: 'qr' | 'lot' | 'gtin', render: () => string): string | null {
  try {
    return withKind(render(), kind);
  } catch {
    return null;
  }
}

export function qrCodeSvg(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  return safeSvg('qr', () =>
    qrcode(
      {
        bcid: 'qrcode',
        text,
        scale: 1,
        paddingwidth: 0,
        paddingheight: 0,
      },
      drawingSVG(),
    ),
  );
}

export function lotBarcodeSvg(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  return safeSvg('lot', () =>
    code128(
      {
        bcid: 'code128',
        text,
        includetext: true,
        textxalign: 'center',
        height: 8,
        scale: 1,
      },
      drawingSVG(),
    ),
  );
}

export function gtinBarcodeSvg(value: string | null | undefined): string | null {
  const text = normalizeConfirmedGtin(value);
  if (!text) return null;
  const encoder =
    text.length === 8 ? ean8 : text.length === 12 ? upca : text.length === 14 ? itf14 : ean13;
  return safeSvg('gtin', () =>
    encoder(
      {
        bcid: 'gtin',
        text,
        includetext: true,
        textxalign: 'center',
        height: 8,
        scale: 1,
      },
      drawingSVG(),
    ),
  );
}
