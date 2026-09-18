import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { PreparationIllustration } from './preparationIllustrations';

/**
 * A registered preparation illustration, whole and square. Only shipped files
 * are registered; if one still fails to load, nothing is drawn — never a broken
 * image and never a stand-in picture.
 */
export function PreparationIllustrationImage({
  illustration,
  className,
  sizes = '220px',
}: {
  illustration: PreparationIllustration;
  className?: string;
  /** Rendered slot width, so the browser picks the sharp file for it. */
  sizes?: string;
}) {
  // Remembered per image: another machine's illustration is always tried again.
  const [failedCode, setFailedCode] = useState<string | null>(null);
  if (failedCode === illustration.imageCode) return null;
  return (
    <img
      src={illustration.largePath}
      srcSet={`${illustration.smallPath} 256w, ${illustration.largePath} 512w`}
      sizes={sizes}
      width={illustration.width}
      height={illustration.height}
      alt={illustration.alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailedCode(illustration.imageCode)}
      className={cn('aspect-square h-auto rounded-[14px]', className)}
      data-testid="preparation-illustration"
      data-image-code={illustration.imageCode}
    />
  );
}
