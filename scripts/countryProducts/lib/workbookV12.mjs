// Reader for GELLATTI_BAZA_GELATO_75_KRAJOW_v12_SYNC.xlsx.
//
// Every column is addressed by letter AND its exact header text. A later
// workbook with a moved or renamed column fails loudly here instead of being
// read into the wrong field.

import * as XLSX from 'xlsx';
import { cleanText } from './text.mjs';

export const V12_WORKBOOK = Object.freeze({
  basename: 'GELLATTI_BAZA_GELATO_75_KRAJOW_v12_SYNC.xlsx',
  sha256: '09864e8602a6a7d3a89838091ce83dec7659bd2143517b5831d86f8d2f356172',
});

const c = (col, header) => Object.freeze({ col, header });

const SELECTION_SHEETS = Object.freeze({
  MILK: {
    sheet: '11_MLEKO_75',
    columns: {
      iso: c('A', 'ISO'),
      countryName: c('B', 'Kraj'),
      product: c('C', 'Wybrany produkt'),
      pack: c('D', 'Opakowanie / jednostka GTIN'),
      ean: c('E', 'EAN / GTIN'),
      targetFat: c('F', 'Cel tłuszczu %'),
      fat: c('G', 'Tłuszcz g'),
      energyKcal: c('H', 'kcal'),
      saturatedFat: c('I', 'Nasycone g'),
      carbohydrate: c('J', 'Węglowodany g'),
      sugars: c('K', 'Cukry g'),
      protein: c('L', 'Białko g'),
      salt: c('M', 'Sól g'),
      completeness: c('N', 'Komplet danych'),
      proposalKey: c('O', 'Proposal key'),
      finalPrIng: c('P', 'Końcowy PR-ING'),
      sources: c('Q', 'Źródła'),
      correction: c('R', 'Rozwiązanie / korekta'),
      fibre: c('S', 'Błonnik g / granica'),
      gtinCheck: c('T', 'Dowód GTIN'),
      deltaToTarget: c('U', 'Δ tłuszczu do 3,5'),
    },
  },
  CREAM: {
    sheet: '14_SMIETANKA_75',
    columns: {
      iso: c('A', 'ISO'),
      countryName: c('B', 'Kraj'),
      product: c('C', 'Wybrany produkt'),
      pack: c('D', 'Opakowanie / jednostka GTIN'),
      ean: c('E', 'EAN / GTIN'),
      targetFat: c('F', 'Cel tłuszczu %'),
      fat: c('G', 'Tłuszcz g'),
      energyKcal: c('H', 'kcal'),
      saturatedFat: c('I', 'Nasycone g'),
      carbohydrate: c('J', 'Węglowodany g'),
      sugars: c('K', 'Cukry g'),
      protein: c('L', 'Białko g'),
      salt: c('M', 'Sól g'),
      completeness: c('N', 'Pochodzenie profilu'),
      proposalKey: c('O', 'Proposal key'),
      finalPrIng: c('P', 'Końcowy PR-ING'),
      sources: c('Q', 'Źródła'),
      correction: c('R', 'Korekta / zamiennik'),
      fibre: c('S', 'Błonnik g / granica'),
      gtinCheck: c('T', 'Suma kontrolna GTIN'),
      deltaToTarget: c('U', 'Δ tłuszczu do 30'),
      nominalFat: c('V', 'Tłuszcz nominalny %'),
      matchCondition: c('W', 'Warunek dopasowania'),
      estimatedFields: c('X', 'Pola ESTIMATED'),
    },
  },
  SMP: {
    sheet: '17_PROSZEK_75',
    columns: {
      iso: c('A', 'ISO'),
      countryName: c('B', 'Kraj'),
      product: c('C', 'Wybrany produkt'),
      pack: c('D', 'Opakowanie'),
      ean: c('E', 'EAN / GTIN'),
      targetFat: c('F', 'Cel tłuszczu'),
      fat: c('G', 'Tłuszcz g'),
      energyKcal: c('H', 'kcal'),
      saturatedFat: c('I', 'Nasycone g'),
      carbohydrate: c('J', 'Węglowodany g'),
      sugars: c('K', 'Cukry g'),
      protein: c('L', 'Białko g'),
      salt: c('M', 'Sól g'),
      completeness: c('N', 'Pochodzenie 7 pól'),
      piIngId: c('O', 'PI-ING'),
      proposalKey: c('P', 'Proposal key'),
      manufacturerOrSupplier: c('Q', 'Producent / dostawca'),
      origin: c('R', 'Pochodzenie produktu'),
      ingredients: c('S', 'Skład'),
      allergens: c('T', 'Alergeny'),
      offerConditions: c('U', 'Dostępność / warunki'),
      sources: c('V', 'Źródła'),
      correction: c('W', 'Korekta materiału wejściowego'),
      estimatesText: c('X', 'Estymacje i braki'),
      sku: c('Y', 'SKU / kod dostawcy'),
      fibre: c('Z', 'Błonnik g'),
    },
  },
  DEXTROSE: {
    sheet: '20_DEKSTROZA_75',
    columns: {
      iso: c('A', 'ISO'),
      countryName: c('B', 'Kraj'),
      product: c('C', 'Wybrany produkt'),
      pack: c('D', 'Opakowanie'),
      ean: c('E', 'EAN / GTIN'),
      form: c('F', 'Postać'),
      energyKcal: c('G', 'kcal'),
      fat: c('H', 'Tłuszcz g'),
      saturatedFat: c('I', 'Nasycone g'),
      carbohydrate: c('J', 'Węglowodany g'),
      sugars: c('K', 'Cukry g'),
      protein: c('L', 'Białko g'),
      salt: c('M', 'Sól g'),
      completeness: c('N', 'Status 7 pól'),
      proposalKey: c('O', 'Proposal key'),
      piIngId: c('P', 'PI-ING'),
      brand: c('Q', 'Marka'),
      manufacturerOrSupplier: c('R', 'Dostawca'),
      origin: c('S', 'Pochodzenie'),
      ingredients: c('T', 'Skład'),
      allergens: c('U', 'Alergeny'),
      offerConditions: c('V', 'Warunki oferty'),
      sources: c('W', 'Źródła'),
      correction: c('X', 'Korekta wejścia'),
      estimatesText: c('Y', 'Estymacje'),
      sku: c('Z', 'SKU / ID oferty'),
      waterModel: c('AA', 'Woda MODEL PI g'),
      activeDextroseModel: c('AB', 'Aktywna dekstroza MODEL PI g'),
      fibre: c('AC', 'Błonnik g'),
    },
  },
  STABILIZER: {
    sheet: '23_TARA_75',
    columns: {
      iso: c('A', 'ISO'),
      countryName: c('B', 'Kraj'),
      product: c('C', 'Wybrany produkt'),
      pack: c('D', 'Opakowanie'),
      ean: c('E', 'EAN / GTIN'),
      offerChannel: c('F', 'Kanał oferty'),
      energyKcal: c('G', 'kcal'),
      fat: c('H', 'Tłuszcz g'),
      saturatedFat: c('I', 'Nasycone g'),
      carbohydrate: c('J', 'Węglowodany dostępne g'),
      sugars: c('K', 'Cukry g'),
      protein: c('L', 'Białko g'),
      salt: c('M', 'Sól g'),
      completeness: c('N', 'Status 8 pól'),
      proposalKey: c('O', 'Proposal key'),
      piIngId: c('P', 'PI-ING'),
      brand: c('Q', 'Marka'),
      manufacturerOrSupplier: c('R', 'Dostawca'),
      origin: c('S', 'Pochodzenie'),
      ingredients: c('T', 'Skład'),
      allergens: c('U', 'Alergeny'),
      offerConditions: c('V', 'Warunki oferty'),
      sources: c('W', 'Źródła'),
      correction: c('X', 'Korekta wejścia'),
      estimatesText: c('Y', 'Estymacje'),
      sku: c('Z', 'SKU / ID oferty'),
      water: c('AA', 'Woda przyjęta g'),
      activityModel: c('AB', 'Aktywność MODEL PI'),
      fibre: c('AC', 'Błonnik g'),
      carbohydrateConvention: c('AD', 'Konwencja węglowodanów'),
      viscosity: c('AE', 'Lepkość źródłowa'),
      technicalNotes: c('AF', 'Uwagi techniczne i energia'),
    },
  },
});

