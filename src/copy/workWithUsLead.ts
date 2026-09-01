import type { BusinessLeadType } from '@/services/businessLeads';

/**
 * WORK WITH US — the enquiry surface behind `/work-with-us#lead`.
 *
 * Every lane CTA lands here, so this is the one place a machine, cart, trailer
 * or franchise question turns into a record an operator can answer.
 *
 * The lane names below are the SAME customer names the lane pages and the
 * gateway cards use. They are repeated as a map rather than re-derived so the
 * select cannot drift into internal vocabulary: a visitor picks
 * „Przyczepa Gellatti", never `trailer`.
 */

/** The four commercial paths, in the customer's words. */
export const LEAD_TYPE_LABEL: Readonly<Record<BusinessLeadType, string>> = Object.freeze({
  machine: 'Maszyny i wyposażenie',
  mobile: 'Wózki mobilne',
  trailer: 'Przyczepa Gellatti',
  franchise: 'Franczyza',
});

/**
 * Which lane a visitor arrived from, by route.
 *
 * `sourceRoute` and `leadType` are stored separately on purpose: someone can
 * open the form from `/machines` and then ask about the trailer. The route
 * records where they actually were; the select records what they asked about.
 */
export const LEAD_TYPE_BY_ROUTE: Readonly<Record<string, BusinessLeadType>> = Object.freeze({
  '/machines': 'machine',
  '/mobile': 'mobile',
  '/trailer': 'trailer',
  '/franchise': 'franchise',
});

export const leadCopy = Object.freeze({
  eyebrow: 'Zapytanie',
  title: 'Napisz, czego potrzebujesz',
  blurb:
    'Odpowiadamy indywidualnie — dobieramy rozwiązanie do miejsca, skali i budżetu. Nie sprzedajemy sprzętu przez koszyk.',

  subject: 'Czego dotyczy zapytanie',
  subjectPlaceholder: 'Wybierz z listy',
  fullName: 'Imię i nazwisko',
  email: 'E-mail',
  phone: 'Telefon',
  phoneHint: 'opcjonalnie',
  country: 'Kraj',
  city: 'Miasto',
  message: 'Twoje pytanie',
  messagePlaceholder: 'Napisz, gdzie chcesz sprzedawać, ile smaków planujesz i czego potrzebujesz.',
  optional: 'opcjonalnie',

  submit: 'Wyślij zapytanie',
  submitting: 'Wysyłamy…',

  /**
   * Field-level messages. Deliberately not the database's own words: the
   * function raises `lead_full_name_required`, which is a correct signal to a
   * developer and useless to a person filling in a form.
   */
  errSubject: 'Wybierz, czego dotyczy zapytanie.',
  errFullName: 'Podaj imię i nazwisko, żebyśmy wiedzieli, do kogo piszemy.',
  errEmail: 'Podaj adres e-mail w poprawnym formacie — na ten adres wyślemy odpowiedź.',

  successTitle: 'Zapytanie przyjęte',
  /** The reference is real and comes from the saved record, never invented here. */
  successBody: 'Odezwiemy się na podany adres e-mail. Numer Twojego zapytania:',
  successAgain: 'Wyślij kolejne zapytanie',
});
