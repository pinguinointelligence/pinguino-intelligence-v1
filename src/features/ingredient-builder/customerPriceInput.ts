export function parseCustomerPriceText(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (!/^[0-9]+(?:[.][0-9]{1,4})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
