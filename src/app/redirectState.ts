export const legacyDestinationRedirectTo = (
  pathname: string,
  search: string,
  forcedSearch: Readonly<Record<string, string>> = {},
  hash = '',
): { pathname: string; search: string; hash: string } => {
  const params = new URLSearchParams(search);
  for (const [key, value] of Object.entries(forcedSearch)) params.set(key, value);
  const serialized = params.toString();
  return { pathname, search: serialized ? `?${serialized}` : '', hash };
};
