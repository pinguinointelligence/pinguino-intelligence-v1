// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { lockBodyScroll, resetBodyScrollLockForTests } from './bodyScrollLock';

describe('PRO MOBILE UX v2 · A1 — one counted page-scroll lock', () => {
  afterEach(() => {
    resetBodyScrollLockForTests();
    document.body.style.overflow = '';
  });

  it('restores the page value only when the LAST lock is released, in any order', () => {
    document.body.style.overflow = 'auto';
    const sheet = lockBodyScroll();
    const dialog = lockBodyScroll();
    const picker = lockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');

    sheet();
    expect(document.body.style.overflow).toBe('hidden');
    picker();
    expect(document.body.style.overflow).toBe('hidden');
    dialog();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('ignores a second release of the same lock', () => {
    const first = lockBodyScroll();
    const second = lockBodyScroll();
    first();
    first();
    expect(document.body.style.overflow).toBe('hidden');
    second();
    expect(document.body.style.overflow).toBe('');
  });

  it('saves the page value afresh for the next lock cycle', () => {
    lockBodyScroll()();
    document.body.style.overflow = 'clip';
    const next = lockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');
    next();
    expect(document.body.style.overflow).toBe('clip');
  });
});
