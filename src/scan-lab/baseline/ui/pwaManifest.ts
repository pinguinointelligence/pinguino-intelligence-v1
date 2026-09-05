/**
 * Route-scoped PWA manifest (A4): only this page links a manifest, so "Add to Home Screen" on the
 * harness installs a standalone app that opens /scan-lab/baseline, while the rest of the app is untouched.
 */
export const BASELINE_MANIFEST_HREF = '/scan-lab/baseline.webmanifest';

export function installBaselineManifest(doc: Document = document): () => void {
  const added: Element[] = [];
  const head = doc.head;
  const add = (el: Element) => {
    head.appendChild(el);
    added.push(el);
  };
  if (!head.querySelector(`link[rel="manifest"][href="${BASELINE_MANIFEST_HREF}"]`)) {
    const link = doc.createElement('link');
    link.rel = 'manifest';
    link.href = BASELINE_MANIFEST_HREF;
    add(link);
  }
  const metas: Array<[string, string]> = [
    ['apple-mobile-web-app-capable', 'yes'],
    ['mobile-web-app-capable', 'yes'],
    ['apple-mobile-web-app-status-bar-style', 'black-translucent'],
    ['apple-mobile-web-app-title', 'Scan Lab'],
    ['theme-color', '#0b0f14'],
  ];
  for (const [name, content] of metas) {
    if (head.querySelector(`meta[name="${name}"]`)) continue;
    const meta = doc.createElement('meta');
    meta.name = name;
    meta.content = content;
    add(meta);
  }
  return () => {
    for (const el of added) el.remove();
  };
}