const PORTION_COLUMNS = {
  energyKj: null,
  energyKcal: null,
  fat: null,
  saturatedFat: null,
  carbohydrate: null,
  sugars: null,
  protein: null,
  fibre: null,
  salt: null,
  sodiumMg: null,
};

const CALCULATION_SHEETS = Object.freeze({
  MILK: {
    sheet: '13_PRZELICZENIA',
    columns: {
      iso: c('A', 'ISO'),
      portion: c('B', 'Porcja'),
      basisUnit: c('C', 'Jednostka'),
      energyKcal: c('D', 'kcal etykiety'),
      energyKj: c('E', 'kJ etykiety'),
      fat: c('F', 'Tłuszcz g'),
      saturatedFat: c('G', 'Nasycone g'),
      carbohydrate: c('H', 'Węglowodany g'),
      sugars: c('I', 'Cukry g'),
      protein: c('J', 'Białko g'),
      fibre: c('K', 'Błonnik g / granica'),
      salt: c('L', 'Sól g'),
      sodiumMg: c('M', 'Sód mg'),
      fibrePer100: c('X', 'Błonnik /100'),
      sources: c('Z', 'Źródła'),
      notes: c('AA', 'Uwagi do podstawy'),
    },
  },
  CREAM: {
    sheet: '15_CREAM_PRZELICZENIA',
    columns: {
      iso: c('A', 'ISO'),
      portion: c('B', 'Porcja'),
      basisUnit: c('C', 'Jednostka źródła'),
      energyKcal: c('D', 'kcal etykiety'),
      energyKj: c('E', 'kJ etykiety'),
      fat: c('F', 'Tłuszcz g'),
      saturatedFat: c('G', 'Nasycone g'),
      carbohydrate: c('H', 'Węglowodany g'),
      sugars: c('I', 'Cukry g'),
      protein: c('J', 'Białko g'),
      fibre: c('K', 'Błonnik g / granica'),
      salt: c('L', 'Sól g'),
      sodiumMg: c('M', 'Sód mg'),
      fibrePer100: c('X', 'Błonnik /100'),
      sources: c('Z', 'Źródła'),
      notes: c('AA', 'Dowody i ograniczenia'),
      sugarsEstimated: c('AB', 'Cukry ESTIMATED /100'),
      estimateSource: c('AC', 'Źródło estymacji'),
      estimateMethod: c('AD', 'Metoda estymacji'),
    },
  },
  SMP: {
    sheet: '18_SMP_PRZELICZENIA',
    columns: {
      iso: c('A', 'ISO'),
      product: c('B', 'Produkt'),
      portion: c('C', 'Masa porcji proszku g'),
      energyKj: c('D', 'kJ / porcję'),
      energyKcal: c('E', 'kcal / porcję'),
      fat: c('F', 'Tłuszcz / porcję'),
      saturatedFat: c('G', 'Nasycone / porcję'),
      carbohydrate: c('H', 'Węglowodany / porcję'),
      sugars: c('I', 'Cukry / porcję'),
      protein: c('J', 'Białko / porcję'),
      fibre: c('K', 'Błonnik / porcję'),
      salt: c('L', 'Sól g / porcję'),
      sodiumMg: c('M', 'Sód mg / porcję'),
      basisUnit: c('P', 'Podstawa etykiety'),
      sources: c('Q', 'Źródła'),
      method: c('R', 'Metoda i dowód'),
      notes: c('S', 'Uwagi źródłowe'),
      fibrePer100: c('AA', 'Błonnik /100 g'),
      estimatedFields: c('AB', 'Pola szacowane (7)'),
      status: c('AC', 'Status 7 pól'),
    },
  },
  DEXTROSE: {
    sheet: '21_DEX_PRZELICZENIA',
    columns: {
      iso: c('A', 'ISO'),
      product: c('B', 'Produkt'),
      portion: c('C', 'Masa porcji g'),
      energyKj: c('D', 'kJ porcji'),
      energyKcal: c('E', 'kcal porcji'),
      fat: c('F', 'Tłuszcz porcji'),
      saturatedFat: c('G', 'NKT porcji'),
      carbohydrate: c('H', 'Węglowodany porcji'),
      sugars: c('I', 'Cukry porcji'),
      protein: c('J', 'Białko porcji'),
      fibre: c('K', 'Błonnik porcji'),
      salt: c('L', 'Sól g porcji'),
      sodiumMg: c('M', 'Sód mg porcji'),
      modelBasis: c('Y', 'Podstawa modelu'),
      formEvidence: c('Z', 'Dowód postaci'),
      status: c('AL', 'Status7pól'),
      estimatedFields: c('AM', 'Pola estymowane'),
      labelCheck: c('AN', 'Kontrola NIP'),
      modelCheck: c('AO', 'Kontrola modelu'),
      sources: c('AP', 'Źródła'),
      notes: c('AQ', 'Dowody i uwagi'),
    },
  },
  STABILIZER: {
    sheet: '24_TARA_PRZELICZENIA',
    columns: {
      iso: c('A', 'ISO'),
      product: c('B', 'Produkt'),
      portion: c('C', 'Masa porcji g'),
      energyKj: c('D', 'kJ porcji'),
      energyKcal: c('E', 'kcal porcji'),
      fat: c('F', 'Tłuszcz porcji'),
      saturatedFat: c('G', 'NKT porcji'),
      carbohydrate: c('H', 'Węglowodany porcji'),
      sugars: c('I', 'Cukry porcji'),
      protein: c('J', 'Białko porcji'),
      fibre: c('K', 'Błonnik porcji'),
      salt: c('L', 'Sól g porcji'),
      sodiumMg: c('M', 'Sód mg porcji'),
      carbohydrateConvention: c('W', 'Konwencja węglowodanów'),
      waterSource: c('X', 'Woda źródłowa g /100g'),
      waterAccepted: c('Y', 'Woda przyjęta g'),
      baseGrams: c('AB', 'Masa w bazie g'),
      baseDosePercent: c('AC', 'Dawka bazy %'),
      status: c('AL', 'Status 8 pól'),
      estimatedFields: c('AM', 'Pola estymowane'),
      macroCheck: c('AN', 'Kontrola makroskładników'),
      sources: c('AP', 'Źródła'),
      notes: c('AQ', 'Dowody i uwagi'),
      energyCheck: c('AR', 'Kontrola energii'),
      energyReference: c('AS', 'Energia odniesienia 9/4/4/2'),
      waterOrigin: c('AT', 'Pochodzenie wody / aktywności'),
    },
  },
});

