import "server-only";

import { articleContentSchema, type Json } from "@contracts/index.ts";
import { loadArticleContext } from "@shared/lib/article-context.ts";
import { articleCheckIssues } from "@shared/lib/article-checks.ts";
import { loadApprovedFacts } from "@shared/lib/story-facts.ts";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ArticleForEdit {
  storyId: string;
  title: string;
  lead: string | null;
  content: Json;
  heroImageId: string | null;
}

export async function getArticleForEdit(id: string): Promise<ArticleForEdit | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("articles")
    .select("story_id, title, lead, content, hero_image_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Nie udalo sie odczytac artykulu do edycji: ${error.message}`);
  }
  return data
    ? {
        storyId: data.story_id,
        title: data.title,
        lead: data.lead,
        content: data.content,
        heroImageId: data.hero_image_id,
      }
    : null;
}

export type EditCheckResult = { ok: true; issues: string[] } | { ok: false; message: string };

/**
 * Te same kontrole deterministyczne i te same dane wejsciowe co w CHECK_ARTICLE:
 * zatwierdzone fakty, teksty materialow i encje rozpoznane w faktach.
 * Loadery pipeline'u dzialaja tu na sesji redaktora, wiec obowiazuje RLS.
 */
export async function checkArticleEdit(
  storyId: string,
  edit: { title: string; lead: string; content: Json },
): Promise<EditCheckResult> {
  const content = articleContentSchema.safeParse(edit.content);
  if (!content.success) {
    return { ok: false, message: "Treść artykułu nie przechodzi walidacji schematu." };
  }

  const ctx = { client: await createSupabaseServerClient() };
  const approved = await loadApprovedFacts(ctx, storyId);
  if (!approved) {
    return {
      ok: false,
      message: "Ocena faktów tej historii jest nieaktualna. Poczekaj na ponowną walidację.",
    };
  }

  const { entityLabels } = await loadArticleContext(
    ctx,
    approved.facts.map((fact) => fact.statement_pl).join(" "),
  );

  return {
    ok: true,
    issues: articleCheckIssues({
      title: edit.title,
      lead: edit.lead,
      blocks: content.data.blocks,
      approvedFactIds: approved.facts.map((fact) => fact.id),
      sourceTexts: approved.sources.flatMap((source) => [source.title, source.content ?? ""]),
      knownEntities: entityLabels,
    }),
  };
}
