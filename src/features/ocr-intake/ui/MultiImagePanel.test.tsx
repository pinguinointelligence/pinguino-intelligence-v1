/**
 * MultiImagePanel — renderToStaticMarkup proof that the panel renders the
 * contract IntakeImage[] honestly: states, roles, order controls, replace /
 * remove / retry, drag-and-drop zone, camera capture, and the honest
 * HEIC/HEIF rejection (accepted by the picker, refused with an explicit
 * message — never silently converted or pretended).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { IntakeImage } from '../intakeContracts';
import { ocrCopy } from '../ocrCopy';
import { MultiImagePanel } from './MultiImagePanel';
import { IMAGE_PICKER_ACCEPT, describeUnsupportedFile, isAcceptedMime } from './intakeUiSupport';

const noop = () => undefined;

const img = (over: Partial<IntakeImage>): IntakeImage => ({
  imageId: 'img-1',
  role: 'front',
  order: 0,
  fileName: 'front.jpg',
  mime: 'image/jpeg',
  byteSize: 480_000,
  checksumSha256: 'ab'.repeat(32),
  width: 1600,
  height: 1200,
  state: 'uploaded',
  failure: null,
  ...over,
});

const render = (images: IntakeImage[], rejectionNotice: string | null = null) =>
  renderToStaticMarkup(
    <MultiImagePanel
      images={images}
      rejectionNotice={rejectionNotice}
      onAddFiles={noop}
      onRoleChange={noop}
      onMove={noop}
      onReplace={noop}
      onRemove={noop}
      onRetry={noop}
    />,
  );

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');

describe('describeUnsupportedFile — the honest format gate', () => {
  it('accepts every contract mime (png/jpeg/webp) with no message', () => {
    expect(describeUnsupportedFile('a.png', 'image/png')).toBeNull();
    expect(describeUnsupportedFile('a.jpg', 'image/jpeg')).toBeNull();
    expect(describeUnsupportedFile('a.webp', 'image/webp')).toBeNull();
  });

  it('rejects HEIC/HEIF by mime with the dedicated honest message', () => {
    expect(describeUnsupportedFile('photo.heic', 'image/heic')).toBe(ocrCopy.images.heicRejected);
    expect(describeUnsupportedFile('photo.heif', 'image/heif')).toBe(ocrCopy.images.heicRejected);
  });

  it('rejects HEIC/HEIF by extension when the browser reports no mime', () => {
    expect(describeUnsupportedFile('IMG_0001.HEIC', null)).toBe(ocrCopy.images.heicRejected);
    expect(describeUnsupportedFile('IMG_0001.heif', '')).toBe(ocrCopy.images.heicRejected);
  });

  it('rejects any other format with the generic unsupported message', () => {
    expect(describeUnsupportedFile('anim.gif', 'image/gif')).toBe(ocrCopy.images.unsupportedType);
    expect(describeUnsupportedFile('doc.pdf', 'application/pdf')).toBe(ocrCopy.images.unsupportedType);
  });

  it('isAcceptedMime narrows exactly the contract mimes', () => {
    expect(isAcceptedMime('image/png')).toBe(true);
    expect(isAcceptedMime('image/jpeg')).toBe(true);
    expect(isAcceptedMime('image/webp')).toBe(true);
    expect(isAcceptedMime('image/heic')).toBe(false);
    expect(isAcceptedMime('image/gif')).toBe(false);
  });
});

describe('MultiImagePanel — inputs', () => {
  it('offers a multiple file picker that ACCEPTS heic (rejection happens honestly after)', () => {
    const html = render([]);
    expect(html).toContain(`accept="${IMAGE_PICKER_ACCEPT}"`);
    expect(IMAGE_PICKER_ACCEPT).toContain('image/heic');
    expect(html).toContain('multiple');
    expect(html).toContain(`aria-label="${ocrCopy.images.addImages}"`);
  });

  it('offers a camera capture input (environment camera; desktop falls back to picker)', () => {
    const html = render([]);
    expect(html).toMatch(/accept="image\/\*"[^>]*capture="environment"|capture="environment"[^>]*accept="image\/\*"/);
    expect(html).toContain(`aria-label="${ocrCopy.images.camera}"`);
    expect(text(html)).toContain(ocrCopy.images.cameraNote);
  });

  it('renders a labelled drag-and-drop zone', () => {
    const html = render([]);
    expect(html).toContain(`aria-label="${ocrCopy.images.dropZone}"`);
    expect(html).toContain('role="group"');
  });

  it('shows the empty state as a status region when there are no images', () => {
    const html = render([]);
    expect(html).toContain('role="status"');
    expect(text(html)).toContain(ocrCopy.images.empty);
  });

  it('surfaces the HEIC rejection notice as a status region', () => {
    const html = render([], ocrCopy.images.heicRejected);
    expect(text(html)).toContain(ocrCopy.images.heicRejected);
    expect(html).toContain('role="status"');
  });
});

describe('MultiImagePanel — per-image cards', () => {
  it('renders file name, size, mime and dimensions verbatim', () => {
    const t = text(render([img({})]));
    expect(t).toContain('front.jpg');
    expect(t).toContain('469 KB');
    expect(t).toContain('image/jpeg');
    expect(t).toContain('1600×1200');
  });

  it('renders every contract state as its honest chip label', () => {
    const states: IntakeImage['state'][] = ['uploaded', 'analysing', 'needs_review', 'ready', 'failed'];
    const images = states.map((state, order) =>
      img({ imageId: `img-${order}`, order, state, failure: state === 'failed' ? 'boom' : null }),
    );
    const t = text(render(images));
    for (const state of states) expect(t).toContain(ocrCopy.images.states[state]);
  });

  it('shows the failure reason (status region) and a retry button ONLY for failed images', () => {
    const failed = img({ imageId: 'f1', state: 'failed', failure: 'unreadable_image — no usable text' });
    const ready = img({ imageId: 'r1', order: 1, state: 'ready', fileName: 'ok.png' });
    const html = render([failed, ready]);
    expect(text(html)).toContain('unreadable_image — no usable text');
    expect(html).toContain(`aria-label="${ocrCopy.images.retry}: front.jpg"`);
    expect(html).not.toContain(`aria-label="${ocrCopy.images.retry}: ok.png"`);
  });

  it('renders a labelled role selector with all 7 contract roles', () => {
    const html = render([img({})]);
    expect(html).toContain(`aria-label="${ocrCopy.images.roleLabel}: front.jpg"`);
    for (const label of Object.values(ocrCopy.images.roles)) {
      expect(html).toContain(`>${label}</option>`);
    }
    expect((html.match(/<option/g) ?? []).length).toBe(7);
  });

  it('order controls are real buttons, disabled at the boundaries', () => {
    const html = render([img({ imageId: 'a', order: 0 }), img({ imageId: 'b', order: 1, fileName: 'b.png' })]);
    // first item: up disabled; last item: down disabled (attribute, not the CSS class)
    expect(html).toMatch(new RegExp(`aria-label="${ocrCopy.images.moveUp}: front.jpg"[^>]*disabled=""`));
    expect(html).toMatch(new RegExp(`aria-label="${ocrCopy.images.moveDown}: b.png"[^>]*disabled=""`));
    expect(html).not.toMatch(new RegExp(`aria-label="${ocrCopy.images.moveDown}: front.jpg"[^>]*disabled=""`));
  });

  it('renders items sorted by contract order, not array position', () => {
    const t = text(render([img({ imageId: 'b', order: 1, fileName: 'second.png' }), img({ imageId: 'a', order: 0, fileName: 'first.png' })]));
    expect(t.indexOf('first.png')).toBeLessThan(t.indexOf('second.png'));
    expect(t).toContain('1. first.png');
    expect(t).toContain('2. second.png');
  });

  it('offers labelled replace and remove per image', () => {
    const html = render([img({})]);
    expect(html).toContain(`aria-label="${ocrCopy.images.replace}: front.jpg"`);
    expect(html).toContain(`aria-label="${ocrCopy.images.remove}: front.jpg"`);
  });

  it('shows a truncated real checksum, and "pending" when none was computed yet', () => {
    const withHash = img({});
    const pendingHash = img({ imageId: 'p', order: 1, fileName: 'p.png', checksumSha256: '' });
    const t = text(render([withHash, pendingHash]));
    expect(t).toContain(`sha256: ${'ab'.repeat(6)}`);
    expect(t).toContain(ocrCopy.images.checksumPending);
  });

  it('every action control is a real <button> (keyboard operable)', () => {
    const html = render([img({ state: 'failed', failure: 'x' })]);
    const buttons = html.match(/<button type="button"/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(4); // up, down, remove, retry
  });
});