const TABLES = Object.freeze({
  base: {
    sheet: '01_BAZA_PI',
    headerRow: 5,
    keyTest: (value) => typeof value === 'number',
    columns: {
      position: c('A', 'Lp.'),
      role: c('B', 'Rola'),
      ingredient: c('C', 'Składnik'),
      grams: c('D', 'g'),
      share: c('E', '% bazy'),
      piIngId: c('F', 'PI-ING'),
      mapperName: c('G', 'Exact Mapper name'),
      referenceParameter: c('H', 'Parametr referencyjny'),
      target: c('I', 'Cel'),
      approvedBase: c('J', 'Approved base'),
      approvedEngines: c('K', 'Approved engines'),
      processMessage: c('L', 'Komunikat procesowy'),
      notes: c('M', 'Uwagi'),
    },
  },
  countries: {
    sheet: '02_KRAJE_75',
    headerRow: 5,
    columns: {
      iso2: c('A', 'ISO2'),
      iso3: c('B', 'ISO3'),
      namePl: c('C', 'Kraj'),
      nameEn: c('D', 'Country'),
      region: c('E', 'Region'),
      priority: c('F', 'Priorytet'),
      expectedRoles: c('G', 'Oczekiwane role'),
      readyRoles: c('H', 'READY role'),
      blockerRoles: c('I', 'BLOKER / HOLD role'),
      status: c('J', 'Status kraju'),
      hot15: c('K', 'HOT15'),
      publicationCondition: c('L', 'Warunek publikacji'),
    },
  },
  regions: {
    sheet: '03_ROUTING_22',
    headerRow: 5,
    columns: {
      code: c('A', 'Kod regionu'),
      name: c('B', 'Region'),
      countries: c('C', 'Kraje ISO2'),
      count: c('D', 'Liczba'),
      type: c('E', 'Typ'),
      sharedResearch: c('F', 'Wspólny research'),
      exactPrRule: c('G', 'Reguła exact PR'),
      status: c('K', 'Status'),
    },
  },
  coverage: {
    sheet: '04_POKRYCIE_PR',
    headerRow: 5,
    columns: {
      iso: c('A', 'ISO2'),
      countryName: c('B', 'Kraj'),
      countryEn: c('C', 'Country'),
      region: c('D', 'Region'),
      priority: c('E', 'Priorytet'),
      role: c('F', 'Rola'),
      grams: c('G', 'g'),
      piIngId: c('H', 'PI-ING'),
      proposalKey: c('I', 'Proposal key'),
      finalPrIng: c('J', 'Końcowy PR-ING'),
      product: c('K', 'Dokładny produkt'),
      brand: c('L', 'Marka'),
      pack: c('M', 'Opakowanie'),
      ean: c('N', 'EAN / GTIN'),
      parameter: c('O', 'Parametr'),
      target: c('P', 'Cel'),
      productValue: c('Q', 'Produkt'),
      deviation: c('R', 'Odchylenie'),
      marketEvidence: c('S', 'Dowód rynku'),
      technicalMatch: c('T', 'Zgodność techniczna'),
      status: c('U', 'Status'),
      source: c('V', 'Źródło'),
      activationCondition: c('W', 'Warunek aktywacji'),
      processMessage: c('X', 'Komunikat procesowy'),
    },
  },
  articles: {
    sheet: '05_PR_ING_ARTYKULY',
    headerRow: 5,
    columns: {
      proposalKey: c('A', 'Proposal key'),
      finalPrIng: c('B', 'Końcowy PR-ING'),
      piIngId: c('C', 'PI-ING'),
      role: c('D', 'Rola'),
      product: c('E', 'Dokładny produkt'),
      brand: c('F', 'Marka'),
      manufacturerOrSupplier: c('G', 'Producent / dostawca'),
      origin: c('H', 'Pochodzenie'),
      countriesOfUse: c('I', 'Kraje użycia'),
      pack: c('J', 'Opakowanie'),
      ean: c('K', 'EAN / GTIN'),
      sku: c('L', 'SKU / MPN'),
      ingredients: c('M', 'Skład z etykiety'),
      allergens: c('N', 'Alergeny'),
      energyKcal: c('O', 'kcal/100g'),
      fat: c('P', 'Tłuszcz %'),
      saturatedFat: c('Q', 'Nasycone %'),
      carbohydrate: c('R', 'Węglowodany %'),
      sugars: c('S', 'Cukry %'),
      protein: c('T', 'Białko %'),
      fibre: c('U', 'Błonnik %'),
      salt: c('V', 'Sól %'),
      piMatch: c('W', 'Zgodność z PI'),
      status: c('X', 'Status wniosku'),
      missing: c('Y', 'Brakujące dane / warunek'),
      sources: c('Z', 'Źródła'),
    },
  },
  sources: {
    sheet: '06_ZRODLA',
    headerRow: 5,
    columns: {
      id: c('A', 'ID'),
      area: c('B', 'Obszar'),
      name: c('C', 'Nazwa'),
      scope: c('D', 'Zakres'),
      evidenceType: c('E', 'Typ dowodu'),
      url: c('F', 'URL / referencja'),
      auditDate: c('G', 'Data audytu'),
      notes: c('H', 'Uwagi'),
    },
  },
  blockers: {
    sheet: '07_BLOKERY_QA',
    headerRow: 5,
    keyTest: (value) => /^GELATO-B\d+$/.test(String(value)),
    columns: {
      id: c('A', 'ID'),
      priority: c('B', 'Priorytet'),
      area: c('C', 'Obszar'),
      blocker: c('D', 'Bloker / kontrola'),
      effect: c('E', 'Skutek'),
      scope: c('F', 'Zakres'),
      closeCondition: c('G', 'Warunek zamknięcia'),
      recommendation: c('H', 'Rekomendacja'),
      status: c('I', 'Status'),
    },
  },
  rules: {
    sheet: '08_ZASADY',
    headerRow: 5,
    keyTest: (value) => typeof value === 'number',
    columns: {
      number: c('A', 'Nr'),
      rule: c('B', 'Zasada'),
      meaning: c('C', 'Znaczenie'),
      status: c('D', 'Status'),
    },
  },
  checklist: {
    sheet: '27_CHECKLIST_AKTYWNA',
    headerRow: 5,
    columns: {
      id: c('A', 'ID'),
      priority: c('B', 'Priorytet'),
      state: c('C', 'Stan'),
      country: c('D', 'Kraj'),
      role: c('E', 'Rola'),
      product: c('F', 'Dokładny produkt'),
      conditionKind: c('G', 'Rodzaj warunku'),
      remaining: c('H', 'Co pozostaje do potwierdzenia'),
      details: c('I', 'Szczegóły / komplet źródeł'),
      decisionV11: c('O', 'Decyzja v11'),
      evidenceV11: c('P', 'Dowód v11'),
      previousProduct: c('R', 'Poprzedni produkt'),
      openGates: c('S', 'Niezamknięte bramki'),
      sourceDate: c('T', 'Data źródeł'),
      syncV12: c('U', 'Synchronizacja v12'),
      decisionV12: c('V', 'Decyzja v12'),
      basisV12: c('W', 'Źródło / podstawa v12'),
      remainingOutsideSelection: c('X', 'Pozostałe poza doborem'),
    },
  },
  deAtProducts: {
    sheet: '34_PRODUKTY_DE_AT',
    headerRow: 5,
    keyTest: (value) => /^P10-\d+$/.test(String(value)),
    columns: {
      id: c('A', 'ID audytu'),
      market: c('B', 'Rynek'),
      product: c('C', 'Produkt'),
      size: c('D', 'Rozmiar'),
      identifier: c('E', 'Identyfikator'),
      codeType: c('F', 'Typ kodu'),
      confirmed: c('G', 'Co potwierdzono'),
      decision: c('H', 'Decyzja'),
      limitations: c('I', 'Ograniczenia'),
      sources: c('J', 'Źródła'),
    },
  },
  evidenceV11: {
    sheet: '36_DOWODY_V11',
    headerRow: 1,
    columns: {
      id: c('A', 'ID'),
      date: c('B', 'Data'),
      country: c('C', 'Kraj'),
      role: c('D', 'Rola'),
      product: c('E', 'Produkt'),
      resolution: c('F', 'Rozstrzygnięcie'),
      sources: c('G', 'Źródła'),
      scope: c('H', 'Zakres i ograniczenia'),
      readOrigin: c('I', 'Pochodzenie odczytu'),
    },
  },
  changesV11: {
    sheet: '37_ZMIANY_V11',
    headerRow: 1,
    columns: {
      caseId: c('A', 'Sprawa'),
      country: c('B', 'Kraj'),
      role: c('C', 'Rola'),
      productBefore: c('D', 'Produkt przed'),
      productAfter: c('E', 'Produkt po'),
      decision: c('F', 'Decyzja'),
      evidence: c('G', 'Dowód'),
      conditionBefore: c('H', 'Warunek przed'),
      scope: c('I', 'Zakres / niezależne warunki'),
    },
  },
  syncV12: {
    sheet: '39_SYNC_V12',
    headerRow: 6,
    keyTest: (value) => /^R\d+-\d+$/.test(String(value)),
    columns: {
      id: c('A', 'ID'),
      countryRole: c('B', 'Kraj / rola'),
      v11: c('C', 'v11'),
      v12: c('D', 'v12'),
      decision: c('E', 'Decyzja'),
      basis: c('F', 'Podstawa / notatka'),
    },
  },
  remainingV12: {
    sheet: '40_POZOSTALE_V12',
    headerRow: 5,
    columns: {
      id: c('A', 'ID'),
      priority: c('B', 'Priorytet'),
      state: c('C', 'Stan'),
      country: c('D', 'Kraj'),
      role: c('E', 'Rola'),
      product: c('F', 'Produkt'),
      condition: c('G', 'Warunek'),
      missing: c('H', 'Co jeszcze brakuje'),
      checklistRef: c('I', 'Źródło/checklista'),
      notesV12: c('J', 'Uwagi v12'),
    },
  },
});

