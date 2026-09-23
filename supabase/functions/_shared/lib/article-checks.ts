import type { ArticleBlock } from "../contracts/article.ts";
import { contentIssues } from "../contracts/article.ts";
import { copiedFragments } from "./copy-detect.ts";
import { checkTitle } from "./title-guard.ts";

export type ArticleCheckInput = {
  title: string;
  lead: string | null;
  blocks: ArticleBlock[];
  approvedFactIds: string[];
  /** Tytuly i tresci materialow historii - wzorzec do wykrycia kopiowania. */
  sourceTexts: string[];
  /** Nazwy i aliasy encji historii do kontroli tytulu. */
  knownEntities: string[];
};

/**
 * Deterministyczna czesc kontroli jakosci. Tansza i pewniejsza od modelu:
 * kazde trafienie blokuje artykul niezaleznie od ocen modelu.
 */
export function articleCheckIssues(input: ArticleCheckInput): string[] {
  const titleIssues = checkTitle(input.title, { knownEntities: input.knownEntities }).issues.map(
    (issue) => `Tytul: ${issue.message}`,
  );

  // Cytat z atrybucja jest dozwolonym wyjatkiem od zakazu kopiowania (AGENTS.md, zasada 10).
  const ownText = [
    input.lead ?? "",
    ...input.blocks.flatMap((block) => {
      if (block.type === "paragraph" || block.type === "heading") {
        return [block.text];
      }
      return block.type === "list" ? block.items : [];
    }),
  ].join("\n");
  const copied = copiedFragments(ownText, input.sourceTexts).map(
    (fragment) => `Fragment skopiowany ze zrodla: "${fragment}".`,
  );

  return [...contentIssues(input.blocks, input.approvedFactIds), ...titleIssues, ...copied];
}
