import { normalizeTitle } from "./hash.ts";

/** Dlugosc wspolnego fragmentu, od ktorej uznajemy tekst za skopiowany (docs/ai-pipeline.md, sekcja 7). */
export const COPY_NGRAM_WORDS = 8;

function ngrams(text: string, size: number): Set<string> {
  const words = normalizeTitle(text).split(" ").filter(Boolean);
  const result = new Set<string>();
  for (let i = 0; i + size <= words.length; i += 1) {
    result.add(words.slice(i, i + size).join(" "));
  }
  return result;
}

/**
 * Fragmenty artykulu wspolne ze zrodlami, po normalizacji (male litery, bez
 * diakrytykow i interpunkcji). Model piszacy nie widzi zrodel, wiec trafienie
 * oznacza zwykle fakt przepisany ze zrodla slowo w slowo.
 */
export function copiedFragments(
  articleText: string,
  sourceTexts: string[],
  size = COPY_NGRAM_WORDS,
): string[] {
  const article = ngrams(articleText, size);
  const found = new Set<string>();
  for (const source of sourceTexts) {
    for (const gram of ngrams(source, size)) {
      if (article.has(gram)) {
        found.add(gram);
      }
    }
  }
  return [...found];
}