/** The workbook role label for each functional slot. */
export const WORKBOOK_ROLE_BY_SLOT = Object.freeze({
  MILK: 'MILK',
  CREAM: 'CREAM',
  SMP: 'SMP',
  SUCROSE: 'SUCROSE',
  DEXTROSE: 'DEXTROSE',
  STABILIZER: 'TARA',
});

export const SLOT_BY_WORKBOOK_ROLE = Object.freeze(
  Object.fromEntries(Object.entries(WORKBOOK_ROLE_BY_SLOT).map(([slot, role]) => [role, slot])),
);

const normalizeHeader = (value) =>
  value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim();

function cleanCell(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return cleanText(value);
}

function sheetGrid(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet['!ref']) throw new Error(`Workbook sheet missing or empty: ${sheetName}`);
  const range = XLSX.utils.decode_range(sheet['!ref']);
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: true,
  });
  return {
    sheet,
    firstRow: range.s.r + 1,
    lastRow: range.e.r + 1,
    lastColumnLetter: XLSX.utils.encode_col(range.e.c),
    row(rowNumber) {
      return matrix[rowNumber - (range.s.r + 1)] ?? [];
    },
  };
}

function cellAt(grid, rowNumber, columnLetter) {
  return cleanCell(grid.row(rowNumber)[XLSX.utils.decode_col(columnLetter)]);
}

