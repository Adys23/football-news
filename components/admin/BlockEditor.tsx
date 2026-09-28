"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import {
  DRAFT_PARAGRAPHS,
  DRAFT_WORDS,
  measureDraft,
  type ArticleBlock,
} from "@contracts/index.ts";
import { saveArticleContent } from "@/app/admin/artykuly/[id]/actions";
import { EditResult } from "@/components/admin/ArticleMetaForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MAX_QUOTE_WORDS,
  contentSchemaIssues,
  validateArticleContent,
} from "@/lib/admin/article-edit";

type EditableBlock = { key: number; block: ArticleBlock };

const BLOCK_LABELS: Record<ArticleBlock["type"], string> = {
  paragraph: "Akapit",
  heading: "Śródtytuł",
  quote: "Cytat",
  image: "Zdjęcie",
  list: "Lista",
  fact_box: "Ramka z faktami",
};

const NEW_BLOCKS: ArticleBlock[] = [
  { type: "paragraph", text: "" },
  { type: "heading", level: 2, text: "" },
  { type: "quote", text: "" },
  { type: "list", style: "bullet", items: [] },
];

const FIELD_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-lg border bg-transparent px-2.5 py-2 text-base outline-none focus-visible:ring-3 md:text-sm";

/** Stan edytora trzyma surowe wartosci pol; do zapisu idzie wersja przycieta. */
function normalize(block: ArticleBlock): ArticleBlock {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return { ...block, text: block.text.trim() };
    case "quote":
      return {
        type: "quote",
        text: block.text.trim(),
        attribution: block.attribution?.trim() || undefined,
      };
    case "list":
      return { ...block, items: block.items.map((item) => item.trim()).filter(Boolean) };
    case "fact_box":
      return { ...block, title: block.title?.trim() || undefined };
    case "image":
      return block;
  }
}

