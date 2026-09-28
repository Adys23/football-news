"use server";

import { refresh } from "next/cache";
import { articleContentSchema, type Json } from "@contracts/index.ts";
import {
  ARTICLE_NOT_FOUND,
  editRuleIssues,
  parseArticleContentEdit,
  parseArticleMetaEdit,
  saveErrorMessage,
  type ArticleEditState,
} from "@/lib/admin/article-edit";
import { checkArticleEdit, getArticleForEdit } from "@/lib/admin/article-edit-data";
import { requireRole } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function saveArticleMeta(
  _prev: ArticleEditState | undefined,
  formData: FormData,
): Promise<ArticleEditState> {
  await requireRole("editor");

  const parsed = parseArticleMetaEdit(formData);
  if (!parsed.ok) {
    return parsed.state;
  }
  const { articleId, expectedUpdatedAt, title, lead } = parsed.data;

  const article = await getArticleForEdit(articleId);
  if (!article) {
    return { status: "error", message: ARTICLE_NOT_FOUND };
  }

  // Tresc wraca bez zmian w postaci z bazy: po parsowaniu zod funkcja uznalaby ja za edycje.
  return saveArticleEdit(articleId, expectedUpdatedAt, article.storyId, {
    title,
    lead,
    content: article.content,
  });
}

export async function saveArticleContent(
  _prev: ArticleEditState | undefined,
  formData: FormData,
): Promise<ArticleEditState> {
  await requireRole("editor");

  const parsed = parseArticleContentEdit(formData);
  if (!parsed.ok) {
    return parsed.state;
  }
  const { articleId, expectedUpdatedAt, content } = parsed.data;

  const article = await getArticleForEdit(articleId);
  if (!article) {
    return { status: "error", message: ARTICLE_NOT_FOUND };
  }
  if (article.lead === null) {
    return { status: "error", message: "Uzupełnij lead, zanim zapiszesz treść." };
  }

  const current = articleContentSchema.safeParse(article.content);
  const ruleIssues = editRuleIssues(current.success ? current.data.blocks : [], content.blocks);
  if (ruleIssues.length > 0) {
    return { status: "error", message: "Zmiany łamią zasady edycji.", issues: ruleIssues };
  }

  return saveArticleEdit(articleId, expectedUpdatedAt, article.storyId, {
    title: article.title,
    lead: article.lead,
    content,
  });
}

async function saveArticleEdit(
  articleId: string,
  expectedUpdatedAt: string,
  storyId: string,
  edit: { title: string; lead: string; content: Json },
): Promise<ArticleEditState> {
  const check = await checkArticleEdit(storyId, edit);
  if (!check.ok) {
    return { status: "error", message: check.message };
  }
  if (check.issues.length > 0) {
    return {
      status: "error",
      message: "Zmiany nie przechodzą kontroli redakcyjnej.",
      issues: check.issues,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("save_article_edit", {
    p_article_id: articleId,
    p_expected_updated_at: expectedUpdatedAt,
    p_title: edit.title,
    p_lead: edit.lead,
    p_content: edit.content,
  });

  if (error) {
    const message = saveErrorMessage(error.code);
    if (!message) {
      throw new Error(`Zapis edycji artykulu ${articleId}: ${error.message}`);
    }
    return { status: "error", message };
  }

  refresh();
  return { status: "saved", message: "Zapisano zmiany." };
}
