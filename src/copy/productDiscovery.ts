import { resolveLocaleResource, type AppLocale } from './locale';
import type {
  ProductDiscoverySubfilter,
  ProductDiscoveryTopFilter,
} from '@/features/ingredient-builder/canonicalProductDiscovery';

export interface ProductDiscoveryCopy {
  filtersLabel: string;
  subfiltersLabel: string;
  topFilters: Readonly<Record<ProductDiscoveryTopFilter, string>>;
  subfilters: Readonly<Record<ProductDiscoverySubfilter, string>>;
  searchAll: string;
  add: string;
  replace: string;
  primaryCountryLabel: string;
  primaryCountryHint: string;
  guestCountryConflict: string;
  keepAccountCountry: string;
  useGuestCountry: string;
}

const pl: ProductDiscoveryCopy = {
  filtersLabel: 'Kategorie produktów',
  subfiltersLabel: 'Doprecyzuj kategorię',
  topFilters: {
    favorites: 'Ulubione',
    all: 'Wszystkie',
    fruit: 'Owoce',
    dairy: 'Mleczne',
    nuts: 'Orzechy',
    chocolate: 'Czekolada',
    technical: 'Techniczne',
  },
  subfilters: {
    all: 'Wszystkie',
    fresh: 'Świeże',
    frozen: 'Mrożone',
    puree: 'Purée',
    paste: 'Pasty',
    sugars: 'Cukry',
    stabilizers: 'Stabilizatory',
    inulin: 'Inulina',
  },
  searchAll: 'Szukaj we wszystkich',
  add: 'Dodaj',
  replace: 'Zamień',
  primaryCountryLabel: 'Główny kraj produktu',
  primaryCountryHint:
    'Ten kraj rozstrzyga domyślny produkt za kanonicznym wariantem. Pozostałe wybrane kraje pozostają dostępne.',
  guestCountryConflict:
    'Na tym urządzeniu wybrano inny kraj produktów przed logowaniem. Wybierz, którą jawną decyzję zachować.',
  keepAccountCountry: 'Zachowaj kraj konta',
  useGuestCountry: 'Użyj kraju z tego urządzenia',
};

const resources: Readonly<Partial<Record<AppLocale, ProductDiscoveryCopy>>> = { pl };

export const productDiscoveryCopy = (locale?: AppLocale): ProductDiscoveryCopy =>
  resolveLocaleResource(resources, locale);
