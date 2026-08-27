import { describe, expect, it } from 'vitest';
import {
  CustomerOperationError,
  toCustomerSafeError,
  type CustomerErrorContext,
} from './customerError';

const forbidden =
  /(?:supabase|postgrest|edge function|non-2xx|row-level security|rls|jwt|provider|stack|fetch failed|failed to fetch|sqlstate|duplicate key)/i;

describe('toCustomerSafeError', () => {
  it('maps provider authentication failures to a typed, actionable message', () => {
    const error = toCustomerSafeError(
      new Error('Invalid login credentials from GoTrue provider'),
      'auth',
    );

    expect(error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(error.message).toBe('Sprawdź adres e-mail i hasło, a potem spróbuj ponownie.');
    expect(error.actionLabel).toBe('Spróbuj ponownie');
    expect(error.diagnostic?.rawMessage).toContain('GoTrue provider');
    expect(error.message).not.toMatch(forbidden);
  });

  it('keeps typed application codes while raw details remain diagnostic-only', () => {
    const error = toCustomerSafeError(
      new CustomerOperationError(
        'LABEL_SAVE_FAILED',
        new Error('PostgREST SQLSTATE 42501 row-level security'),
      ),
      'labels',
    );

    expect(error.code).toBe('LABEL_SAVE_FAILED');
    expect(error.message).toBe(
      'Nie udało się zapisać etykiety. Dane pozostały bez zmian — spróbuj ponownie.',
    );
    expect(error.diagnostic?.rawMessage).toMatch(/PostgREST/);
    expect(error.message).not.toMatch(forbidden);
  });

  it('turns an expired-session provider error into a safe sign-in instruction', () => {
    const error = toCustomerSafeError(
      new Error('You must be signed in to add a product.'),
      'catalog',
    );

    expect(error.code).toBe('AUTH_REQUIRED');
    expect(error.message).toBe('Sesja wygasła. Zaloguj się ponownie i powtórz tę czynność.');
    expect(error.message).not.toContain('signed in');
  });

  it.each<CustomerErrorContext>([
    'account',
    'recipes',
    'production',
    'labels',
    'scanner',
    'catalog',
    'community',
    'partner',
    'admin',
    'shared',
  ])('never returns raw infrastructure copy in the %s customer message', (context) => {
    const error = toCustomerSafeError(
      new Error('Edge Function returned a non-2xx status code: JWT expired'),
      context,
    );

    expect(error.message).not.toMatch(forbidden);
    expect(error.title).not.toMatch(forbidden);
    expect(error.actionLabel).toBe('Spróbuj ponownie');
  });

  it('uses no Italian accent in errors, blockers or safety contexts', () => {
    const copy = [
      toCustomerSafeError(new Error('network down'), 'production'),
      toCustomerSafeError(new Error('network down'), 'labels'),
      toCustomerSafeError(new Error('network down'), 'account'),
    ]
      .flatMap((item) => [item.title, item.message, item.actionLabel])
      .join(' ');

    expect(copy).not.toMatch(/mamma mia|perfetto|andiamo|bellissimo/i);
  });
});
