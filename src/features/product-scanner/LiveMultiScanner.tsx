/**
 * LIVE SCANNER — the surface.
 *
 * The camera stays open. The customer sweeps it across their shopping, products lock
 * green one after another, and nothing interrupts the sweep: no modal, no "photo taken",
 * no per-product confirmation step. "Koniec" ends it and shows what was collected.
 *
 * This component owns NO policy. What counts as a product, what turns green, what is a
 * duplicate and what needs the deep flow are all decided by `liveScanSession` and
 * `liveRecognition`; this file only opens the camera, draws, and asks.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applicationPrimaryClasses,
  applicationQuietClasses,
  applicationSecondaryClasses,
} from '@/components/ui/applicationControlStyles';
import { createLiveFrameSource } from './liveFrameSource';
import { LiveRecognizer } from './liveRecognition';
import { createLiveScanCapabilities } from './liveScanCapabilities';
import {
  LiveScanController,
  createVideoFrameGrabber,
  type LiveScanSnapshot,
} from './liveScanController';
import { planHandoff, reviewLabel } from './liveScanHandoff';
import type { AcceptedProduct, LiveScanSessionState } from './liveScanSession';
import { emptyLiveScanSession } from './liveScanSession';

export interface LiveMultiScannerProps {
  /** Catalogue products the customer collected, ready for the HOME draft. */
  readonly onAddToRecipe: (products: readonly AcceptedProduct[]) => void;
  /** Products the catalogue does not know — handed to the existing deep Scanner. */
  readonly onNeedsDeepScan: (products: readonly AcceptedProduct[]) => void;
  readonly onClose: () => void;
  /** Off by default: local OCR costs about a second of phone CPU per frame. */
  readonly enableOcr?: boolean;
}

type Phase = 'starting' | 'scanning' | 'review' | 'no_camera';

const primaryButton = applicationPrimaryClasses('w-full disabled:opacity-45');
const secondaryButton = applicationSecondaryClasses('');
const quietButton = applicationQuietClasses('');

