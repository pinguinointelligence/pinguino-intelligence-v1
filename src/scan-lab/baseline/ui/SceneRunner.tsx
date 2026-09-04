import { useEffect, useRef } from 'react';
import type { SceneDefinition } from '../types';
import { copy } from './copy';
import type { HarnessController, HarnessSnapshot } from './harnessController';
import type { FlowStep } from './sceneMachine';
import { styles } from './styles';

interface Props {
  controller: HarnessController;
  snap: HarnessSnapshot;
  step: FlowStep;
  scene: SceneDefinition | undefined;
  attempt: number;
}

/** Live camera view + candidate overlay + HUD. The <video> element lives here for every camera step. */
export function SceneRunner({ controller, snap, step, scene }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (videoRef.current) controller.attachVideo(videoRef.current);
  }, [controller]);

  // draw candidate quads scaled from analysis pixels into the displayed video box (object-fit: cover)
  useEffect(() => {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    const live = snap.live;
    if (!canvas || !video) return;
    const rect = video.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (
      canvas.width !== Math.round(rect.width * dpr) ||
      canvas.height !== Math.round(rect.height * dpr)
    ) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!live || live.frameWidth === 0) return;
    const scale = Math.max(rect.width / live.frameWidth, rect.height / live.frameHeight) * dpr;
    const offX = (canvas.width - live.frameWidth * scale) / 2;
    const offY = (canvas.height - live.frameHeight * scale) / 2;
    ctx.lineWidth = 3 * dpr;
    live.candidates.forEach((quad, i) => {
      ctx.strokeStyle = i === 0 ? '#2ee6a6' : 'rgba(255,209,102,0.7)';
      ctx.beginPath();
      quad.points.forEach((p, k) => {
        const x = offX + p.x * scale;
        const y = offY + p.y * scale;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
    });
  }, [snap.live, snap.version]);

  const live = snap.live;
  const recording = step === 'scene_recording';
  const badge = recording
    ? copy.scene.recording
    : step === 'scene_done'
      ? copy.scene.done
      : copy.scene.ready;
  const badgeColor = recording ? '#ff4d4d' : step === 'scene_done' ? '#2ee6a6' : '#ffd166';
  const progress = live && scene ? Math.min(100, (live.elapsedMs / scene.durationMs) * 100) : 0;
  const torchSupported = snap.controls?.torch.supported ?? false;

  return (
    <div style={styles.videoWrap}>
      <video ref={videoRef} style={styles.video} playsInline muted autoPlay />
      <canvas ref={overlayRef} style={styles.overlay} />
      {recording && <div style={{ ...styles.progress, width: `${progress}%` }} />}
      <div style={{ ...styles.badge, background: badgeColor, color: '#062016' }}>
        {badge}
        {live && recording ? ` · ${copy.scene.remaining(Math.ceil(live.remainingMs / 1000))}` : ''}
      </div>
      {torchSupported && (
        <button style={styles.torch} onClick={() => void controller.setTorch(!snap.torchOn)}>
          {snap.torchOn ? copy.scene.torchOff : copy.scene.torchOn}
        </button>
      )}
      {live && (
        <div style={styles.hud}>
          <div style={styles.hudCell}>
            {live.fpsNow} {copy.hud.fps}
            <br />
            {live.processed} {copy.hud.processed}
            <br />
            {live.dropped} {copy.hud.dropped}
          </div>
          <div style={styles.hudCell}>
            {copy.hud.roundTrip} {Math.round(live.roundTripP50)} ms
            <br />
            loc {Math.round(live.localizeP50)} · full {Math.round(live.cheapP50)}
            <br />
            roi {Math.round(live.roiP50)} · rect {Math.round(live.rectifiedP50)}
          </div>
          <div style={{ ...styles.hudCell, color: live.lastValueValid ? '#2ee6a6' : '#ffd166' }}>
            {live.lastValue ?? '—'}
            <br />
            {copy.hud.streak}: {live.streak}
            <br />
            {live.frameWidth}×{live.frameHeight} {snap.transferPath}
          </div>
        </div>
      )}
    </div>
  );
}