export function BlockEditor({
  articleId,
  updatedAt,
  blocks: initialBlocks,
  factStatements,
}: {
  articleId: string;
  updatedAt: string;
  blocks: ArticleBlock[];
  factStatements: Record<string, string>;
}) {
  const [state, action, pending] = useActionState(saveArticleContent, undefined);
  const [blocks, setBlocks] = useState<EditableBlock[]>(() =>
    initialBlocks.map((block, key) => ({ key, block })),
  );
  const nextKey = useRef(initialBlocks.length);

  const content = { version: 1, blocks: blocks.map(({ block }) => normalize(block)) };
  const validation = validateArticleContent(content);
  const { paragraphs, words } = measureDraft(content.blocks);

  const update = (key: number, block: ArticleBlock) =>
    setBlocks((current) => current.map((item) => (item.key === key ? { key, block } : item)));
  const remove = (key: number) =>
    setBlocks((current) => current.filter((item) => item.key !== key));
  const move = (index: number, offset: number) =>
    setBlocks((current) => {
      const next = [...current];
      next.splice(index + offset, 0, ...next.splice(index, 1));
      return next;
    });
  const add = (block: ArticleBlock) =>
    setBlocks((current) => [...current, { key: nextKey.current++, block }]);

  return (
    <form action={action} className="mt-4 grid gap-4" noValidate>
      <input type="hidden" name="articleId" value={articleId} />
      <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />
      <input type="hidden" name="content" value={JSON.stringify(content)} />

      <ol className="grid gap-3">
        {blocks.map(({ key, block }, index) => (
          <li key={key} className="rounded-md border border-neutral-200 p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="mr-auto text-xs font-medium text-neutral-500">
                {index + 1}. {BLOCK_LABELS[block.type]}
              </span>
              {[
                { text: "W górę", aria: "wyżej", offset: -1, disabled: index === 0 },
                { text: "W dół", aria: "niżej", offset: 1, disabled: index === blocks.length - 1 },
              ].map((control) => (
                <Button
                  key={control.text}
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={control.disabled}
                  onClick={() => move(index, control.offset)}
                  aria-label={`Przesuń blok ${index + 1} ${control.aria}`}
                >
                  {control.text}
                </Button>
              ))}
              <Button
                type="button"
                variant="destructive"
                size="xs"
                onClick={() => remove(key)}
                aria-label={`Usuń blok ${index + 1}`}
              >
                Usuń
              </Button>
            </div>
            <BlockFields
              block={block}
              label={`Blok ${index + 1}`}
              factStatements={factStatements}
              onChange={(next) => update(key, next)}
            />
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-2">
        {NEW_BLOCKS.map((block) => (
          <Button
            key={block.type}
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => add(block)}
          >
            + {BLOCK_LABELS[block.type]}
          </Button>
        ))}
      </div>

      <p className="text-xs text-neutral-500">
        Akapity: {paragraphs} (wymagane {DRAFT_PARAGRAPHS.min}-{DRAFT_PARAGRAPHS.max}), słowa w
        akapitach: {words} (wymagane {DRAFT_WORDS.min}-{DRAFT_WORDS.max})
      </p>

      {validation.success ? null : (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-medium">Treść nie przechodzi walidacji schematu.</p>
          <ul className="mt-2 list-disc pl-5">
            {contentSchemaIssues(validation.error).map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {state ? <EditResult state={state} /> : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Zapisywanie…" : "Zapisz treść"}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-xs text-neutral-500">
      {label}
      {children}
    </label>
  );
}

function BlockFields({
  block,
  label,
  factStatements,
  onChange,
}: {
  block: ArticleBlock;
  label: string;
  factStatements: Record<string, string>;
  onChange: (block: ArticleBlock) => void;
}) {
  switch (block.type) {
    case "paragraph":
      return (
        <textarea
          aria-label={`${label}: tekst`}
          rows={4}
          value={block.text}
          onChange={(event) => onChange({ ...block, text: event.target.value })}
          className={FIELD_CLASS}
        />
      );
    case "heading":
      return (
        <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
          <select
            aria-label={`${label}: poziom`}
            value={block.level}
            onChange={(event) => onChange({ ...block, level: event.target.value === "3" ? 3 : 2 })}
            className={FIELD_CLASS}
          >
            <option value="2">H2</option>
            <option value="3">H3</option>
          </select>
          <Input
            aria-label={`${label}: tekst`}
            value={block.text}
            onChange={(event) => onChange({ ...block, text: event.target.value })}
          />
        </div>
      );
    case "quote":
      return (
        <div className="grid gap-2">
          <Field label={`Cytat, najwyżej ${MAX_QUOTE_WORDS} słów`}>
            <textarea
              rows={3}
              value={block.text}
              onChange={(event) => onChange({ ...block, text: event.target.value })}
              className={FIELD_CLASS}
            />
          </Field>
          <Field label="Autor cytatu (wymagany)">
            <Input
              value={block.attribution ?? ""}
              onChange={(event) => onChange({ ...block, attribution: event.target.value })}
            />
          </Field>
        </div>
      );
    case "list":
      return (
        <div className="grid gap-2">
          <select
            aria-label={`${label}: styl`}
            value={block.style}
            onChange={(event) =>
              onChange({ ...block, style: event.target.value === "number" ? "number" : "bullet" })
            }
            className={`${FIELD_CLASS} sm:w-auto`}
          >
            <option value="bullet">Punkty</option>
            <option value="number">Numerowana</option>
          </select>
          <Field label="Pozycje, jedna w wierszu (co najmniej dwie)">
            <textarea
              rows={4}
              value={block.items.join("\n")}
              onChange={(event) => onChange({ ...block, items: event.target.value.split("\n") })}
              className={FIELD_CLASS}
            />
          </Field>
        </div>
      );
    case "fact_box":
      return (
        <div className="grid gap-2">
          <Field label="Tytuł ramki (domyślnie „Co wiemy”)">
            <Input
              value={block.title ?? ""}
              onChange={(event) => onChange({ ...block, title: event.target.value })}
            />
          </Field>
          <ul className="list-disc pl-5 text-sm">
            {block.factIds.map((factId, index) => (
              <li key={index}>{factStatements[factId] ?? `Brak faktu ${factId}`}</li>
            ))}
          </ul>
        </div>
      );
    case "image":
      return (
        <p className="text-sm text-neutral-600">
          Zdjęcie {block.imageId}
          {block.caption ? ` · ${block.caption}` : ""}. Zdjęcie można tylko zachować albo usunąć.
        </p>
      );
  }
}