function readTable(workbook, spec) {
  const grid = sheetGrid(workbook, spec.sheet);
  const headerRow = spec.headerRow ?? 5;
  for (const [field, column] of Object.entries(spec.columns)) {
    const actual = normalizeHeader(cellAt(grid, headerRow, column.col));
    if (actual !== normalizeHeader(column.header)) {
      throw new Error(
        `Layout drift in ${spec.sheet}!${column.col}${headerRow} (${field}): expected "${column.header}", found "${actual}".`,
      );
    }
  }
  const keyColumn = spec.keyColumn ?? 'A';
  const rows = [];
  for (let rowNumber = headerRow + 1; rowNumber <= grid.lastRow; rowNumber += 1) {
    const key = cellAt(grid, rowNumber, keyColumn);
    if (key === null) continue;
    if (spec.keyTest && !spec.keyTest(key)) continue;
    const values = {};
    for (const [field, column] of Object.entries(spec.columns)) {
      values[field] = cellAt(grid, rowNumber, column.col);
    }
    rows.push({
      sheet: spec.sheet,
      rowNumber,
      ref: `${spec.sheet}!A${rowNumber}:${grid.lastColumnLetter}${rowNumber}`,
      values,
    });
  }
  return rows;
}

function expectCell(grid, sheetName, address, expected) {
  const [, column, row] = /^([A-Z]+)(\d+)$/.exec(address);
  const actual = cellAt(grid, Number(row), column);
  if (normalizeHeader(actual) !== normalizeHeader(expected)) {
    throw new Error(
      `Layout drift in ${sheetName}!${address}: expected "${expected}", found "${actual}".`,
    );
  }
}

