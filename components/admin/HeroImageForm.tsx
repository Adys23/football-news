"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import type { LicensedImage } from "@contracts/index.ts";
import { saveArticleHero } from "@/app/admin/artykuly/[id]/actions";
import { EditResult } from "@/components/admin/ArticleMetaForm";
import { Button } from "@/components/ui/button";

/** Miniatura w panelu: bez optymalizatora, panel nie jest stroną publiczną. */
export function ImageThumbnail({ image }: { image: LicensedImage }) {
  return (
    <Image
      src={image.url}
      width={image.width}
      height={image.height}
      alt={image.alt}
      unoptimized
      className="h-20 w-auto rounded bg-neutral-100 object-cover"
    />
  );
}

/**
 * Wybór zdjęcia głównego z biblioteki (image_assets z licencją, nie AI, rodzaj hero).
 * Wgrywanie nowych zdjęć to V2 (docs/roadmap.md).
 */
export function HeroImageForm({
  articleId,
  updatedAt,
  heroImageId,
  library,
}: {
  articleId: string;
  updatedAt: string;
  heroImageId: string | null;
  library: LicensedImage[];
}) {
  const [state, action, pending] = useActionState(saveArticleHero, undefined);
  const [selected, setSelected] = useState(heroImageId ?? "");
  const heroes = library.filter((image) => image.kind === "hero");
  const missing = heroImageId !== null && !heroes.some((image) => image.id === heroImageId);

  return (
    <form action={action} className="mt-4 grid gap-4">
      <input type="hidden" name="articleId" value={articleId} />
      <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />

      {missing ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          Obecne zdjęcie główne nie spełnia zasad biblioteki. Wybierz inne albo usuń je.
        </p>
      ) : null}

      <fieldset className="grid gap-2">
        <legend className="text-xs text-neutral-500">Zdjęcie główne</legend>
        <label className="flex items-center gap-3 rounded-md border border-neutral-200 p-2 text-sm">
          <input
            type="radio"
            name="heroImageId"
            value=""
            checked={selected === ""}
            onChange={() => setSelected("")}
          />
          Bez zdjęcia
        </label>
        {heroes.map((image) => (
          <label
            key={image.id}
            className="flex items-center gap-3 rounded-md border border-neutral-200 p-2 text-sm"
          >
            <input
              type="radio"
              name="heroImageId"
              value={image.id}
              checked={selected === image.id}
              onChange={() => setSelected(image.id)}
            />
            <ImageThumbnail image={image} />
            <span>
              {image.alt}
              <span className="block text-xs text-neutral-500">{image.attribution}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {heroes.length === 0 ? (
        <p className="text-sm text-neutral-600">Biblioteka nie ma zdjęć głównych.</p>
      ) : null}

      {state ? <EditResult state={state} /> : null}

      <div>
        <Button type="submit" disabled={pending || selected === (heroImageId ?? "")}>
          {pending ? "Zapisywanie…" : "Zapisz zdjęcie główne"}
        </Button>
      </div>
    </form>
  );
}
