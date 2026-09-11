/**
 * C-APP-07 — the applicant-facing status card, rendered for all eight states.
 *
 * Asserted on VISIBLE TEXT (tags stripped), so a raw status value hiding in an
 * attribute cannot pass for readable copy, and a raw value in the text cannot
 * hide behind markup.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { cooperationCopy as c } from '@/copy/cooperation';
import { ApplicationStatusCard } from './ApplicationStatusCard';
import {
  PARTNER_APPLICATION_STATUSES,
  PARTNER_APPLICATION_STATUS_COPY,
  type PartnerApplicationStatus,
} from './partnerApplicationStatus';

const visibleText = (status: PartnerApplicationStatus, reason?: string) =>
  renderToStaticMarkup(<ApplicationStatusCard status={status} reason={reason ?? null} />)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

describe('every state is readable', () => {
  for (const status of PARTNER_APPLICATION_STATUSES) {
    it(`${status}: label, meaning and "your move" are shown`, () => {
      const text = visibleText(status);
      expect(text).toContain(PARTNER_APPLICATION_STATUS_COPY[status].label);
      expect(text).toContain(PARTNER_APPLICATION_STATUS_COPY[status].detail);
      expect(text).toContain(c.state.yourMove);
    });

    it(`${status}: no raw backend code reaches the applicant`, () => {
      const text = visibleText(status).toLowerCase();
      for (const raw of PARTNER_APPLICATION_STATUSES) {
        expect(text, `${status} shows ${raw}`).not.toContain(raw);
      }
      expect(text).not.toContain('_');
    });
  }
});

describe('whether the applicant has to act', () => {
  it('states that need nothing say so plainly', () => {
    for (const status of ['submitted', 'under_review', 'approved', 'terminated'] as const) {
      expect(visibleText(status), status).toContain(c.state.actionNone);
    }
  });

  it('more information needed tells them to complete it', () => {
    expect(visibleText('more_information_needed')).toContain(c.state.actionUpdate);
  });

  it('a declined application is told reapplying is optional, not required', () => {
    expect(visibleText('rejected')).toContain(c.state.actionReapply);
  });

  it('a suspension offers the canonical mailbox, because no form can help', () => {
    const html = renderToStaticMarkup(<ApplicationStatusCard status="suspended" />);
    expect(html).toContain('href="mailto:info@gellatti.com"');
    expect(visibleText('suspended')).toContain(c.state.actionContact);
  });

  it('no other state renders a contact link', () => {
    for (const status of PARTNER_APPLICATION_STATUSES) {
      if (status === 'suspended') continue;
      const html = renderToStaticMarkup(<ApplicationStatusCard status={status} />);
      expect(html, status).not.toContain('mailto:');
    }
  });
});

describe("the team's own message", () => {
  const reason = 'Dodaj link do profilu, na którym publikujesz przepisy.';

  it('is shown where the team writes one for the applicant', () => {
    for (const status of ['more_information_needed', 'rejected'] as const) {
      const text = visibleText(status, reason);
      expect(text, status).toContain(c.state.teamMessage);
      expect(text, status).toContain(reason);
    }
  });

  it('is never shown for a state the team does not write it for', () => {
    for (const status of ['submitted', 'under_review', 'approved'] as const) {
      expect(visibleText(status, reason), status).not.toContain(reason);
    }
  });
});
