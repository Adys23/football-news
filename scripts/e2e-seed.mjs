#!/usr/bin/env node
/**
 * Dane dla testow e2e: jedna historia i jeden opublikowany artykul w kategorii
 * z seeda. Stale identyfikatory i upsert, wiec kolejne uruchomienie nie dubluje
 * danych. Akceptacja przez redaktora z supabase/seed.sql - trigger publikacji
 * wymaga approved_by tak samo jak na produkcji. Slug i tytul musza zgadzac sie
 * z e2e/smoke.spec.ts.
 */
import { createLocalServiceClient } from "./lib/local-supabase.mjs";
import { fail, step } from "./lib/run.mjs";

const E2E_ARTICLE = {
  id: "77777777-7777-4777-8777-777777777771",
  storyId: "77777777-7777-4777-8777-777777777770",
  slug: "e2e-lech-poznan-przedluzyl-kontrakt-z-trenerem",
  categorySlug: "ekstraklasa",
  title: "Lech Poznań przedłużył kontrakt z trenerem do 2028 roku",
};

const EDITOR_ID = "11111111-1111-4111-8111-111111111112";
const AUTHOR_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORY_ID = "33333333-3333-4333-8333-333333333333";

const client = createLocalServiceClient();

step("Historia dla e2e");
const story = await client.from("stories").upsert({
  id: E2E_ARTICLE.storyId,
  title: E2E_ARTICLE.title,
  category_id: CATEGORY_ID,
  status: "published",
});
if (story.error) {
  fail(`Zapis historii: ${story.error.message}`);
}

step("Opublikowany artykul dla e2e");
const article = await client.from("articles").upsert({
  id: E2E_ARTICLE.id,
  story_id: E2E_ARTICLE.storyId,
  slug: E2E_ARTICLE.slug,
  title: E2E_ARTICLE.title,
  lead: "Klub potwierdził nową umowę trenera w komunikacie na swojej stronie.",
  category_id: CATEGORY_ID,
  author_id: AUTHOR_ID,
  ai_generated: true,
  content: {
    version: 1,
    blocks: [
      { type: "paragraph", text: "Lech Poznań ogłosił przedłużenie kontraktu z trenerem." },
      { type: "heading", level: 2, text: "Szczegóły umowy" },
      { type: "list", style: "bullet", items: ["Umowa do czerwca 2028", "Opcja przedłużenia"] },
      { type: "quote", text: "Chcemy budować zespół na lata.", attribution: "Prezes klubu" },
    ],
  },
  seo_title: "Lech Poznań przedłużył kontrakt z trenerem",
  seo_description:
    "Lech Poznań przedłużył kontrakt z trenerem do czerwca 2028 roku. Klub potwierdził nową umowę w komunikacie opublikowanym na swojej stronie.",
  status: "published",
  approved_by: EDITOR_ID,
  // Swieza data przy kazdym uruchomieniu: sitemap-news.xml pokazuje tylko ostatnie 48 godzin.
  published_at: new Date().toISOString(),
});
if (article.error) {
  fail(`Zapis artykulu: ${article.error.message}`);
}

console.log(`OK: /${E2E_ARTICLE.categorySlug}/${E2E_ARTICLE.slug}`);
