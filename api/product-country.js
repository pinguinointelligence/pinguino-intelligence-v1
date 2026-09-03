const normalizeCountry = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
};

/** Vercel supplies x-vercel-ip-country from coarse request IP metadata. This
 * endpoint returns only ISO-2 country; it never requests or stores precise GPS. */
export default function handler(request, response) {
  const raw = request.headers['x-vercel-ip-country'];
  const country = normalizeCountry(Array.isArray(raw) ? raw[0] : raw);
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.status(200).json({ country });
}