function readSyncMeta(workbook) {
  const sheet = '39_SYNC_V12';
  const grid = sheetGrid(workbook, sheet);
  expectCell(grid, sheet, 'A2', 'Data');
  expectCell(grid, sheet, 'A3', 'Stan v11');
  expectCell(grid, sheet, 'C3', 'Stan v12');
  expectCell(grid, sheet, 'A4', 'Zasada');
  const ruleRow = [...Array(grid.lastRow).keys()]
    .map((index) => index + 1)
    .find((rowNumber) => cellAt(grid, rowNumber, 'A') === 'RULE-ID');
  return {
    date: cellAt(grid, 2, 'B'),
    purpose: cellAt(grid, 2, 'D'),
    openV11: cellAt(grid, 3, 'B'),
    openV12: cellAt(grid, 3, 'D'),
    change: cellAt(grid, 3, 'F'),
    rule: cellAt(grid, 4, 'B'),
    ref: `${sheet}!A2:F4`,
    identityRule: ruleRow
      ? {
          ref: `${sheet}!A${ruleRow}:F${ruleRow}`,
          subject: cellAt(grid, ruleRow, 'B'),
          decision: cellAt(grid, ruleRow, 'E'),
          basis: cellAt(grid, ruleRow, 'F'),
        }
      : null,
  };
}

