"use client";

/**
 * CoverImage — selective image optimization wrapper.
 *
 * optimized=true  → Next.js <Image> — goes through Vercel's image optimizer
 *                   (counts against the 5,000 transformations/month quota)
 * optimized=false → plain <img> — bypasses optimizer entirely, zero quota cost
 *
 * Default is false so bulk card rows don't blow the monthly limit.
 * Only pass optimized={true} for high-visibility, above-the-fold images.
 */

import Image from "next/image";

interface CoverImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  sizes?: string;
  quality?: number;
  priority?: boolean;
  /** When true, routes through Vercel's image optimizer. Default: false. */
  optimized?: boolean;
  style?: React.CSSProperties;
  onError?: () => void;
}

export default function CoverImage({
  src,
  alt,
  width,
  height,
  sizes,
  quality = 75,
  priority = false,
  optimized = false,
  style,
  onError,
}: CoverImageProps) {
  if (optimized) {
    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        quality={quality}
        priority={priority}
        style={style}
        onError={onError}
      />
    );
  }

  // Plain <img> — no Next.js transformation, no Vercel quota consumed.
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      style={style}
      onError={onError}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
