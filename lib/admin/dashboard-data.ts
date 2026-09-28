import "server-only";

import type { Enums } from "@contracts/index.ts";
import {
  ACTIVE_STORY_STATUSES,
  NEW_STORIES_WINDOW_HOURS,
  REVIEW_QUEUE_LIMIT,
  URGENT_IMPORTANCE,
  URGENT_LIMIT,
  URGENT_WINDOW_HOURS,
  countConflicts,
  hoursAgo,
  sortReviewQueue,
  startOfDayInZone,
  type ReviewQueueItem,
} from "@/lib/admin/dashboard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface DashboardCounts {
  newStories: number;
  inReview: number;
  publishedToday: number;
}

export interface UrgentStory {
  id: string;
  title: string;
  status: Enums<"story_status">;
  importance: number;
  eventType: string;
  lastUpdatedAt: string;
}

function readFailed(what: string, message: string): Error {
  return new Error(`Nie udalo sie odczytac ${what}: ${message}`);
}

export async function getDashboardCounts(now: Date): Promise<DashboardCounts> {
  const supabase = await createSupabaseServerClient();
  const articles = () => supabase.from("articles").select("id", { count: "exact", head: true });

  const [newStories, inReview, publishedToday] = await Promise.all([
    supabase
      .from("stories")
      .select("id", { count: "exact", head: true })
      .gte("first_seen_at", hoursAgo(now, NEW_STORIES_WINDOW_HOURS).toISOString()),
    articles().eq("status", "review"),
    articles().eq("status", "published").gte("published_at", startOfDayInZone(now).toISOString()),
  ]);

  for (const result of [newStories, inReview, publishedToday]) {
    if (result.error) {
      throw readFailed("licznikow panelu", result.error.message);
    }
  }

  return {
    newStories: newStories.count ?? 0,
    inReview: inReview.count ?? 0,
    publishedToday: publishedToday.count ?? 0,
  };
}

export async function getReviewQueue(): Promise<ReviewQueueItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("articles")
    .select(
      "id, title, created_at, article_scores(quality, clickbait, unsupported_claims), stories!inner(importance, event_type, story_assessments(confidence, publishability, conflicts))",
    )
    .eq("status", "review")
    .order("stories(importance)", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(REVIEW_QUEUE_LIMIT);

  if (error) {
    throw readFailed("kolejki do weryfikacji", error.message);
  }

  return sortReviewQueue(
    data.map((article) => {
      const story = article.stories;
      const assessment = story.story_assessments;
      const scores = article.article_scores;
      return {
        articleId: article.id,
        title: article.title,
        createdAt: article.created_at,
        eventType: story.event_type,
        importance: story.importance,
        confidence: assessment?.confidence ?? null,
        publishability: assessment?.publishability ?? null,
        conflicts: countConflicts(assessment?.conflicts),
        quality: scores?.quality ?? null,
        clickbait: scores?.clickbait ?? null,
        unsupportedClaims: scores?.unsupported_claims ?? null,
      };
    }),
  );
}

export async function getUrgentStories(now: Date): Promise<UrgentStory[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("stories")
    .select("id, title, status, importance, event_type, last_updated_at")
    .gte("importance", URGENT_IMPORTANCE)
    .in("status", ACTIVE_STORY_STATUSES)
    .gte("last_updated_at", hoursAgo(now, URGENT_WINDOW_HOURS).toISOString())
    .order("importance", { ascending: false })
    .order("last_updated_at", { ascending: false })
    .limit(URGENT_LIMIT);

  if (error) {
    throw readFailed("pilnych historii", error.message);
  }

  return data.map((story) => ({
    id: story.id,
    title: story.title,
    status: story.status,
    importance: story.importance,
    eventType: story.event_type,
    lastUpdatedAt: story.last_updated_at,
  }));
}
