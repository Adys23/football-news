"use server";

import { refresh } from "next/cache";
import {
  ARTICLE_NOT_FOUND,
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

  const check = await checkArticleEdit(article, { title, lead });
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
  // Tresc wraca bez zmian w postaci z bazy: po parsowaniu zod funkcja uznalaby ja za edycje.
  const { error } = await supabase.rpc("save_article_edit", {
    p_article_id: articleId,
    p_expected_updated_at: expectedUpdatedAt,
    p_title: title,
    p_lead: lead,
    p_content: article.content,
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
