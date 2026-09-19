export type ScannerStoryStage =
  | 'captured'
  | 'recognized'
  | 'organizing'
  | 'verifying'
  | 'assembling'
  | 'success';

interface ScannerStoryStep {
  message: string;
  level: 0 | 24 | 50 | 75 | 90 | 100;
}

export const SCANNER_STORY: Readonly<Record<ScannerStoryStage, ScannerStoryStep>> = Object.freeze({
  captured: { message: 'Mamy to. Sprawdzam, co to za jeden.', level: 0 },
  recognized: { message: 'A, już wiem. Rozpoznaję produkt.', level: 24 },
  organizing: {
    message: 'Teraz porządkuję skład, żeby wszystko miało ręce i nogi.',
    level: 50,
  },
  verifying: {
    message: 'Chwileczkę — wysyłam brygadę do magazynu po więcej informacji.',
    level: 75,
  },
  assembling: { message: 'Dobra, mam wszystko. Kończę układać wynik.', level: 90 },
  success: { message: 'Gellattissimo! Gotowe.', level: 100 },
});

export const humanVerificationMessage =
  'Tym zajmie się człowiek z naszej ekipy. Damy znać, gdy produkt będzie gotowy.';

export const scannerConnectionMessage =
  'Nie udało się połączyć z usługą skanera. Spróbuj ponownie.';

export function scannerServiceErrorMessage(detail = ''): string {
  if (/HTTP (401|403)\b/.test(detail))
    return 'Usługa skanera nie potwierdziła dostępu. Sprawdź logowanie i spróbuj ponownie.';
  return 'Usługa skanera nie mogła sprawdzić produktu. Spróbuj ponownie.';
}

export function missingDataPromptForGaps(gaps: readonly string[]): string {
  const normalized = gaps.join(' ').toLocaleLowerCase('pl');

  if (/identity|product[_. -]?name|display[_. -]?name|brand|semantics/.test(normalized)) {
    return 'Ej, tu bez Ciebie nie damy rady. Pokaż nam jeszcze przód opakowania z nazwą produktu i lecimy dalej.';
  }
  if (/barcode|gtin|ean/.test(normalized)) {
    return 'Ej, tu bez Ciebie nie damy rady. Pokaż nam jeszcze kod kreskowy z bliska i lecimy dalej.';
  }
  if (/ingredient|allergen|skład|alergen/.test(normalized)) {
    return 'Ej, tu bez Ciebie nie damy rady. Pokaż nam jeszcze skład i alergeny i lecimy dalej.';
  }
  if (
    /nutrition|energy|kcal|kilojoule|protein|carbohydrate|sugar|fat|saturate|salt|fiber/.test(
      normalized,
    )
  ) {
    return 'Ej, tu bez Ciebie nie damy rady. Pokaż nam jeszcze tabelę wartości odżywczych i lecimy dalej.';
  }

  return 'Ej, tu bez Ciebie nie damy rady. Pokaż nam jeszcze etykietę ze składem i tabelą wartości odżywczych i lecimy dalej.';
}

interface MissingFieldPresentation {
  key?: string;
  label: string;
  unit?: string | null;
}

export function missingDataPromptForFields(fields: readonly MissingFieldPresentation[]): string {
  if (fields.length === 0) return humanVerificationMessage;

  const labels = fields.map((field) =>
    field.unit ? `${field.label} (${field.unit})` : field.label,
  );
  const phrase =
    labels.length === 1
      ? labels[0]
      : labels.length === 2
        ? `${labels[0]} i ${labels[1]}`
        : `${labels.slice(0, -1).join(', ')} i ${labels.at(-1)}`;

  return `Ej, tu bez Ciebie nie damy rady. Podaj nam jeszcze ${phrase} i lecimy dalej.`;
}
