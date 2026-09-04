import { useCallback, useEffect, useMemo, useReducer, useState, useSyncExternalStore } from 'react';
import { SCENES } from '../scenes';
import { copy } from './copy';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { HarnessController } from './harnessController';
import { installBaselineManifest } from './pwaManifest';
import { flowReducer, initialFlowState, type FlowAction, type FlowState } from './sceneMachine';
import { SceneRunner } from './SceneRunner';
import { styles } from './styles';
import { SummaryView } from './SummaryView';
import { detectExecutionMode, parseUserAgent } from '../device/deviceInfo';

const SCENE_IDS = SCENES.map((s) => s.id);

function useFlow(): [FlowState, (a: FlowAction) => void] {
  return useReducer(
    (s: FlowState, a: FlowAction) => flowReducer(s, a, SCENES.length, SCENE_IDS),
    initialFlowState,
  );
}

function fmtMs(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v)} ms` : '—';
}

export function BaselinePage() {
  const [controller] = useState(() => new HarnessController());
  const snap = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [flow, dispatch] = useFlow();
  const [modelLabel, setModelLabel] = useState('');
  const [declared, setDeclared] = useState('');
  const [resume, setResume] = useState(() => HarnessController.readResume());
  const [probeDone, setProbeDone] = useState(false);
  const scene = SCENES[flow.sceneIndex];

  useEffect(() => installBaselineManifest(), []);
  useEffect(() => () => controller.dispose(), [controller]);

  const supported =
    typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
  const secure = typeof window !== 'undefined' && window.isSecureContext;
  const executionMode = useMemo(
    () => (typeof navigator !== 'undefined' ? detectExecutionMode(navigator, window) : 'unknown'),
    [],
  );
  const uaGuess = useMemo(
    () =>
      typeof navigator !== 'undefined'
        ? parseUserAgent(navigator.userAgent)
        : { os: '', browser: '' },
    [],
  );

  // persist resume info whenever the flow advances past the device step
  useEffect(() => {
    if (flow.step === 'intro' || flow.step === 'device' || flow.step === 'error') return;
    if (flow.step === 'summary') {
      HarnessController.clearResume();
      return;
    }
    controller.saveResume({
      sceneIndex: flow.sceneIndex,
      completed: flow.completed,
      skipped: flow.skipped,
    });
  }, [controller, flow.step, flow.sceneIndex, flow.completed, flow.skipped]);

  const onDeviceSubmit = useCallback(async () => {
    try {
      await controller.startSession(modelLabel, declared || null);
      dispatch({ type: 'SET_DEVICE', modelLabel, declaredCode: declared || null });
    } catch {
      /* error published in snapshot */
    }
  }, [controller, dispatch, modelLabel, declared]);

  const onResume = useCallback(async () => {
    if (!resume) return;
    try {
      await controller.startSession(resume.modelLabel, resume.declaredCode, resume.sessionId);
      setModelLabel(resume.modelLabel);
      dispatch({
        type: 'RESUME',
        modelLabel: resume.modelLabel,
        declaredCode: resume.declaredCode,
        sceneIndex: resume.sceneIndex,
        completed: resume.completed,
        skipped: resume.skipped,
      });
      setResume(null);
    } catch {
      /* published */
    }
  }, [controller, dispatch, resume]);

  const onEnableCamera = useCallback(async () => {
    try {
      await controller.openCamera();
      dispatch({ type: 'CAMERA_READY' });
    } catch {
      /* published */
    }
  }, [controller, dispatch]);

  // probe step runs automatically
  useEffect(() => {
    if (flow.step !== 'probe' || probeDone) return;
    let cancelled = false;
    controller
      .probe()
      .then(() => {
        if (!cancelled) setProbeDone(true);
      })
      .catch(() => {
        /* published */
      });
    return () => {
      cancelled = true;
    };
  }, [controller, flow.step, probeDone]);

  const onSceneStart = useCallback(() => {
    if (!scene) return;
    dispatch({ type: 'SCENE_START' });
    controller.startScene(scene, flow.attempt, () => dispatch({ type: 'SCENE_FINISHED' }));
  }, [controller, dispatch, scene, flow.attempt]);

  const onSceneStop = useCallback(() => controller.finishScene(), [controller]);

  useEffect(() => {
    if (flow.step === 'summary')
      void controller.buildReport().then(() => controller.prepareArchive());
  }, [controller, flow.step]);

  const showVideo = flow.step !== 'intro' && flow.step !== 'device' && flow.step !== 'summary';

  return (
    <div style={styles.root} data-testid="scan-lab-baseline">
      <header style={styles.header}>
        <div style={styles.title}>{copy.title}</div>
        {flow.step !== 'intro' && flow.step !== 'device' && scene && flow.step !== 'summary' && (
          <div style={styles.subtitle}>{copy.scene.of(flow.sceneIndex + 1, SCENES.length)}</div>
        )}
      </header>

      {snap.error && (
        <div style={styles.errorBox} role="alert">
          <div>{snap.error}</div>
          <button style={styles.buttonSecondary} onClick={() => controller.clearError()}>
            {copy.error.ok}
          </button>
        </div>
      )}

      {flow.step === 'intro' && (
        <section style={styles.card}>
          <p style={styles.p}>{copy.intro.lead}</p>
          <p style={styles.p}>{copy.intro.whatWeRecord}</p>
          <p style={styles.p}>{copy.intro.noIds}</p>
          {!supported && <p style={styles.warn}>{copy.camera.unsupported}</p>}
          {supported && !secure && <p style={styles.warn}>{copy.camera.insecure}</p>}
          {resume && (
            <div style={styles.resumeBox}>
              <div>
                {copy.resume.found} {resume.modelLabel} · scena {resume.sceneIndex + 1}
              </div>
              <div style={styles.row}>
                <button style={styles.button} onClick={() => void onResume()}>
                  {copy.resume.continue}
                </button>
                <button
                  style={styles.buttonSecondary}
                  onClick={() => {
                    HarnessController.clearResume();
                    setResume(null);
                  }}
                >
                  {copy.resume.fresh}
                </button>
              </div>
            </div>
          )}
          <button
            style={styles.button}
            disabled={!supported || !secure}
            onClick={() => dispatch({ type: 'START' })}
          >
            {copy.intro.start}
          </button>
        </section>
      )}

      {flow.step === 'device' && (
        <section style={styles.card}>
          <label style={styles.label}>
            {copy.device.modelLabel}
            <input
              style={styles.input}
              value={modelLabel}
              placeholder={copy.device.modelPlaceholder}
              onChange={(e) => setModelLabel(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label style={styles.label}>
            {copy.device.declaredCode}
            <input
              style={styles.input}
              value={declared}
              inputMode="numeric"
              placeholder="5901234123457"
              onChange={(e) => setDeclared(e.target.value)}
              autoComplete="off"
            />
          </label>
          <p style={styles.hint}>{copy.device.declaredHint}</p>
          <p style={styles.hint}>
            {copy.device.modeLabel}: {executionMode} · {uaGuess.os} · {uaGuess.browser}
          </p>
          <button
            style={styles.button}
            disabled={!modelLabel.trim()}
            onClick={() => void onDeviceSubmit()}
          >
            {copy.device.next}
          </button>
        </section>
      )}

      {showVideo && (
        <SceneRunner
          controller={controller}
          snap={snap}
          step={flow.step}
          scene={scene}
          attempt={flow.attempt}
        />
      )}

      {flow.step === 'camera' && (
        <section style={styles.card}>
          {!snap.delivered ? (
            <button
              style={styles.button}
              disabled={snap.cameraBusy}
              onClick={() => void onEnableCamera()}
            >
              {snap.cameraBusy ? copy.camera.enabling : copy.camera.enable}
            </button>
          ) : (
            <>
              <div style={styles.kv}>
                <span>{copy.camera.delivered}</span>
                <b>
                  {snap.delivered.width}×{snap.delivered.height} @ {snap.delivered.frameRate ?? '?'}{' '}
                  · {snap.delivered.label ?? '—'}
                </b>
              </div>
              <div style={styles.kv}>
                <span>{copy.camera.requested}</span>
                <b>
                  1920×1080 @ 30 · open {fmtMs(snap.delivered.openMs)} · 1st frame{' '}
                  {fmtMs(snap.delivered.firstFrameMs)}
                </b>
              </div>
              {snap.ultrawideSuspicion?.suspicious && (
                <p style={styles.warn}>
                  {copy.camera.ultrawideWarning} {snap.ultrawideSuspicion.reason}
                </p>
              )}
              {snap.cameras.length > 1 && (
                <label style={styles.label}>
                  {copy.camera.choose}
                  <select
                    style={styles.input}
                    value={snap.selectedCamera?.deviceId ?? ''}
                    disabled={snap.cameraBusy}
                    onChange={(e) =>
                      void controller.openCamera(e.target.value).catch(() => undefined)
                    }
                  >
                    {snap.cameras.map((c) => (
                      <option key={c.deviceId} value={c.deviceId}>
                        {c.label}
                        {c.likelyUltrawide ? ' (ultra-wide?)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button style={styles.button} onClick={() => dispatch({ type: 'CAMERA_READY' })}>
                {copy.camera.next}
              </button>
            </>
          )}
        </section>
      )}

      {flow.step === 'probe' && (
        <section style={styles.card}>
          <div style={styles.h2}>{copy.probe.heading}</div>
          {!probeDone && <p style={styles.p}>{copy.probe.running}</p>}
          {snap.controls && (
            <>
              <div style={styles.kv}>
                <span>{copy.probe.zoom}</span>
                <b>
                  {snap.controls.zoom.supported
                    ? `${copy.probe.supported} ${snap.controls.zoom.range ? `${snap.controls.zoom.range.min}–${snap.controls.zoom.range.max}` : ''} · ${snap.controls.zoom.ok ? copy.probe.ok : copy.probe.failed}`
                    : copy.probe.unsupported}
                </b>
              </div>
              <div style={styles.kv}>
                <span>{copy.probe.torch}</span>
                <b>
                  {snap.controls.torch.supported
                    ? `${copy.probe.supported} · ${snap.controls.torch.ok ? copy.probe.ok : copy.probe.failed}`
                    : copy.probe.unsupported}
                </b>
              </div>
              <div style={styles.kv}>
                <span>{copy.probe.focus}</span>
                <b>{snap.controls.focusModeExposed ? 'tak' : 'nie'}</b>
              </div>
            </>
          )}
          {snap.worker && (
            <div style={styles.kv}>
              <span>{copy.probe.worker}</span>
              <b>
                zxing-wasm {snap.worker.zxingVersion} · warm-up {fmtMs(snap.worker.warmupMs)} ·
                OffscreenCanvas {snap.worker.offscreenCanvas ? 'tak' : 'nie'}
              </b>
            </div>
          )}
          <button
            style={styles.button}
            disabled={!probeDone}
            onClick={() => dispatch({ type: 'PROBE_DONE' })}
          >
            {copy.probe.next}
          </button>
        </section>
      )}

      {(flow.step === 'scene_ready' ||
        flow.step === 'scene_recording' ||
        flow.step === 'scene_done') &&
        scene && (
          <section style={styles.card}>
            <div style={styles.h2}>{scene.title}</div>
            <p style={styles.p}>{scene.instruction}</p>
            {flow.step === 'scene_ready' && (
              <div style={styles.row}>
                <button style={styles.button} onClick={onSceneStart}>
                  {copy.scene.start}
                </button>
                <button
                  style={styles.buttonSecondary}
                  onClick={() => dispatch({ type: 'SCENE_SKIP' })}
                >
                  {copy.scene.skip}
                </button>
              </div>
            )}
            {flow.step === 'scene_recording' && (
              <button style={styles.buttonSecondary} onClick={onSceneStop}>
                {copy.scene.stop}
              </button>
            )}
            {flow.step === 'scene_done' && snap.lastScene && (
              <>
                <div style={styles.kv}>
                  <span>{copy.scene.firstDecode}</span>
                  <b>
                    {snap.lastScene.firstDecodeMs === null
                      ? copy.scene.noDecode
                      : fmtMs(snap.lastScene.firstDecodeMs)}
                  </b>
                </div>
                <div style={styles.kv}>
                  <span>{copy.scene.values}</span>
                  <b>
                    {Object.entries(snap.lastScene.decodedValues)
                      .map(
                        ([v, n]) =>
                          `${v} ×${n}${snap.lastScene?.wrongValues.includes(v) ? ` (${copy.scene.wrong})` : ''}`,
                      )
                      .join(', ') || '—'}
                  </b>
                </div>
                <div style={styles.kv}>
                  <span>{copy.scene.frames}</span>
                  <b>
                    {snap.lastScene.framesProcessed} · {copy.hud.roundTrip}{' '}
                    {fmtMs(snap.lastScene.transferMs.p50 + snap.lastScene.decodeFullMs.p50)}
                  </b>
                </div>
                <div style={styles.row}>
                  <button style={styles.button} onClick={() => dispatch({ type: 'SCENE_NEXT' })}>
                    {copy.scene.next}
                  </button>
                  <button
                    style={styles.buttonSecondary}
                    onClick={() => dispatch({ type: 'SCENE_RETRY' })}
                  >
                    {copy.scene.retry}
                  </button>
                </div>
              </>
            )}
          </section>
        )}

      {flow.step === 'summary' && <SummaryView controller={controller} snap={snap} />}

      {flow.step !== 'intro' && flow.step !== 'device' && (
        <DiagnosticsPanel controller={controller} snap={snap} />
      )}
    </div>
  );
}

export default BaselinePage;
