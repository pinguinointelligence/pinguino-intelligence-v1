export type CustomerErrorContext =
  | 'auth'
  | 'account'
  | 'recipes'
  | 'production'
  | 'labels'
  | 'scanner'
  | 'catalog'
  | 'community'
  | 'partner'
  | 'admin'
  | 'shared';

export type CustomerErrorCode =
  | 'AUTH_UNAVAILABLE'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_EMAIL_UNCONFIRMED'
  | 'AUTH_ACCOUNT_EXISTS'
  | 'AUTH_REQUIRED'
  | 'AUTH_REQUEST_FAILED'
  | 'NETWORK_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'ACCOUNT_OPERATION_FAILED'
  | 'RECIPE_SAVE_FAILED'
  | 'PRODUCTION_READ_FAILED'
  | 'PRODUCTION_SAVE_FAILED'
  | 'LABEL_READ_FAILED'
  | 'LABEL_SAVE_FAILED'
  | 'SCANNER_ANALYSIS_FAILED'
  | 'SCANNER_SAVE_FAILED'
  | 'CATALOG_OPERATION_FAILED'
  | 'COMMUNITY_OPERATION_FAILED'
  | 'PARTNER_OPERATION_FAILED'
  | 'ADMIN_OPERATION_FAILED'
  | 'REQUEST_FAILED';

export interface CustomerErrorDiagnostic {
  errorName: string | null;
  rawMessage: string;
}

export interface CustomerSafeError {
  code: CustomerErrorCode;
  title: string;
  message: string;
  actionLabel: 'Spróbuj ponownie';
  diagnostic: CustomerErrorDiagnostic | null;
}

type CustomerErrorCopy = Pick<CustomerSafeError, 'title' | 'message'>;

const COPY: Readonly<Record<CustomerErrorCode, CustomerErrorCopy>> = {
  AUTH_UNAVAILABLE: {
    title: 'Logowanie jest teraz niedostępne',
    message: 'Spróbuj ponownie za chwilę.',
  },
  AUTH_INVALID_CREDENTIALS: {
    title: 'Nie udało się zalogować',
    message: 'Sprawdź adres e-mail i hasło, a potem spróbuj ponownie.',
  },
  AUTH_EMAIL_UNCONFIRMED: {
    title: 'Potwierdź adres e-mail',
    message: 'Otwórz wiadomość od Gellatti i potwierdź adres, a potem zaloguj się ponownie.',
  },
  AUTH_ACCOUNT_EXISTS: {
    title: 'To konto już istnieje',
    message: 'Zaloguj się albo użyj innego adresu e-mail.',
  },
  AUTH_REQUIRED: {
    title: 'Zaloguj się ponownie',
    message: 'Sesja wygasła. Zaloguj się ponownie i powtórz tę czynność.',
  },
  AUTH_REQUEST_FAILED: {
    title: 'Nie udało się dokończyć logowania',
    message: 'Dane logowania pozostały bez zmian. Spróbuj ponownie.',
  },
  NETWORK_UNAVAILABLE: {
    title: 'Brak połączenia',
    message: 'Sprawdź internet i spróbuj ponownie.',
  },
  RATE_LIMITED: {
    title: 'Potrzebujemy krótkiej przerwy',
    message: 'Odczekaj chwilę i spróbuj ponownie.',
  },
  ACCOUNT_OPERATION_FAILED: {
    title: 'Nie udało się zaktualizować konta',
    message: 'Ustawienia pozostały bez zmian. Spróbuj ponownie.',
  },
  RECIPE_SAVE_FAILED: {
    title: 'Nie udało się zapisać receptury',
    message: 'Receptura pozostała na ekranie. Spróbuj zapisać ją ponownie.',
  },
  PRODUCTION_READ_FAILED: {
    title: 'Nie udało się odczytać produkcji',
    message: 'Dane partii pozostały bez zmian. Spróbuj ponownie.',
  },
  PRODUCTION_SAVE_FAILED: {
    title: 'Nie udało się zapisać partii',
    message: 'Nie zmieniliśmy danych produkcji. Spróbuj ponownie.',
  },
  LABEL_READ_FAILED: {
    title: 'Nie udało się odczytać etykiety',
    message: 'Dane partii pozostały bez zmian. Spróbuj ponownie.',
  },
  LABEL_SAVE_FAILED: {
    title: 'Nie udało się zapisać etykiety',
    message: 'Nie udało się zapisać etykiety. Dane pozostały bez zmian — spróbuj ponownie.',
  },
  SCANNER_ANALYSIS_FAILED: {
    title: 'Nie udało się odczytać etykiety',
    message: 'Dodaj wyraźniejsze zdjęcie i spróbuj ponownie.',
  },
  SCANNER_SAVE_FAILED: {
    title: 'Nie udało się zapisać produktu',
    message: 'Wynik analizy pozostał na ekranie. Spróbuj zapisać ponownie.',
  },
  CATALOG_OPERATION_FAILED: {
    title: 'Nie udało się odświeżyć katalogu',
    message: 'Spróbuj ponownie za chwilę.',
  },
  COMMUNITY_OPERATION_FAILED: {
    title: 'Nie udało się dokończyć tej czynności',
    message: 'Twoja receptura pozostała bez zmian. Spróbuj ponownie.',
  },
  PARTNER_OPERATION_FAILED: {
    title: 'Nie udało się zapisać zmiany',
    message: 'Dane partnera pozostały bez zmian. Spróbuj ponownie.',
  },
  ADMIN_OPERATION_FAILED: {
    title: 'Nie udało się wykonać operacji',
    message:
      'Żadne dane nie zostały zmienione. Sprawdź szczegóły diagnostyczne lub spróbuj ponownie.',
  },
  REQUEST_FAILED: {
    title: 'Coś przerwało tę czynność',
    message: 'Dane pozostały bez zmian. Spróbuj ponownie.',
  },
};