function readRemainingMeta(workbook) {
  const sheet = '40_POZOSTALE_V12';
  const grid = sheetGrid(workbook, sheet);
  expectCell(grid, sheet, 'A2', 'Otwarte / zablokowane');
  expectCell(grid, sheet, 'C2', 'CREAM');
  expectCell(grid, sheet, 'E2', 'SMP');
  expectCell(grid, sheet, 'G2', 'DEXTROSE');
  expectCell(grid, sheet, 'I2', 'TARA');
  expectCell(grid, sheet, 'A3', 'Uwaga');
  return {
    ref: `${sheet}!A2:J3`,
    title: cellAt(grid, 1, 'A'),
    total: cellAt(grid, 2, 'B'),
    byRole: {
      CREAM: cellAt(grid, 2, 'D'),
      SMP: cellAt(grid, 2, 'F'),
      DEXTROSE: cellAt(grid, 2, 'H'),
      TARA: cellAt(grid, 2, 'J'),
    },
    note: cellAt(grid, 3, 'B'),
  };
}

function readDashboardState(workbook) {
  const sheet = '00_DASHBOARD';
  const grid = sheetGrid(workbook, sheet);
  return { ref: `${sheet}!A1:A2`, title: cellAt(grid, 1, 'A'), state: cellAt(grid, 2, 'A') };
}

