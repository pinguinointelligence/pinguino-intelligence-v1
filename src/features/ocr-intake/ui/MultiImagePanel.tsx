/**
 * MultiImagePanel — presentational multi-image intake (spec §4, §17.9).
 *
 * Renders the session's IntakeImage[] verbatim (contract-shaped props, no
 * session logic): add-by-picker, drag-and-drop zone, camera capture, and a
 * per-image card with role selector, order controls, replace / remove / retry
 * and an honest state chip. HEIC/HEIF is ACCEPTED by the picker (so phones
 * offer their photo library) but honestly rejected via `describeUnsupportedFile`
 * — the contract only allows png/jpeg/webp and nothing else is pretended.
 *
 * Pure presentation: every mutation goes through a callback prop; the page
 * shell (or track H's session layer at integration) owns the state.
 */
import type { ChangeEvent, DragEvent } from 'react';
import type { IntakeImage, IntakeImageRole } from '../intakeContracts';
import { ocrCopy } from '../ocrCopy';
import { IMAGE_PICKER_ACCEPT } from './intakeUiSupport';

const STATE_CHIP_CLASS: Record<IntakeImage['state'], string> = {
  uploaded: 'bg-stone-100 text-stone-600',
  analysing: 'bg-sky-100 text-sky-700',
  needs_review: 'bg-amber-100 text-amber-700',
  ready: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
};

function ImageStateChip({ state }: { state: IntakeImage['state'] }) {
  return (
    <span className={`rounded px-1.5 py-0.5 font-mono text-xs ${STATE_CHIP_CLASS[state]}`}>
      {ocrCopy.images.states[state]}
    </span>
  );
}

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

const ROLE_KEYS = Object.keys(ocrCopy.images.roles) as IntakeImageRole[];

export interface MultiImagePanelProps {
  images: IntakeImage[];
  /** Honest rejection notice (HEIC/unsupported) — page-owned state, or null. */
  rejectionNotice: string | null;
  onAddFiles: (files: File[]) => void;
  onRoleChange: (imageId: string, role: IntakeImageRole) => void;
  onMove: (imageId: string, direction: 'up' | 'down') => void;
  onReplace: (imageId: string, file: File) => void;
  onRemove: (imageId: string) => void;
  onRetry: (imageId: string) => void;
}

