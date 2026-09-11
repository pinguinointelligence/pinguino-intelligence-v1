import { describe, expect, it, vi } from 'vitest';
import {
  AUTHORITY_PAGE_SIZE,
  isAuthorityStatementTimeout,
  readAuthorityPage,
} from '../../../supabase/functions/_shared/authorityPagination';

describe('scanner authority pagination', () => {
  it('SCN-LOAD-01 uses bounded pages and retries a transient SQL statement timeout', async () => {
    vi.useFakeTimers();
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: '57014', message: 'canceling statement due to statement timeout' },
      })
      .mockResolvedValueOnce({ data: [{ ingredient_id: 'SUGAR' }], error: null });

    const resultPromise = readAuthorityPage<{ ingredient_id: string }>(
      query,
      'authority_read_failed',
    );
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual([{ ingredient_id: 'SUGAR' }]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(AUTHORITY_PAGE_SIZE).toBe(500);
    vi.useRealTimers();
  });

  it('SCN-LOAD-02 does not retry non-timeout database failures', async () => {
    const query = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied' },
    });

    await expect(readAuthorityPage(query, 'authority_read_failed')).rejects.toThrow(
      'authority_read_failed',
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(isAuthorityStatementTimeout({ code: '42501' })).toBe(false);
  });
});
