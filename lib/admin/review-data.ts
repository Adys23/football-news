import "server-only";

import type { Enums, Json } from "@contracts/index.ts";
import type { FactRow } from "@shared/lib/facts.ts";
import { z } from "zod";
import type { ReviewSource } from "@/lib/admin/review";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ReviewScores {
  factualAccuracy: number | null;
  originality: number | null;
  seo: number | null;
  clickbait: number | null;
  quality: number | null;
  unsupportedClaims: number;
  issues: Json;
  modelUsed: string | null;
  promptVersion: string | null;
  checkedAt: string;
}

export interface ReviewAssessment {
  publishability: Enums<"publishability">;
  confidence: number;
  conflicts: Json;
  approvedFactIds: string[];
  reasoning: string | null;
  modelUsed: string | null;
  promptVersion: string | null;
  updatedAt: string;
}

export interface ArticleForReview {
  id: string;
  title: string;
  lead: string | null;
  content: Json;
  slug: string;
  seoTitle: string | null;
  seoDescription: string | null;
  categoryId: string | null;
  status: Enums<"article_status">;
  publishedAt: string | null;
  modelUsed: string | null;
  promptVersion: string | null;
  createdAt: string;
  updatedAt: string;
  /** Ostatnia edycja redaktora; rewizje modelu (edited_by null) sie nie licza. */
  lastEditedAt: string | null;
  story: {
    id: string;
    title: string;
    importance: number;
    eventType: string;
    status: Enums<"story_status">;
  };
  scores: ReviewScores | null;
  assessment: ReviewAssessment | null;
  facts: FactRow[];
  sources: ReviewSource[];
}

function readFailed(what: string, message: string): Error {
  return new Error(`Nie udalo sie odczytac ${what}: ${message}`);
}

/** null, gdy id nie jest uuid albo artykulu nie ma (lub RLS go nie pokazuje). */
export async function getArticleForReview(id: string): Promise<ArticleForReview | null> {
  if (!z.uuid().safeParse(id).success) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data: article, error } = await supabase
    .from("articles")
    .select(
      "id, title, lead, content, slug, seo_title, seo_description, category_id, status, published_at, model_used, prompt_version, created_at, updated_at, article_scores(factual_accuracy, originality, seo, clickbait, quality, unsupported_claims, issues, model_used, prompt_version, checked_at), stories!inner(id, title, importance, event_type, status, story_assessments(publishability, confidence, conflicts, approved_fact_ids, reasoning, model_used, prompt_version, updated_at))",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw readFailed("artykulu", error.message);
  }
  if (!article) {
    return null;
  }

  const story = article.stories;
  const [facts, sources, lastEdit] = await Promise.all([
    supabase
      .from("facts")
      .select("id, subject, predicate, object, statement_pl, confidence, source_id")
      .eq("story_id", story.id)
      .is("superseded_by", null),
    supabase
      .from("story_sources")
      .select(
        "created_at, source_items(id, source_id, url, title, published_at, sources(name, type, trust_score, language))",
      )
      .eq("story_id", story.id),
    supabase
      .from("article_revisions")
      .select("created_at")
      .eq("article_id", article.id)
      .not("edited_by", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (facts.error) {
    throw readFailed("faktow historii", facts.error.message);
  }
  if (sources.error) {
    throw readFailed("zrodel historii", sources.error.message);
  }
  if (lastEdit.error) {
    throw readFailed("rewizji artykulu", lastEdit.error.message);
  }

  const scores = article.article_scores;
  const assessment = story.story_assessments;

  return {
    id: article.id,
    title: article.title,
    lead: article.lead,
    content: article.content,
    slug: article.slug,
    seoTitle: article.seo_title,
    seoDescription: article.seo_description,
    categoryId: article.category_id,
    status: article.status,
    publishedAt: article.published_at,
    modelUsed: article.model_used,
    promptVersion: article.prompt_version,
    createdAt: article.created_at,
    updatedAt: article.updated_at,
    lastEditedAt: lastEdit.data?.created_at ?? null,
    story: {
      id: story.id,
      title: story.title,
      importance: story.importance,
      eventType: story.event_type,
      status: story.status,
    },
    scores: scores
      ? {
          factualAccuracy: scores.factual_accuracy,
          originality: scores.originality,
          seo: scores.seo,
          clickbait: scores.clickbait,
          quality: scores.quality,
          unsupportedClaims: scores.unsupported_claims,
          issues: scores.issues,
          modelUsed: scores.model_used,
          promptVersion: scores.prompt_version,
          checkedAt: scores.checked_at,
        }
      : null,
    assessment: assessment
      ? {
          publishability: assessment.publishability,
          confidence: Number(assessment.confidence),
          conflicts: assessment.conflicts,
          approvedFactIds: assessment.approved_fact_ids,
          reasoning: assessment.reasoning,
          modelUsed: assessment.model_used,
          promptVersion: assessment.prompt_version,
          updatedAt: assessment.updated_at,
        }
      : null,
    facts: facts.data.map((row) => ({ ...row, confidence: Number(row.confidence) })),
    sources: sources.data.flatMap(({ created_at, source_items: item }) =>
      item?.sources
        ? [
            {
              sourceItemId: item.id,
              sourceId: item.source_id,
              sourceName: item.sources.name,
              sourceType: item.sources.type,
              trustScore: Number(item.sources.trust_score),
              language: item.sources.language,
              url: item.url,
              title: item.title,
              publishedAt: item.published_at,
              linkedAt: created_at,
            },
          ]
        : [],
    ),
  };
}