export function MultiImagePanel({
  images,
  rejectionNotice,
  onAddFiles,
  onRoleChange,
  onMove,
  onReplace,
  onRemove,
  onRetry,
}: MultiImagePanelProps) {
  const ordered = [...images].sort((a, b) => a.order - b.order);

  const filesFromInput = (e: ChangeEvent<HTMLInputElement>): File[] => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    return files;
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    onAddFiles([...(e.dataTransfer?.files ?? [])]);
  };

  return (
    <section aria-label={ocrCopy.images.title} className="rounded-md border border-stone-200 bg-white px-4 py-3 text-sm">
      <h3 className="font-medium">{ocrCopy.images.title}</h3>
      <p className="mt-1 text-xs text-stone-500">{ocrCopy.images.acceptedNote}</p>

      {/* drag-and-drop zone (labelled region, keyboard users use the picker below) */}
      <div
        role="group"
        aria-label={ocrCopy.images.dropZone}
        className="mt-2 rounded border border-dashed border-stone-300 bg-stone-50 px-3 py-4 text-center text-xs text-stone-500"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {ocrCopy.images.dropZone}
      </div>

      <label className="mt-2 block text-xs text-stone-600">
        {ocrCopy.images.addImages}
        <input
          type="file"
          multiple
          accept={IMAGE_PICKER_ACCEPT}
          aria-label={ocrCopy.images.addImages}
          className="mt-1 block w-full text-xs"
          onChange={(e) => onAddFiles(filesFromInput(e))}
        />
      </label>

      {/* camera capture: renders the rear camera on mobile; desktop falls back to a picker */}
      <label className="mt-2 block text-xs text-stone-600">
        {ocrCopy.images.camera}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          aria-label={ocrCopy.images.camera}
          className="mt-1 block w-full text-xs"
          onChange={(e) => onAddFiles(filesFromInput(e))}
        />
      </label>
      <p className="mt-1 text-xs text-stone-400">{ocrCopy.images.cameraNote}</p>

      {rejectionNotice ? (
        <p role="status" className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
          {rejectionNotice}
        </p>
      ) : null}

      {ordered.length === 0 ? (
        <p role="status" className="mt-3 text-xs text-stone-400">
          {ocrCopy.images.empty}
        </p>
      ) : (
        <ol aria-label={ocrCopy.images.title} className="mt-3 space-y-2">
          {ordered.map((img, position) => (
            <li key={img.imageId} className="rounded border border-stone-100 bg-stone-50 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-stone-700">
                  {position + 1}. {img.fileName} · {kb(img.byteSize)} · {img.mime}
                  {img.width !== null && img.height !== null ? ` · ${img.width}×${img.height}` : ''}
                </span>
                <ImageStateChip state={img.state} />
              </div>
              <p className="mt-1 font-mono text-xs text-stone-400">
                {/^[0-9a-f]{64}$/.test(img.checksumSha256)
                  ? `sha256: ${img.checksumSha256.slice(0, 12)}…`
                  : ocrCopy.images.checksumPending}
              </p>
              {img.state === 'failed' && img.failure ? (
                <p role="status" className="mt-1 text-xs text-red-700">
                  {img.failure}
                </p>
              ) : null}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="text-xs text-stone-600">
                  {ocrCopy.images.roleLabel}
                  <select
                    aria-label={`${ocrCopy.images.roleLabel}: ${img.fileName}`}
                    className="ml-1 rounded border border-stone-200 px-1.5 py-0.5 font-mono text-xs"
                    value={img.role}
                    onChange={(e) => onRoleChange(img.imageId, e.target.value as IntakeImageRole)}
                  >
                    {ROLE_KEYS.map((role) => (
                      <option key={role} value={role}>
                        {ocrCopy.images.roles[role]}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  aria-label={`${ocrCopy.images.moveUp}: ${img.fileName}`}
                  className="rounded border border-stone-300 px-2 py-0.5 font-mono text-xs text-stone-600 disabled:opacity-40"
                  disabled={position === 0}
                  onClick={() => onMove(img.imageId, 'up')}
                >
                  ↑ {ocrCopy.images.moveUp}
                </button>
                <button
                  type="button"
                  aria-label={`${ocrCopy.images.moveDown}: ${img.fileName}`}
                  className="rounded border border-stone-300 px-2 py-0.5 font-mono text-xs text-stone-600 disabled:opacity-40"
                  disabled={position === ordered.length - 1}
                  onClick={() => onMove(img.imageId, 'down')}
                >
                  ↓ {ocrCopy.images.moveDown}
                </button>

                <label className="text-xs text-stone-600">
                  {ocrCopy.images.replace}
                  <input
                    type="file"
                    accept={IMAGE_PICKER_ACCEPT}
                    aria-label={`${ocrCopy.images.replace}: ${img.fileName}`}
                    className="ml-1 inline-block w-40 text-xs"
                    onChange={(e) => {
                      const [file] = filesFromInput(e);
                      if (file) onReplace(img.imageId, file);
                    }}
                  />
                </label>

                <button
                  type="button"
                  aria-label={`${ocrCopy.images.remove}: ${img.fileName}`}
                  className="rounded border border-red-200 px-2 py-0.5 font-mono text-xs text-red-700"
                  onClick={() => onRemove(img.imageId)}
                >
                  {ocrCopy.images.remove}
                </button>
                {img.state === 'failed' ? (
                  <button
                    type="button"
                    aria-label={`${ocrCopy.images.retry}: ${img.fileName}`}
                    className="rounded border border-stone-300 px-2 py-0.5 font-mono text-xs text-stone-600"
                    onClick={() => onRetry(img.imageId)}
                  >
                    {ocrCopy.images.retry}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