const DEFAULT_CODE_BY_CONTEXT: Readonly<Record<CustomerErrorContext, CustomerErrorCode>> = {
  auth: 'AUTH_REQUEST_FAILED',
  account: 'ACCOUNT_OPERATION_FAILED',
  recipes: 'RECIPE_SAVE_FAILED',
  production: 'PRODUCTION_SAVE_FAILED',
  labels: 'LABEL_SAVE_FAILED',
  scanner: 'SCANNER_ANALYSIS_FAILED',
  catalog: 'CATALOG_OPERATION_FAILED',
  community: 'COMMUNITY_OPERATION_FAILED',
  partner: 'PARTNER_OPERATION_FAILED',
  admin: 'ADMIN_OPERATION_FAILED',
  shared: 'REQUEST_FAILED',
};

export class CustomerOperationError extends Error {
  readonly code: CustomerErrorCode;
  readonly diagnosticCause: unknown;

  constructor(code: CustomerErrorCode, diagnosticCause?: unknown) {
    super(COPY[code].message);
    this.name = 'CustomerOperationError';
    this.code = code;
    this.diagnosticCause = diagnosticCause;
  }
}

function rawDiagnostic(cause: unknown): CustomerErrorDiagnostic | null {
  const source = cause instanceof CustomerOperationError ? cause.diagnosticCause : cause;
  if (source instanceof Error) {
    return { errorName: source.name || null, rawMessage: source.message || source.name };
  }
  if (typeof source === 'string' && source.trim()) {
    return { errorName: null, rawMessage: source.trim() };
  }
  if (source === null || source === undefined) return null;
  try {
    return { errorName: null, rawMessage: JSON.stringify(source) };
  } catch {
    return { errorName: null, rawMessage: 'unserializable_error' };
  }
}

function inferredCode(cause: unknown, context: CustomerErrorContext): CustomerErrorCode {
  if (cause instanceof CustomerOperationError) return cause.code;
  const raw = rawDiagnostic(cause)?.rawMessage.toLowerCase() ?? '';
  if (/invalid login credentials|invalid credentials|wrong password/.test(raw)) {
    return 'AUTH_INVALID_CREDENTIALS';
  }
  if (/email not confirmed|email.*unconfirmed/.test(raw)) return 'AUTH_EMAIL_UNCONFIRMED';
  if (/already registered|user already exists|already been registered/.test(raw)) {
    return 'AUTH_ACCOUNT_EXISTS';
  }
  if (/must be signed in|not authenticated|authentication required|jwt expired/.test(raw)) {
    return 'AUTH_REQUIRED';
  }
  if (/provider is not enabled|sign-in is not available|auth.*not configured/.test(raw)) {
    return 'AUTH_UNAVAILABLE';
  }
  if (/rate.?limit|too many requests|quota/.test(raw)) return 'RATE_LIMITED';
  if (/failed to fetch|fetch failed|network|offline|connection/.test(raw)) {
    return 'NETWORK_UNAVAILABLE';
  }
  return DEFAULT_CODE_BY_CONTEXT[context];
}

export function toCustomerSafeError(
  cause: unknown,
  context: CustomerErrorContext = 'shared',
): CustomerSafeError {
  const code = inferredCode(cause, context);
  return {
    code,
    ...COPY[code],
    actionLabel: 'Spróbuj ponownie',
    diagnostic: rawDiagnostic(cause),
  };
}

export function customerErrorMessage(
  cause: unknown,
  context: CustomerErrorContext = 'shared',
  code?: CustomerErrorCode,
): string {
  return toCustomerSafeError(code ? new CustomerOperationError(code, cause) : cause, context)
    .message;
}

export const customerErrorCopy = COPY;
