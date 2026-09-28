import { revalidateTag } from "next/cache";
import { handleRevalidateWebhook } from "@/lib/public/revalidate-webhook";

/**
 * Webhook z bazy po publikacji (migracja 0022). Zapisy z panelu ida przez server
 * actions; ten handler przyjmuje tylko zdarzenia z triggera pg_net.
 *
 * `{ expire: 0 }` zamiast profilu "max": wycofany artykul nie moze byc dalej
 * serwowany jako stale, a updateTag nie dziala poza server actions.
 */
export async function POST(request: Request): Promise<Response> {
  return handleRevalidateWebhook(request, process.env.REVALIDATE_WEBHOOK_SECRET, (tag) =>
    revalidateTag(tag, { expire: 0 }),
  );
}
