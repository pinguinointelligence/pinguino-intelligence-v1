import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) =>
  fs.readFileSync(path.join(process.cwd(), relative), 'utf8');

const machineSettingsPage = read('src/pages/profile/MachineProfilePage.tsx');
const homeShell = read('src/features/customer-shell/CustomerShellV1.tsx');

/**
 * Regression: one account's machine could carry into the next account's
 * session on a shared browser.
 *
 * `userScopedMachineKey` exists precisely so the device-local machine record is
 * namespaced by the signed-in user (owner P0, 2026-07-18). The Home shell used
 * it; the `/machine` settings page called the store with no key at all and so
 * wrote to the unscoped legacy key. The same customer's machine therefore
 * landed under two different keys depending on which surface they used, and a
 * second account on the same browser inherited the first one's machine.
 */
describe('the device-local machine record is scoped to the signed-in account', () => {
  it('scopes the key on the machine settings page', () => {
    expect(machineSettingsPage).toContain('userScopedMachineKey(authUserId)');
    expect(machineSettingsPage).not.toMatch(/localStorageMachinePreferenceStore\(\s*\)/);
  });

  it('keeps the Home shell on the same scoped key', () => {
    expect(homeShell).toContain('userScopedMachineKey(authUserId)');
  });

  it('re-selects the store when the account changes', () => {
    const memo = machineSettingsPage.slice(
      machineSettingsPage.lastIndexOf('selectMachinePreferenceStore'),
    );
    expect(memo.slice(0, 400)).toContain('[authUserId]');
  });

  it('does not flip the documented launch gate — only the local factory is wired', () => {
    expect(machineSettingsPage).toContain('localDevice:');
    expect(machineSettingsPage).not.toContain('backend:');
  });
});
