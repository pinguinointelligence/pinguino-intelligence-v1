import { useEffect } from 'react';
import type { SocialMetadata } from '@/features/community/domain/shareUrls';

/**
 * Applies page metadata (§46) — title, description, canonical, Open Graph and
 * robots — and REMOVES what it added on unmount.
 *
 * The removal matters more than the application: this is an SPA, so a
 * `noindex` tag left behind by a share page would silently de-index whatever
 * the user navigated to next, and a canonical URL left behind would point a
 * crawler at the wrong page. Every tag this hook writes is marked
 * `data-gellatti-meta` and is torn down together.
 *
 * A crawler that does not run JavaScript sees the static `index.html` head. So
 * a direct-share route ALSO needs `noindex` at the edge — the SPA tag is
 * defence in depth, not the whole defence. `public/_headers`
 * (`/share/* → X-Robots-Tag: noindex`) is the authority; this hook keeps
 * JavaScript-executing crawlers and social scrapers honest too.
 */
export function useDocumentMetadata(metadata: SocialMetadata | null): void {
  useEffect(() => {
    if (!metadata || typeof document === 'undefined') return;

    const previousTitle = document.title;
    document.title = metadata.title;
    const added: Element[] = [];

    const setMeta = (attribute: 'name' | 'property', key: string, content: string) => {
      const element = document.createElement('meta');
      element.setAttribute(attribute, key);
      element.setAttribute('content', content);
      element.setAttribute('data-gellatti-meta', 'true');
      document.head.appendChild(element);
      added.push(element);
    };

    setMeta('name', 'robots', metadata.robots);
    setMeta('name', 'description', metadata.description);
    setMeta('property', 'og:title', metadata.title);
    setMeta('property', 'og:description', metadata.description);
    setMeta('property', 'og:type', 'article');
    setMeta('name', 'twitter:card', metadata.image ? 'summary_large_image' : 'summary');
    if (metadata.image) setMeta('property', 'og:image', metadata.image);
    if (metadata.creator) setMeta('name', 'author', metadata.creator);

    if (metadata.canonical) {
      const link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      link.setAttribute('href', metadata.canonical);
      link.setAttribute('data-gellatti-meta', 'true');
      document.head.appendChild(link);
      added.push(link);
      setMeta('property', 'og:url', metadata.canonical);
    }

    return () => {
      document.title = previousTitle;
      for (const element of added) element.remove();
    };
  }, [metadata]);
}