export function LiveMultiScanner({
  onAddToRecipe,
  onNeedsDeepScan,
  onClose,
  enableOcr = false,
}: LiveMultiScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controllerRef = useRef<LiveScanController | null>(null);
  /** Survives the camera restart that "Skanuj dalej" forces. */
  const snapshotRef = useRef<LiveScanSnapshot | null>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [session, setSession] = useState<LiveScanSessionState>(emptyLiveScanSession());
  /** The name that just locked, shown briefly. Never a diagnostic. */
  const [flash, setFlash] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (phase !== 'starting' && phase !== 'scanning') return;
    let cancelled = false;
    let stopFrames: (() => void) | null = null;
    let stream: MediaStream | null = null;

    const open = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch {
        if (!cancelled) setPhase('no_camera');
        return;
      }
      const video = videoRef.current;
      if (cancelled || !video) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play().catch(() => {});

      const controller = new LiveScanController({
        grabFrame: createVideoFrameGrabber(video),
        recognizer: new LiveRecognizer(createLiveScanCapabilities({ enableOcr })),
        stream,
        resumeFrom: snapshotRef.current,
        onUpdate: ({ event, state }) => {
          if (cancelled) return;
          setSession(state);
          if (event.kind === 'confirmed') {
            // Green, then straight back to sweeping — the camera never pauses.
            setFlash(event.product.label);
            setHint(null);
          } else if (event.kind === 'unresolved') {
            setFlash(null);
            setHint('Zapisaliśmy ten produkt — dokończysz go po skanowaniu.');
          } else if (event.kind === 'candidate') {
            setHint('Przytrzymaj chwilę.');
          }
        },
      });
      controller.start();
      controllerRef.current = controller;
      // Resuming rebuilds the list from the carried sweep, not from zero.
      setSession(controller.state);
      const frames = createLiveFrameSource(video, () => controller.onFrame());
      frames.start();
      stopFrames = () => frames.stop();
      if (!cancelled) setPhase('scanning');
    };

    void open();
    return () => {
      cancelled = true;
      stopFrames?.();
      // The camera light must go out the moment the sweep ends, however it ended.
      controllerRef.current?.stop();
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
    // The sweep is set up once; `phase` transitions to review tear it down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase === 'review', enableOcr]);

  // The green flash is a confirmation, not a message that has to be dismissed.
  useEffect(() => {
    if (flash === null) return;
    const timer = window.setTimeout(() => setFlash(null), 1_400);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const remove = useCallback((identityKey: string) => {
    const controller = controllerRef.current;
    const next = controller ? controller.remove(identityKey) : emptyLiveScanSession();
    // The snapshot is what a resumed sweep is rebuilt from, so a removal has to reach it
    // too — otherwise "Skanuj dalej" would bring the deleted product straight back.
    snapshotRef.current = controller?.snapshot() ?? null;
    setSession(next);
  }, []);

  const finish = useCallback(() => {
    // Keep the sweep before the camera goes: the review screen and any later
    // "Skanuj dalej" both read from here.
    snapshotRef.current = controllerRef.current?.snapshot() ?? null;
    controllerRef.current?.stop();
    setPhase('review');
  }, []);

  const accept = useCallback(() => {
    const plan = planHandoff(session);
    if (plan.toRecipe.length > 0) onAddToRecipe(plan.toRecipe);
    if (plan.toDeepScan.length > 0) onNeedsDeepScan(plan.toDeepScan);
    onClose();
  }, [session, onAddToRecipe, onNeedsDeepScan, onClose]);

  if (phase === 'no_camera') {
    return (
      <div className="p-6 text-center">
        <p className="text-ink/80">Nie mamy dostępu do aparatu.</p>
        <p className="mt-1 text-sm text-ink/60">
          Włącz go w ustawieniach przeglądarki i spróbuj ponownie.
        </p>
        <button type="button" className={`${secondaryButton} mt-4`} onClick={onClose}>
          Wróć
        </button>
      </div>
    );
  }

  if (phase === 'review') {
    return (
      <ReviewScreen
        products={session.accepted}
        onRemove={remove}
        onRescan={(identityKey) => {
          remove(identityKey);
          setPhase('starting');
        }}
        onBackToScanning={() => setPhase('starting')}
        onAccept={accept}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />

      {/* The reticle turns green on a lock. That is the whole feedback vocabulary. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-8 rounded-3xl border-4 transition-colors duration-200 ${
          flash ? 'border-emerald-400' : 'border-white/40'
        }`}
      />

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none absolute inset-x-0 top-6 flex flex-col items-center gap-2 px-6 text-center"
      >
        {flash ? (
          <span className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow">
            Dodano: {flash}
          </span>
        ) : (
          <span className="rounded-full bg-black/50 px-4 py-2 text-sm text-white">
            {hint ?? 'Przesuwaj telefon nad produktami.'}
          </span>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent p-5">
        <button type="button" className={`${quietButton} text-white`} onClick={onClose}>
          Anuluj
        </button>
        <span className="text-sm text-white/90">Zebrane: {session.accepted.length}</span>
        <button
          type="button"
          className={applicationPrimaryClasses('')}
          onClick={finish}
          disabled={session.accepted.length === 0}
        >
          Koniec
        </button>
      </div>
    </div>
  );
}

function ReviewScreen({
  products,
  onRemove,
  onRescan,
  onBackToScanning,
  onAccept,
  onClose,
}: {
  products: readonly AcceptedProduct[];
  onRemove: (identityKey: string) => void;
  onRescan: (identityKey: string) => void;
  onBackToScanning: () => void;
  onAccept: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full w-full flex-col gap-4 p-5">
      <h2 className="text-lg font-medium text-ink">Zebrane produkty</h2>

      {products.length === 0 ? (
        <p className="text-ink/60">Nie zebraliśmy jeszcze żadnego produktu.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {products.map((product) => (
            <li
              key={product.identityKey}
              className="flex items-center justify-between gap-3 rounded-2xl border border-ink/10 bg-white px-4 py-3"
            >
              <span className="min-w-0 flex-1 truncate text-ink">{reviewLabel(product)}</span>
              <button
                type="button"
                className={quietButton}
                onClick={() => onRescan(product.identityKey)}
              >
                Zmień
              </button>
              <button
                type="button"
                className={quietButton}
                onClick={() => onRemove(product.identityKey)}
              >
                Usuń
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto flex flex-col gap-2">
        <button
          type="button"
          className={primaryButton}
          onClick={onAccept}
          disabled={products.length === 0}
        >
          Dodaj do przepisu
        </button>
        <button type="button" className={secondaryButton} onClick={onBackToScanning}>
          Skanuj dalej
        </button>
        <button type="button" className={quietButton} onClick={onClose}>
          Anuluj
        </button>
      </div>
    </div>
  );
}