/** Parses every sheet the v12 country-product layer depends on. */
export function parseWorkbookV12(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: false, cellHTML: false });
  const selections = {};
  const calculations = {};
  for (const [slot, spec] of Object.entries(SELECTION_SHEETS)) {
    selections[slot] = readTable(workbook, { ...spec, headerRow: 5 });
  }
  for (const [slot, spec] of Object.entries(CALCULATION_SHEETS)) {
    calculations[slot] = readTable(workbook, { ...spec, headerRow: 5 });
  }
  const tables = {};
  for (const [name, spec] of Object.entries(TABLES)) {
    tables[name] = readTable(workbook, spec);
  }
  return {
    sheetNames: [...workbook.SheetNames],
    dashboard: readDashboardState(workbook),
    selections,
    calculations,
    ...tables,
    syncMeta: readSyncMeta(workbook),
    remainingMeta: readRemainingMeta(workbook),
  };
}

/** Sheets read by parseWorkbookV12, in workbook order. */
export function sheetsUsedByParser(sheetNames) {
  const used = new Set([
    '00_DASHBOARD',
    ...Object.values(SELECTION_SHEETS).map((spec) => spec.sheet),
    ...Object.values(CALCULATION_SHEETS).map((spec) => spec.sheet),
    ...Object.values(TABLES).map((spec) => spec.sheet),
  ]);
  return sheetNames.filter((name) => used.has(name));
}

export const SELECTION_SHEET_BY_SLOT = Object.freeze(
  Object.fromEntries(Object.entries(SELECTION_SHEETS).map(([slot, spec]) => [slot, spec.sheet])),
);
export const CALCULATION_SHEET_BY_SLOT = Object.freeze(
  Object.fromEntries(Object.entries(CALCULATION_SHEETS).map(([slot, spec]) => [slot, spec.sheet])),
);
export const PORTION_FIELDS = Object.freeze(Object.keys(PORTION_COLUMNS));
