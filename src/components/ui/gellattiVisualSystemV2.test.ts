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

    expect(direct).toContain("compact ? 'h-7 w-7'");
    expect(direct).toContain("'size-11 lg:h-7 lg:w-7'");
    expect(direct).toContain("'w-[122px] grid-cols-[28px_66px_28px]'");
    expect(direct).toContain("'w-[176px] grid-cols-[44px_88px_44px]");
    expect(production).toContain('w-[226px] grid-cols-[176px_44px] gap-1.5');
    expect(production).toContain('lg:w-[154px] lg:grid-cols-[122px_28px] lg:gap-1');
    expect(tabs).toContain('min-h-12');
    expect(tabs).toContain('min-h-[var(--pro-bottom-nav-height)]');
  });

  it('implements outcome-context-next-step Scanner success and normal entry', () => {
    const scanner = read('features', 'product-scanner', 'LiveProductScanner.tsx');
    expect(scanner).toContain('Gotowe. Produkt jest w Twoim katalogu.');
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
    expect(pageHeading).not.toContain('uppercase');
    expect(auth).not.toContain('tracking-label');
    expect(catalog).toContain('font-mono text-[10px]');
    expect(catalog).not.toContain('font-mono text-xl');
  });

  it('uses V2 master-detail architecture only where it is contextual', () => {
    const catalog = read('features', 'global-catalog', 'GlobalCatalogSearchPanel.tsx');
    const admin = read('pages', 'admin', 'AdminWorkspacePage.tsx');
    const appShell = read('features', 'shell', 'AppShell.tsx');

    expect(catalog).toContain('lg:grid-cols-[minmax(340px,0.85fr)_minmax(420px,1.15fr)]');
    expect(admin).toContain('lg:grid-cols-[190px_minmax(0,1fr)]');
    expect(admin).toContain('xl:grid-cols-[330px_minmax(0,1fr)]');
    expect(appShell).not.toContain('190px_minmax');
  });
});
