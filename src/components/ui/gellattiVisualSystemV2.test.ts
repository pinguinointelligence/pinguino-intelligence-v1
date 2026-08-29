import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buttonClasses } from './buttonStyles';
import {
  applicationCompactClasses,
  applicationDestructiveClasses,
  applicationFieldClasses,
  applicationIconClasses,
  applicationPrimaryClasses,
  applicationQuietClasses,
  applicationSecondaryClasses,
} from './applicationControlStyles';

const read = (...parts: string[]) =>
  readFileSync(new URL(`../../${parts.join('/')}`, import.meta.url), 'utf8');

describe('Gellatti Visual System V2', () => {
  it('projects current-PRO controls outward without changing their source recipe', () => {
    expect(buttonClasses('primary', 'sm')).toContain('min-h-10');
    expect(buttonClasses('primary', 'sm')).toContain('max-sm:min-h-11');
    expect(applicationPrimaryClasses()).toContain('max-sm:min-h-11');
    expect(applicationSecondaryClasses()).toContain('max-sm:min-h-11');
    expect(applicationQuietClasses()).toContain('min-h-9');
    expect(applicationQuietClasses()).toContain('max-sm:min-h-11');
    expect(applicationCompactClasses()).toContain('min-h-8');
    expect(applicationCompactClasses()).toContain('max-sm:min-h-11');
    expect(applicationIconClasses()).toContain('size-7');
    expect(applicationIconClasses()).toContain('max-sm:size-11');
    expect(applicationDestructiveClasses()).toContain('min-h-9');
    expect(applicationFieldClasses()).toContain('h-10');
    expect(applicationFieldClasses()).toContain('max-sm:h-11');
  });

  it('keeps the frozen Recipe numeric and production geometries in place', () => {
    const direct = read('features', 'ingredient-builder', 'DirectNumberControl.tsx');
    const production = read('features', 'production-workspace', 'ProductionActualControl.tsx');
    const tabs = read('features', 'pro-workbench', 'WorkbenchModuleTabs.tsx');

    expect(direct).toContain("compact ? 'h-8 w-7'");
    expect(direct).toContain("'size-11 lg:h-8 lg:w-7'");
    expect(direct).toContain("'h-8 w-[22px]'");
    expect(direct).toContain("'w-[150px] grid-cols-[28px_72px_28px_22px]'");
    expect(direct).toContain("'w-[122px] grid-cols-[28px_66px_28px]'");
    expect(direct).toContain("'w-[176px] grid-cols-[44px_88px_44px]");
    expect(production).toContain('w-[226px] grid-cols-[176px_44px] gap-1.5');
    expect(production).toContain('lg:w-[154px] lg:grid-cols-[122px_28px] lg:gap-1');
    expect(tabs).toContain('min-h-12');
    expect(tabs).toContain('min-h-[var(--pro-bottom-nav-height)]');
  });

  it('implements outcome-context-next-step Scanner success and normal entry', () => {
    const scanner = read('features', 'product-scanner', 'LiveProductScanner.tsx');
    expect(scanner).toContain('Produkt dodany do Twojego katalogu.');
    expect(scanner).toContain('Co dalej?');
    expect(scanner).toContain('Użyj w recepturze');
    expect(scanner).toContain('Zeskanuj następny');
    expect(scanner).toContain('Umieść kod i etykietę w kadrze');
  });

  it('uses human UI typography and reserves mono for product data', () => {
    const pageHeading = read('components', 'shared', 'PageHeading.tsx');
    const catalog = read('features', 'global-catalog', 'GlobalCatalogSearchPanel.tsx');
    const auth = read('features', 'auth', 'AuthModal.tsx');

    expect(pageHeading).not.toContain('font-mono');
    expect(pageHeading).toContain('tracking-[0.13em]');
    expect(pageHeading).toContain('text-[25px]');
    expect(pageHeading).toContain('sm:text-[30px]');
    expect(auth).not.toContain('tracking-label');
    // V2.1 §5: mono stays reserved for PRODUCT DATA — it now carries the EAN
    // and „Moja cena" columns of the approved catalog table, at the preview's
    // own 11 px. The reservation is unchanged; only the size literal moved.
    expect(catalog).toContain('font-mono text-[11px]');
    expect(catalog).not.toContain('font-mono text-xl');
  });

  it('uses V2 master-detail architecture only where it is contextual', () => {
    const catalog = read('features', 'global-catalog', 'GlobalCatalogSearchPanel.tsx');
    const admin = read('pages', 'admin', 'AdminWorkspacePage.tsx');
    const adminReanalysis = read('features', 'admin', 'AdminProductCapabilityReanalysisDetail.tsx');
    const appShell = read('features', 'shell', 'AppShell.tsx');

    // V2.1 §5: the approved split gives the MASTER list the wider half
    // (697 / 571 in the preview) so real catalog names are not truncated.
    expect(catalog).toContain('lg:grid-cols-[minmax(340px,1.22fr)_minmax(420px,1fr)]');
    expect(admin).toContain('lg:grid-cols-[190px_minmax(0,1fr)]');
    expect(admin).toContain('<aside className="min-w-0 border-b');
    expect(adminReanalysis).toContain('<div className="min-w-0 space-y-7">');
    expect(adminReanalysis).toContain('<aside className="min-w-0 space-y-5">');
    expect(admin).toContain('xl:grid-cols-[330px_minmax(0,1fr)]');
    expect(appShell).not.toContain('190px_minmax');
  });

  it('mounts the approved production-workbench visual scope at every application root', () => {
    const appShell = read('features', 'shell', 'AppShell.tsx');
    const landing = read('pages', 'landing', 'LandingPage.tsx');
    const customer = read('features', 'customer-shell', 'CustomerShellV1.tsx');
    const subscription = read('pages', 'destinations', 'SubscriptionPage.tsx');

    for (const source of [appShell, landing, customer, subscription]) {
      expect(source).toContain('gellatti-application');
      expect(source).toContain('pro-studio-radius-system');
      expect(source).toContain('theme-pro-light');
    }
  });

  it('uses one shared state family instead of naked loading copy on routed pages', () => {
    const state = read('components', 'shared', 'ApplicationState.tsx');
    const adminGuard = read('features', 'admin', 'AdminRouteGuard.tsx');
    const partner = read('pages', 'community', 'PartnerPublicRoute.tsx');

    expect(state).toContain("kind: 'loading' | 'empty' | 'stale' | 'error'");
    expect(state).toContain('aria-busy');
    expect(adminGuard).toContain('<ApplicationState');
    expect(adminGuard).toContain('<DestinationSurface');
    expect(partner).toContain('<ApplicationState');
    expect(partner).toContain('<DestinationSurface');
  });

  it('routes authentication through the canonical accessible dialog primitive', () => {
    const auth = read('features', 'auth', 'AuthModal.tsx');
    const dialog = read('components', 'ui', 'DialogShell.tsx');

    expect(auth).toContain('<DialogShell');
    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain("event.key === 'Escape'");
  });
});
