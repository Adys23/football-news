import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { CACHE_TAGS } from "@/lib/public/cache-tags";

/**
 * Webhook publikacji z bazy (migracja 0022, docs/architecture.md §7).
 * Logika poza route handlerem, zeby dalo sie ja testowac bez Next.js.
 */

export const WEBHOOK_SECRET_HEADER = "x-webhook-secret";

/**
 * Porownanie w stalym czasie. Skroty sha256 maja stala dlugosc, wiec timingSafeEqual
 * nie rzuca przy roznej dlugosci i czas nie zdradza dlugosci sekretu.
 * Brak sekretu po stronie serwera odrzuca kazde zadanie.
 */
export function isWebhookAuthorized(
  received: string | null,
  expected: string | undefined,
): boolean {
  if (!expected || expected.trim().length === 0 || received === null) {
    return false;
  }

  const receivedHash = createHash("sha256").update(received).digest();
  const expectedHash = createHash("sha256").update(expected).digest();

  return timingSafeEqual(receivedHash, expectedHash);
}

// Tag cache ma limit 256 znakow; dluzszy nie jest przypisywany, wiec jego uniewaznienie nic nie robi.
const slugSchema = z.string().trim().min(1).max(200);

/** Kontrakt payloadu z articles_revalidate_webhook() i article_updates_revalidate_webhook(). */
export const revalidatePayloadSchema = z.object({
  event: z.enum(["publish", "unpublish", "update"]),
  slug: slugSchema,
  previous_slug: slugSchema.nullish(),
  category_slug: slugSchema.nullish(),
  previous_category_slug: slugSchema.nullish(),
});

export type RevalidatePayload = z.infer<typeof revalidatePayloadSchema>;

export function revalidationTags(payload: RevalidatePayload): string[] {
  const tags = new Set<string>([CACHE_TAGS.articles, CACHE_TAGS.sitemap]);

  for (const slug of [payload.slug, payload.previous_slug]) {
    if (slug) {
      tags.add(CACHE_TAGS.article(slug));
    }
  }

  for (const slug of [payload.category_slug, payload.previous_category_slug]) {
    if (slug) {
      tags.add(CACHE_TAGS.category(slug));
    }
  }

  return [...tags];
}

/**
 * Cala obsluga zadania: 401 bez poprawnego sekretu, 400 dla zlego payloadu, 200 po
 * uniewaznieniu tagow. Odpowiedzi nie mowia, co bylo nie tak.
 */
export async function handleRevalidateWebhook(
  request: Request,
  secret: string | undefined,
  revalidate: (tag: string) => void,
): Promise<Response> {
  if (!isWebhookAuthorized(request.headers.get(WEBHOOK_SECRET_HEADER), secret)) {
    return Response.json({ revalidated: false }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ revalidated: false }, { status: 400 });
  }

  const parsed = revalidatePayloadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ revalidated: false }, { status: 400 });
  }

  for (const tag of revalidationTags(parsed.data)) {
    revalidate(tag);
  }

  return Response.json({ revalidated: true });
}
