export interface CustomerProductGapGuidance {
  question: string | null;
  explanation: string;
}

const hasAny = (gaps: readonly string[], patterns: readonly RegExp[]): boolean =>
  gaps.some((gap) => patterns.some((pattern) => pattern.test(gap.toUpperCase())));

/**
 * Translate server-only readiness codes into at most one realistic customer
 * question. Internal formulation field names never cross this presentation
 * boundary.
 */
export function customerProductGapGuidance(
  criticalGaps: readonly string[],
): CustomerProductGapGuidance {
  if (
    hasAny(criticalGaps, [
      /DOSAGE/,
      /TECHNICAL_AUTHORITY/,
      /TECHNICAL_PARAMETER/,
      /PROCESS_AUTHORITY/,
    ])
  ) {
    return {
      question: 'Czy opakowanie lub karta produktu podaje dozowanie albo sposób użycia?',
      explanation: 'To potrzebne tylko dla produktu technicznego lub zależnego od dozowania.',
    };
  }

  if (hasAny(criticalGaps, [/ALCOHOL/])) {
    return {
      question: 'Czy etykieta lub karta produktu podaje zawartość alkoholu?',
      explanation: 'Podaj ją tylko wtedy, gdy jest wyraźnie zadeklarowana przez producenta.',
    };
  }

  if (hasAny(criticalGaps, [/INGREDIENT/, /ALLERGEN/])) {
    return {
      question: 'Czy możesz sprawdzić pełny skład i deklarację alergenów na opakowaniu?',
      explanation: 'Wystarczy zdjęcie lub dokładny tekst z etykiety.',
    };
  }

  if (
    hasAny(criticalGaps, [
      /FAT_PERCENT/,
      /PROTEIN_PERCENT/,
      /CARBOHYDRATE_PERCENT/,
      /TOTAL_SUGARS_PERCENT/,
      /FIBER_PERCENT/,
      /SALT_PERCENT/,
      /KCAL_PER_100G/,
      /NUTRITION/,
    ])
  ) {
    return {
      question: 'Czy możesz sprawdzić pełną tabelę wartości odżywczych na opakowaniu?',
      explanation:
        'Najlepiej dodać wyraźne zdjęcie całej tabeli wraz z podstawą na 100 g lub 100 ml.',
    };
  }

  return {
    question: null,
    explanation:
      'Gellatti nie może jeszcze bezpiecznie ukończyć profilu z dostępnych dowodów. Produkt nie jest gotowy do receptury i żadne wartości nie zostały zmyślone.',
  };
}
