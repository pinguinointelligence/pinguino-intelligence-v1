import { useEffect, useState } from 'react';
import { SCENE_BY_ID } from '../scenes';
import { copy } from './copy';
import type { HarnessController, HarnessSnapshot } from './harnessController';
import { styles } from './styles';

function ms(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v)}` : '—';
}

export function SummaryView({
  controller,
  snap,
}: {
  controller: HarnessController;
  snap: HarnessSnapshot;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const report = snap.report;
  useEffect(() => {
    void controller.probeCollector();
  }, [controller]);
  const onDownload = () => {
    const outcome = controller.download();
    setStatus(outcome === 'downloaded' ? copy.summary.downloaded : copy.summary.unsupported);
  };
  const onSend = () => {
    setSending(true);
    void controller.sendToCollector().then((r) => {
      setSending(false);
      setStatus(r.ok ? copy.summary.sent((r.bytes / 1048576).toFixed(1)) : copy.summary.sendFailed);
    });
  };
  const onShare = () => {
    // synchronous inside the tap: Web Share needs the gesture
    void controller.share().then((outcome) => {
      setStatus(
        outcome === 'shared'
          ? copy.summary.shared
          : outcome === 'downloaded'
            ? copy.summary.downloaded
            : outcome === 'cancelled'
              ? copy.summary.cancelled
              : copy.summary.unsupported,
      );
    });
  };
  const onCopy = () => {
    if (!report) return;
    void navigator.clipboard
      ?.writeText(JSON.stringify(report, null, 2))
      .then(() => setStatus(copy.summary.copied))
      .catch(() => setStatus(copy.summary.unsupported));
  };
  const onDelete = () => {
    if (!window.confirm(copy.summary.deleteConfirm)) return;
    void controller.deleteSession().then(() => setStatus(copy.summary.deleted));
  };
  return (
    <section style={styles.card}>
      <div style={styles.h2}>{copy.summary.heading}</div>
      {report && (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>{copy.summary.columns.scene}</th>
                <th style={styles.th}>{copy.summary.columns.verdict}</th>
                <th style={styles.th}>{copy.summary.columns.firstConfirmed}</th>
                <th style={styles.th}>{copy.summary.columns.hits}</th>
                <th style={styles.th}>{copy.summary.columns.fps}</th>
                <th style={styles.th}>{copy.summary.columns.worker}</th>
              </tr>
            </thead>
            <tbody>
              {report.scenes.map((s) => (
                <tr key={`${s.sceneId}:${s.attempt}`}>
                  <td style={styles.td}>
                    {SCENE_BY_ID.get(s.sceneId)?.title ?? s.sceneId}
                    {s.attempt > 1 ? ` (#${s.attempt})` : ''}
                  </td>
                  <td
                    style={{
                      ...styles.td,
                      color:
                        s.verdict === 'MISREAD'
                          ? '#ff4d4d'
                          : s.verdict === 'DECODED_CONFIRMED'
                            ? '#2ee6a6'
                            : undefined,
                    }}
                  >
                    {copy.summary.verdict[s.verdict] ?? s.verdict}
                  </td>
                  <td style={styles.td}>
                    {ms(s.firstConfirmedMs)}
                    {s.confirmedText ? ` · ${s.confirmedText}` : ''}
                  </td>
                  <td style={styles.td}>
                    {s.hits}/{s.decodeAttempts}
                    {s.misreadCount ? ` · ${s.misreadCount} ${copy.scene.wrong}` : ''}
                  </td>
                  <td style={styles.td}>{ms(s.fps.p50)}</td>
                  <td style={styles.td}>{ms(s.workerRoundTripMs.p95)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={styles.hint}>{copy.summary.sendHint}</p>
      <div style={styles.row}>
        <button
          style={styles.button}
          disabled={!snap.archive || snap.archiveBusy}
          onClick={onShare}
        >
          {snap.archiveBusy
            ? copy.summary.preparing
            : `${copy.summary.export}${snap.archive ? ` · ${(snap.archive.bytes / 1048576).toFixed(1)} MB` : ''}`}
        </button>
        <button
          style={styles.buttonSecondary}
          disabled={!snap.archive || snap.archiveBusy}
          onClick={onDownload}
        >
          {copy.summary.download}
        </button>
        {snap.collector && (
          <button
            style={styles.button}
            disabled={!snap.archive || snap.archiveBusy || sending}
            onClick={onSend}
          >
            {sending ? copy.summary.sending : copy.summary.sendToMac}
          </button>
        )}
        <button style={styles.buttonSecondary} disabled={!report} onClick={onCopy}>
          {copy.summary.copyJson}
        </button>
        <button style={styles.buttonSecondary} onClick={onDelete}>
          {copy.summary.delete}
        </button>
      </div>
      {status && <p style={styles.p}>{status}</p>}
      {report && (
        <pre style={styles.mono}>
          {JSON.stringify(
            {
              device: report.device,
              camera: report.camera.delivered,
              verdictCounts: report.verdictCounts,
              totals: report.totals,
            },
            null,
            1,
          )}
        </pre>
      )}
    </section>
  );
}
