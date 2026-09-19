/**
 * I-ADM-02 — find a partner in the admin list.
 *
 * The admin Partners panel rendered every partner with no way to find one. A
 * search now matches the account e-mail, the public display name and slug, any
 * code the partner holds (aliases included) and the partner id; a status
 * filter narrows to active, suspended or terminated partners. It runs over the
 * rows the admin RPC already returns — no database change.
 */
export type AdminPartnerStatusFilter = 'all' | 'active' | 'suspended' | 'terminated';

type Row = Readonly<Record<string, unknown>>;

const lower = (value: unknown): string => (typeof value === 'string' ? value.toLowerCase() : '');

export function filterAdminPartners<T extends Row>(
  rows: readonly T[],
  filter: { readonly query: string; readonly status: AdminPartnerStatusFilter },
): T[] {
  const query = filter.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.status !== 'all' && row.status !== filter.status) return false;
    if (query === '') return true;
    const profile = (row.profile ?? {}) as Row;
    const codes = Array.isArray(row.codes) ? (row.codes as Row[]) : [];
    const haystack = [
      lower(row.email),
      lower(profile.display_name),
      lower(profile.slug),
      lower(row.id),
      ...codes.map((code) => lower(code.code)),
    ];
    return haystack.some((value) => value.includes(query));
  });
}
