import { cn } from '@/lib/cn';
import {
  OWNER_ASSETS,
  ownerAssetOriginal,
  ownerAssetWeb,
  ownerAssetWebSmall,
  type OwnerAssetId,
} from './ownerAssets';

interface OwnerAssetImageProps {
  readonly id: OwnerAssetId;
  /** Extra classes for the <img>. The caller owns the frame. */
  readonly className?: string;
  /** `sizes` hint so the browser picks the 800px variant on phones. */
  readonly sizes?: string;
  /**
   * The hero is the LCP element on its route, so it loads eagerly and with high
   * priority. Everything below the fold stays lazy.
   */
  readonly priority?: boolean;
}

/**
 * Renders one of the owner's Work With Us photographs.
 *
 * WebP for delivery with the untouched PNG as the fallback source, so a browser
 * that cannot decode WebP still gets the owner's original file rather than
 * nothing. `width`/`height` come from the real intrinsic size of the original so
 * the box is reserved before the bytes arrive and the page does not jump.
 *
 * There is deliberately no crop, filter, overlay or tint applied here: the
 * photograph is the authority, and a component is not the place to quietly
 * restyle it. Callers that need a different shape control the FRAME and let
 * `object-cover` do the rest.
 */
export function OwnerAssetImage({ id, className, sizes, priority = false }: OwnerAssetImageProps) {
  const asset = OWNER_ASSETS[id];
  return (
    <picture>
      <source
        type="image/webp"
        srcSet={`${ownerAssetWebSmall(id)} 800w, ${ownerAssetWeb(id)} 1600w`}
        sizes={sizes ?? '100vw'}
      />
      <img
        src={ownerAssetOriginal(id)}
        alt={asset.alt}
        width={asset.width}
        height={asset.height}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : 'auto'}
        className={cn('block h-full w-full object-cover', className)}
      />
    </picture>
  );
}
