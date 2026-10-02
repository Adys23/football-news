import type { ReactNode } from "react";
import type { ArticleBlock, LicensedImage } from "@contracts/index.ts";
import { ArticleImage } from "@/components/article/ArticleImage";

const NO_IMAGES: ReadonlyMap<string, LicensedImage> = new Map();

/**
 * "review" (panel) pokazuje wszystko, takze braki: fakt bez tresci i zdjecie spoza biblioteki.
 * "public" pomija to, czego czytelnik nie powinien ogladac jako usterki.
 */
export type BlockRendererVariant = "review" | "public";

/**
 * Zamkniety zbior typow blokow z articleContentSchema. Panel i strona publiczna
 * renderuja tresc tylko stad, nigdy z HTML.
 */
export function BlockRenderer({
  blocks,
  factStatements,
  images = NO_IMAGES,
  renderAfter,
  variant = "review",
}: {
  blocks: readonly ArticleBlock[];
  /** id faktu -> zdanie, dla blokow fact_box. */
  factStatements: ReadonlyMap<string, string>;
  /** id obrazu -> obraz z licencja, dla blokow image. Brak w mapie: obraz spoza zasad. */
  images?: ReadonlyMap<string, LicensedImage>;
  /** Dodatek pod blokiem, np. uwagi QA w panelu. */
  renderAfter?: (index: number) => ReactNode;
  variant?: BlockRendererVariant;
}) {
  return (
    <div className="space-y-4">
      {blocks.map((block, index) => (
        <div key={index} className="empty:hidden">
          <Block block={block} factStatements={factStatements} images={images} variant={variant} />
          {renderAfter?.(index)}
        </div>
      ))}
    </div>
  );
}

function Block({
  block,
  factStatements,
  images,
  variant,
}: {
  block: ArticleBlock;
  factStatements: ReadonlyMap<string, string>;
  images: ReadonlyMap<string, LicensedImage>;
  variant: BlockRendererVariant;
}) {
  switch (block.type) {
    case "paragraph":
      return <p className="leading-relaxed">{block.text}</p>;
    case "heading":
      return block.level === 2 ? (
        <h2 className="text-xl font-semibold">{block.text}</h2>
      ) : (
        <h3 className="text-lg font-semibold">{block.text}</h3>
      );
    case "quote":
      return (
        <blockquote className="border-l-4 border-neutral-300 pl-4 italic">
          <p>{block.text}</p>
          {block.attribution ? (
            <footer className="mt-1 text-sm text-neutral-600 not-italic">
              — {block.attribution}
            </footer>
          ) : null}
        </blockquote>
      );
    case "image": {
      const image = images.get(block.imageId);
      if (image) {
        return <ArticleImage image={image} caption={block.caption} />;
      }
      if (variant === "public") {
        return null;
      }
      return (
        <figure className="rounded-md border border-dashed border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <p>Brak obrazu w bibliotece ({block.imageId}). Czytelnik go nie zobaczy.</p>
          {block.caption ? <figcaption className="mt-1">{block.caption}</figcaption> : null}
        </figure>
      );
    }
    case "list": {
      const items = block.items.map((item, index) => <li key={index}>{item}</li>);
      return block.style === "number" ? (
        <ol className="list-decimal space-y-1 pl-6">{items}</ol>
      ) : (
        <ul className="list-disc space-y-1 pl-6">{items}</ul>
      );
    }
    case "fact_box": {
      const items = block.factIds.flatMap((factId, index) => {
        const statement = factStatements.get(factId);
        if (statement !== undefined) {
          return [<li key={index}>{statement}</li>];
        }
        return variant === "public" ? [] : [<li key={index}>{`Brak faktu ${factId}`}</li>];
      });
      if (items.length === 0) {
        return null;
      }
      return (
        <aside className="rounded-md bg-neutral-100 p-4">
          <p className="font-semibold">{block.title ?? "Co wiemy"}</p>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm">{items}</ul>
        </aside>
      );
    }
    default: {
      // Nowy typ bloku w kontrakcie ma wywrocic typecheck, a nie zniknac z podgladu.
      const unhandled: never = block;
      return unhandled;
    }
  }
}
