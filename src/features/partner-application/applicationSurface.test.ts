/**
 * C-APP-07 — the surface decision, for every canonical status.
 *
 * Each assertion below corresponds to a way `/partner` actually misbehaved
 * before this module existed, not to a restatement of the table.
 */
import { describe, expect, it } from 'vitest';
import { applicationSurface } from './applicationSurface';
import {
  PARTNER_APPLICATION_STATUSES,
  PARTNER_APPLICATION_STATUS_COPY,
} from './partnerApplicationStatus';

describe('applicationSurface covers every canonical status', () => {
  it('returns a surface with a status card for all eight', () => {
    for (const status of PARTNER_APPLICATION_STATUSES) {
      expect(applicationSurface(status).showStatus, status).toBe(true);
    }
  });

  it('with no application at all, the form is the whole surface', () => {
    expect(applicationSurface(null)).toMatchObject({
      showStatus: false,
      showForm: true,
      action: 'submit',
    });
  });
});

describe('the two defects it replaces', () => {
  it('an application under review is NOT offered a blank form again', () => {
    // It used to render the empty form under an "in progress" heading, and a
    // second send just came back as a duplicate.
    expect(applicationSurface('under_review')).toMatchObject({ showForm: false, action: 'none' });
    expect(applicationSurface('submitted')).toMatchObject({ showForm: false, action: 'none' });
  });

  it('"we need more information" now comes with the way to give it', () => {
    // It used to say so and offer nothing. The writer already answers in place.
    expect(applicationSurface('more_information_needed')).toMatchObject({
      showForm: true,
      prefill: true,
      action: 'update',
    });
  });
});

describe('agreement with the canonical copy', () => {
  it('"action required" is read from the copy, never recomputed', () => {
    for (const status of PARTNER_APPLICATION_STATUSES) {
      expect(applicationSurface(status).actionRequired, status).toBe(
        PARTNER_APPLICATION_STATUS_COPY[status].actionRequired,
      );
    }
  });

  it('a state that requires action always offers one', () => {
    for (const status of PARTNER_APPLICATION_STATUSES) {
      const surface = applicationSurface(status);
      if (surface.actionRequired) expect(surface.action, status).not.toBe('none');
    }
  });

  it('closed states offer no form', () => {
    for (const status of ['approved', 'terminated', 'suspended'] as const) {
      expect(applicationSurface(status).showForm, status).toBe(false);
    }
  });

  it('a declined application may reapply, but nothing is required of it', () => {
    expect(applicationSurface('rejected')).toMatchObject({
      showForm: true,
      prefill: false,
      action: 'reapply',
      actionRequired: false,
    });
  });
});
