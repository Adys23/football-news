import type { ReactNode } from "react";
import type { ArticleBlock } from "@contracts/index.ts";

/**
 * "review" (panel) pokazuje wszystko, takze braki: fakt bez tresci i miejsce na zdjecie.
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
  renderAfter,
  variant = "review",
}: {
  blocks: readonly ArticleBlock[];
  /** id faktu -> zdanie, dla blokow fact_box. */
  factStatements: ReadonlyMap<string, string>;
  /** Dodatek pod blokiem, np. uwagi QA w panelu. */
  renderAfter?: (index: number) => ReactNode;
  variant?: BlockRendererVariant;
}) {
  return (
    <div className="space-y-4">
      {blocks.map((block, index) => (
        <div key={index} className="empty:hidden">
          <Block block={block} factStatements={factStatements} variant={variant} />
          {renderAfter?.(index)}
        </div>
      ))}
    </div>
  );
}

function Block({
  block,
  factStatements,
  variant,
}: {
  block: ArticleBlock;
  factStatements: ReadonlyMap<string, string>;
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
    case "image":
      // Obrazy z image_assets wejda w etapie 4; do tego czasu tylko miejsce i podpis.
      if (variant === "public") {
        return null;
      }
      return (
        <figure className="rounded-md border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">
          <p>Zdjęcie ({block.imageId})</p>
          {block.caption ? <figcaption className="mt-1">{block.caption}</figcaption> : null}
        </figure>
      );
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
