/**
 * Produkcja — the ONE area copy (owner decision 2026-09-17, package PRODUKCJA V3 §7).
 *
 * The area is one hamburger entry, „Produkcja”, with four flat sections: Partie · Produkty ·
 * Maszyna · Etykiety. Everything the area frame says — section names, the unsaved-changes
 * question, the save-scope notes of the Maszyna and Produkty sections — lives here, so the
 * frame's logic carries no Polish literal (`src/copy/customerCopyGuard.test.ts`, locale rule 3).
 *
 * Follows the `CommunityCopy` reference pattern: one interface, one complete object per
 * locale, one resolver.
 */
import { resolveLocaleResource, type AppLocale } from './locale';

export interface ProductionAreaCopy {
  /** The area title painted once above the section bar. */
  readonly title: string;
  /** Accessible name of the section bar. */
  readonly navLabel: string;
  readonly sections: {
    readonly batches: string;
    readonly products: string;
    readonly machine: string;
    readonly labels: string;
  };
  /** Screen-reader text of the dot a section shows while it holds unsaved changes. */
  readonly sectionUnsaved: string;
  /** The Pro-only sections a HOME (or signed-out) visitor opens from the bar. */
  readonly proGate: {
    readonly labelsTitle: string;
    readonly labelsBody: string;
    readonly action: string;
  };
  /** The ONE unsaved-changes question (bar, ☰ and HOME | PRO ask the same). */
  readonly unsaved: {
    readonly title: string;
    readonly body: (sections: string) => string;
    readonly bodyGeneric: string;
    readonly discard: string;
    readonly discardHint: string;
    readonly save: string;
    readonly saveHint: string;
    readonly saving: string;
    readonly stay: string;
  };
  readonly machine: {
    readonly heading: string;
    readonly blurb: string;
    /** The machine choice saves — it no longer claims to go to a recipe. */
    readonly choiceSubmit: string;
    readonly defaultsCard: {
      readonly title: string;
      readonly lead: string;
      readonly rows: readonly (readonly [label: string, value: string])[];
    };
    readonly recipeDefaultsLink: string;
    readonly recipeDefaultsLinkHint: string;
    readonly recipeDefaultsNote: string;
  };
  readonly products: {
    readonly back: string;
    readonly marketsLink: string;
    readonly requestsLink: string;
    readonly adminImportLink: string;
    readonly importBack: string;
  };
  readonly account: {
    /** Konto → Ustawienia receptury: the one door to the machine and the default batch. */
    readonly machineLinkLabel: string;
    readonly machineLinkTarget: string;
    readonly machineLinkHint: string;
    readonly inviteHeading: string;
  };
}

const pl: ProductionAreaCopy = {
  title: 'Produkcja',
  navLabel: 'Sekcje Produkcji',
  sections: {
    batches: 'Partie',
    products: 'Produkty',
    machine: 'Maszyna',
    labels: 'Etykiety',
  },
  sectionUnsaved: 'niezapisane zmiany',
  proGate: {
    labelsTitle: 'Etykiety są dostępne w planie Pro',
    labelsBody:
      'Etykieta ze składem, numerem LOT i drukiem służy produkcji na sprzedaż. W HOME zapisujesz recepturę i udostępniasz lody.',
    action: 'Zobacz plany',
  },
  unsaved: {
    title: 'Masz niezapisane zmiany',
    body: (sections) =>
      `${sections}: zmiany nie są jeszcze zapisane. Zapisz je albo odrzuć — nic nie zapisze się samo.`,
    bodyGeneric:
      'Zmiany nie są jeszcze zapisane. Zapisz je albo odrzuć — nic nie zapisze się samo.',
    discard: 'Odrzuć zmiany',
    discardHint: 'Cofa tylko ten formularz. Partia w toku, potwierdzone gramy i historia zostają.',
    save: 'Zapisz i przejdź',
    saveHint: 'Przejdziesz dalej dopiero, gdy zapis się uda.',
    saving: 'Zapisuję…',
    stay: 'Zostań',
  },
  machine: {
    heading: 'Ustawienia maszyny',
    blurb: 'Domyślna maszyna i partia są punktem startu dla nowych receptur i nowych Produkcji.',
    choiceSubmit: 'Zapisz',
    defaultsCard: {
      title: 'Ustawienie domyślne',
      lead: 'Zapis zmienia start nowych receptur.',
      rows: [
        ['Nowe receptury', 'ta maszyna i wsad'],
        ['Zapisane receptury', 'własna maszyna i wsad · zmiana w recepturze'],
        ['Partia w toku', 'bez zmian'],
      ],
    },
    recipeDefaultsLink: 'Ustawienia nowej receptury',
    recipeDefaultsLinkHint: 'Konto',
    recipeDefaultsNote:
      'Tryb serwowania, strategia, słodycz i miękkość dla każdego typu lodów zostają w koncie. Maszynę i wsad ustawiasz tutaj.',
  },
  products: {
    back: 'Produkty',
    marketsLink: 'Rynki produktów',
    requestsLink: 'Zgłoszenia produktów',
    adminImportLink: 'Import administracyjny',
    importBack: '← Produkty',
  },
  account: {
    machineLinkLabel: 'Maszyna i domyślny wsad',
    machineLinkTarget: 'Produkcja · Maszyna',
    machineLinkHint:
      'Maszynę i domyślny wsad nowych receptur ustawiasz w jednym miejscu: Produkcja → Maszyna.',
    inviteHeading: 'Kod zaproszenia Home',
  },
};

const resources: Readonly<Partial<Record<AppLocale, ProductionAreaCopy>>> = { pl };

export const productionAreaCopy = (locale?: AppLocale): ProductionAreaCopy =>
  resolveLocaleResource(resources, locale);
