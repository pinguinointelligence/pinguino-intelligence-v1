/// <reference types="node" />
/**
 * C-APP-09 finding — application notifications open /partner, not the retired
 * /work-with-us (which now redirects to Franchise). Live on 2026-09-10: one
 * INFORMATION_REQUESTED and one REJECTED notification still carried the old
 * link — the read-side mapping fixes stored rows too.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { notificationLink } from './notificationLink';

describe('application notifications follow the application to /partner', () => {
  it('both kinds that used to point at /work-with-us now open /partner', () => {
    for (const type of [
      'PARTNER_APPLICATION_INFORMATION_REQUESTED',
      'PARTNER_APPLICATION_REJECTED',
    ]) {
      expect(notificationLink(type, '/work-with-us')).toBe('/partner');
      expect(notificationLink(type, '/work-with-us#partner-application')).toBe('/partner');
    }
  });

  it('everything else is left exactly as written', () => {
    expect(notificationLink('PARTNER_ACTIVATED', '/partner')).toBe('/partner');
    expect(notificationLink('SOMETHING_ELSE', '/work-with-us')).toBe('/work-with-us');
    expect(notificationLink('PARTNER_APPLICATION_REJECTED', '/work-with-us-later')).toBe(
      '/work-with-us-later',
    );
    expect(notificationLink('PARTNER_APPLICATION_REJECTED', null)).toBeNull();
  });

  it('the notification list applies it to every row it returns', () => {
    const service = readFileSync(
      new URL('../../services/notifications.ts', import.meta.url),
      'utf8',
    );
    expect(service).toContain(
      'deepLink: notificationLink(notification.type, notification.deepLink)',
    );
  });
});
