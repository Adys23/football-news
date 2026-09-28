"use server";

import { refresh, revalidatePath } from "next/cache";
import { articleContentSchema, type Json } from "@contracts/index.ts";
import {
  ARTICLE_NOT_FOUND,
  editRuleIssues,
  parseArticleContentEdit,
  parseArticleMetaEdit,
  saveErrorMessage,
  scoresAreStale,
  type ArticleEditState,
} from "@/lib/admin/article-edit";
import { checkArticleEdit, getArticleForEdit } from "@/lib/admin/article-edit-data";
import {
  decisionErrorMessage,
  parsePublishInput,
  parseRejectInput,
  publishBlockers,
  STALE_SCORE_CONFIRMATION_MESSAGE,
  type DecisionState,
} from "@/lib/admin/publish";
import { getArticleForReview } from "@/lib/admin/review-data";
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

const INCOMPLETE_FORM: DecisionState = { status: "error", message: "Formularz jest niekompletny." };

export async function publishArticle(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  await requireRole("editor");

  const parsed = parsePublishInput(formData);
  if (!parsed.success) {
    return INCOMPLETE_FORM;
  }
  const { articleId, expectedUpdatedAt, confirmStaleScore } = parsed.data;

  const article = await getArticleForReview(articleId);
  if (!article) {
    return { status: "error", message: ARTICLE_NOT_FOUND };
  }
  const blockers = publishBlockers({
    ...article,
    unsupportedClaims: article.scores?.unsupportedClaims ?? null,
  });
  if (blockers.length > 0) {
    return { status: "error", message: "Artykuł nie jest gotowy do publikacji.", issues: blockers };
  }

  if (
    article.scores &&
    scoresAreStale(article.scores.checkedAt, article.lastEditedAt) &&
    !confirmStaleScore
  ) {
    return { status: "error", message: STALE_SCORE_CONFIRMATION_MESSAGE };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("publish_article", {
    p_article_id: articleId,
    p_expected_updated_at: expectedUpdatedAt,
    p_confirm_stale_score: confirmStaleScore,
  });
  return finishDecision(articleId, "Publikacja", error);
}

export async function rejectArticle(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  await requireRole("editor");

  const parsed = parseRejectInput(formData);
  if (!parsed.success) {
    const reasonError = parsed.error.issues.find((issue) => issue.path[0] === "reason");
    return reasonError ? { status: "error", message: reasonError.message } : INCOMPLETE_FORM;
  }
  const { articleId, expectedUpdatedAt, reason } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("reject_article", {
    p_article_id: articleId,
    p_expected_updated_at: expectedUpdatedAt,
    ...(reason ? { p_reason: reason } : {}),
  });
  return finishDecision(articleId, "Odrzucenie", error);
}

/** Publiczny cache uniewaznia webhook publikacji, tu tylko widoki panelu. */
function finishDecision(
  articleId: string,
  action: string,
  error: { code?: string; message: string } | null,
): DecisionState {
  if (error) {
    const message = decisionErrorMessage(error.code);
    if (!message) {
      throw new Error(`${action} artykulu ${articleId}: ${error.message}`);
    }
    return { status: "error", message };
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/artykuly/${articleId}`);
  return undefined;
}
