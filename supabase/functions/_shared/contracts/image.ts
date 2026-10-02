import { z } from "zod";
import type { ArticleBlock } from "./article.ts";

/**
 * Obrazy w artykulach (AGENTS.md, zasada 9): wylacznie z image_assets, z licencja,
 * nigdy wygenerowane przez AI. Baza wymusza to triggerem (migracja 0027); ten kontrakt
 * jest druga warstwa przy odczycie, zeby rekord spoza zasad nie trafil do renderu.
 */

/** Kolumny image_assets czytane przez strone publiczna i panel. Jawna lista, bez select *. */
export const IMAGE_ASSET_COLUMNS =
  "id, kind, url, width, height, alt, license, source, photographer, copyright, is_ai_generated";

const optionalText = z
  .string()
  .nullish()
  .transform((value) => value?.trim() || null);

export const imageAssetSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["hero", "logo", "portrait"]),
  url: z.string().trim().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().trim().min(1),
  license: z.string().trim().min(1),
  source: z.string().trim().min(1),
  photographer: optionalText,
  copyright: optionalText,
  is_ai_generated: z.literal(false),
});

export type ImageAsset = z.infer<typeof imageAssetSchema>;

export interface LicensedImage {
  id: string;
  kind: ImageAsset["kind"];
  url: string;
  width: number;
  height: number;
  alt: string;
  /** Podpis praw widoczny pod zdjeciem, np. "Fot. Jan Kowalski / PAP, CC BY 4.0". */
  attribution: string;
}

/** "Fot. autor / zrodlo, licencja"; copyright zastepuje zrodlo, gdy jest podany. */
export function imageAttribution(
  image: Pick<ImageAsset, "photographer" | "copyright" | "source" | "license">,
): string {
  const owner = image.copyright ?? image.source;
  const credit = image.photographer ? `Fot. ${image.photographer} / ${owner}` : owner;
  return `${credit}, ${image.license}`;
}

/** Wiersz z bazy albo null, gdy brak obrazu, licencji, altu albo obraz jest AI. */
export function licensedImage(row: unknown): LicensedImage | null {
  const parsed = imageAssetSchema.safeParse(row);
  if (!parsed.success) {
    return null;
  }
  const image = parsed.data;
  return {
    id: image.id,
    kind: image.kind,
    url: image.url,
    width: image.width,
    height: image.height,
    alt: image.alt,
    attribution: imageAttribution(image),
  };
}

/** Identyfikatory obrazow z blokow image, bez powtorzen, w kolejnosci wystapienia. */
export function blockImageIds(blocks: readonly ArticleBlock[]): string[] {
  const ids = blocks.flatMap((block) => (block.type === "image" ? [block.imageId] : []));
  return [...new Set(ids)];
}

/** Wybor obrazu glownego w panelu: uuid albo pusty napis dla "bez obrazu". */
export const heroImageSelectionSchema = z
  .union([z.uuid(), z.literal("")])
  .transform((value) => (value === "" ? null : value));
