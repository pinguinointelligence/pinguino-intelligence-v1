export const AUTHORITY_PAGE_SIZE = 500;

const AUTHORITY_READ_MAX_ATTEMPTS = 3;

type AuthorityPageResponse = {
  data: unknown;
  error: unknown;
};

const authorityErrorText = (error: unknown): string => {
  if (!error || typeof error !== 'object') return String(error ?? '');
  const value = error as Record<string, unknown>;
  return [value.code, value.message, value.details, value.hint]
    .filter((part): part is string => typeof part === 'string')
    .join(' ');
};

export const isAuthorityStatementTimeout = (error: unknown): boolean =>
  /(?:^|\s)57014(?:\s|$)|statement timeout|canceling statement due to statement timeout/i.test(
    authorityErrorText(error),
  );

export async function readAuthorityPage<Row>(
  query: () => PromiseLike<AuthorityPageResponse>,
  failureCode: string,
): Promise<Row[]> {
  for (let attempt = 1; attempt <= AUTHORITY_READ_MAX_ATTEMPTS; attempt += 1) {
    const { data, error } = await query();
    if (!error) return (Array.isArray(data) ? data : []) as Row[];
    if (!isAuthorityStatementTimeout(error) || attempt === AUTHORITY_READ_MAX_ATTEMPTS) {
      throw new Error(failureCode);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 75));
  }
  throw new Error(failureCode);
}
