import { useState } from 'react';
import type { FrameTransferPath } from '../types';
import { copy } from './copy';
import type { HarnessController, HarnessSnapshot } from './harnessController';
import { styles } from './styles';

function mb(v: number | null): string {
  return v === null ? '?' : `${(v / 1048576).toFixed(1)} MB`;
}

/** Expandable diagnostics (B18): the owner never opens a console; everything is on-page. */
export function DiagnosticsPanel({
  controller,
  snap,
}: {
  controller: HarnessController;
  snap: HarnessSnapshot;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section style={styles.card}>
      <button style={styles.buttonSecondary} onClick={() => setOpen((o) => !o)}>
        {open ? copy.diagnostics.hide : copy.diagnostics.toggle}
      </button>
      {open && (
        <div style={styles.details}>
          <div style={styles.kv}>
            <span>{copy.diagnostics.session}</span>
            <b>{snap.sessionId ?? '—'}</b>
          </div>
          <div style={styles.kv}>
            <span>{copy.diagnostics.storage}</span>
            <b>{snap.storage ? `${mb(snap.storage.usage)} / ${mb(snap.storage.quota)}` : '—'}</b>
          </div>
          <div style={styles.kv}>
            <span>{copy.diagnostics.worker}</span>
            <b>
              {snap.worker
                ? `zxing-wasm ${snap.worker.zxingVersion}, warm-up ${Math.round(snap.worker.warmupMs)} ms`
                : '—'}
            </b>
          </div>
          <label style={styles.label}>
            {copy.diagnostics.transferPath}
            <select
              style={styles.input}
              value={snap.transferPath}
              disabled={snap.live !== null}
              onChange={(e) => controller.setTransferPath(e.target.value as FrameTransferPath)}
            >
              {snap.availablePaths.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label style={styles.label}>
            {copy.diagnostics.decodeWidth}
            <select
              style={styles.input}
              value={snap.maxDecodeWidth}
              disabled={snap.live !== null}
              onChange={(e) => controller.setMaxDecodeWidth(Number(e.target.value))}
            >
              <option value={0}>{copy.diagnostics.native}</option>
              <option value={1280}>1280 (720p)</option>
              <option value={960}>960</option>
              <option value={640}>640</option>
            </select>
          </label>
          {snap.delivered && (
            <pre style={styles.mono}>
              {JSON.stringify(
                { settings: snap.delivered.settings, capabilities: snap.delivered.capabilities },
                null,
                1,
              )}
            </pre>
          )}
        </div>
      )}
    </section>
  );
}
