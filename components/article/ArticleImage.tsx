import Image from "next/image";
import type { LicensedImage } from "@contracts/index.ts";
import { shouldOptimizeImage } from "@/lib/image-delivery";
import { supabaseUrl } from "@/lib/env";

/**
 * Zdjecie artykulu z podpisem i atrybucja licencji. Wymiary z image_assets, wiec
 * przegladarka rezerwuje miejsce i nie ma przesuniecia ukladu (CLS).
 */
export function ArticleImage({
  image,
  caption,
  preload = false,
  sizes = "(max-width: 768px) 100vw, 768px",
}: {
  image: LicensedImage;
  caption?: string;
  /** Obraz glowny nad trescia: kandydat na LCP (Next 16: preload zamiast priority). */
  preload?: boolean;
  sizes?: string;
}) {
  return (
    <figure>
      <Image
        src={image.url}
        width={image.width}
        height={image.height}
        alt={image.alt}
        sizes={sizes}
        preload={preload}
        unoptimized={!shouldOptimizeImage(image.url, supabaseUrl())}
        className="h-auto max-w-full rounded-md bg-neutral-100"
      />
      <figcaption className="mt-2 text-sm text-neutral-600">
        {caption ? <span className="text-neutral-800">{caption} </span> : null}
        <span className="text-xs">{image.attribution}</span>
      </figcaption>
    </figure>
  );
}
