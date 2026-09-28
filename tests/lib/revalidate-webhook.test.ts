import { describe, expect, it, vi } from "vitest";
import {
  handleRevalidateWebhook,
  isWebhookAuthorized,
  revalidatePayloadSchema,
  revalidationTags,
  WEBHOOK_SECRET_HEADER,
} from "@/lib/public/revalidate-webhook";

const SECRET = "sekret-webhooka-testowy";

function webhookRequest(body: string, secret: string | null = SECRET): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (secret !== null) {
    headers.set(WEBHOOK_SECRET_HEADER, secret);
  }
  return new Request("http://localhost/api/revalidate", { method: "POST", headers, body });
}

const publishPayload = {
  event: "publish",
  slug: "bruno-fernandes-kontrakt",
  previous_slug: null,
  category_slug: "transfery",
  previous_category_slug: null,
};

describe("isWebhookAuthorized", () => {
  it("przepuszcza identyczny sekret", () => {
    expect(isWebhookAuthorized(SECRET, SECRET)).toBe(true);
  });

  it("odrzuca inny sekret, takze inny tylko dlugoscia", () => {
    expect(isWebhookAuthorized("zly", SECRET)).toBe(false);
    expect(isWebhookAuthorized(`${SECRET}x`, SECRET)).toBe(false);
    expect(isWebhookAuthorized("", SECRET)).toBe(false);
  });

  it("odrzuca brak naglowka", () => {
    expect(isWebhookAuthorized(null, SECRET)).toBe(false);
  });

  it("bez skonfigurowanego sekretu odrzuca wszystko", () => {
    expect(isWebhookAuthorized("", undefined)).toBe(false);
    expect(isWebhookAuthorized("", "")).toBe(false);
    expect(isWebhookAuthorized("   ", "   ")).toBe(false);
  });
});

describe("revalidatePayloadSchema", () => {
  it("przyjmuje payload z triggera", () => {
    expect(revalidatePayloadSchema.safeParse(publishPayload).success).toBe(true);
  });

  it("przyjmuje payload bez pol opcjonalnych", () => {
    expect(revalidatePayloadSchema.safeParse({ event: "update", slug: "a" }).success).toBe(true);
  });

  it("odrzuca brak sluga, pusty slug, nieznane zdarzenie i za dlugi slug", () => {
    expect(revalidatePayloadSchema.safeParse({ event: "publish" }).success).toBe(false);
    expect(revalidatePayloadSchema.safeParse({ event: "publish", slug: "  " }).success).toBe(false);
    expect(revalidatePayloadSchema.safeParse({ event: "delete", slug: "a" }).success).toBe(false);
    expect(
      revalidatePayloadSchema.safeParse({ event: "update", slug: "a".repeat(201) }).success,
    ).toBe(false);
  });
});

describe("revalidationTags", () => {
  it("publikacja: lista, sitemapa, artykul i kategoria", () => {
    expect(revalidationTags(revalidatePayloadSchema.parse(publishPayload))).toEqual([
      "articles",
      "sitemap",
      "article:bruno-fernandes-kontrakt",
      "category:transfery",
    ]);
  });

  it("zmiana sluga i kategorii uniewaznia stare i nowe tagi", () => {
    expect(
      revalidationTags({
        event: "update",
        slug: "nowy-slug",
        previous_slug: "stary-slug",
        category_slug: "ekstraklasa",
        previous_category_slug: "transfery",
      }),
    ).toEqual([
      "articles",
      "sitemap",
      "article:nowy-slug",
      "article:stary-slug",
      "category:ekstraklasa",
      "category:transfery",
    ]);
  });

  it("artykul bez kategorii i powtorzony slug bez duplikatow", () => {
    expect(revalidationTags({ event: "unpublish", slug: "tekst", previous_slug: "tekst" })).toEqual(
      ["articles", "sitemap", "article:tekst"],
    );
  });
});

describe("handleRevalidateWebhook", () => {
  it("401 bez poprawnego sekretu i bez uniewazniania", async () => {
    const revalidate = vi.fn();

    for (const request of [
      webhookRequest(JSON.stringify(publishPayload), null),
      webhookRequest(JSON.stringify(publishPayload), "zly"),
    ]) {
      const response = await handleRevalidateWebhook(request, SECRET, revalidate);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ revalidated: false });
    }

    const unconfigured = await handleRevalidateWebhook(
      webhookRequest(JSON.stringify(publishPayload)),
      undefined,
      revalidate,
    );
    expect(unconfigured.status).toBe(401);
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("400 dla niepoprawnego JSON i zlego payloadu, bez szczegolow", async () => {
    const revalidate = vi.fn();

    for (const body of ["{", JSON.stringify({ event: "publish" })]) {
      const response = await handleRevalidateWebhook(webhookRequest(body), SECRET, revalidate);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ revalidated: false });
    }

    expect(revalidate).not.toHaveBeenCalled();
  });

  it("200 i uniewaznienie kazdego tagu", async () => {
    const revalidate = vi.fn();

    const response = await handleRevalidateWebhook(
      webhookRequest(JSON.stringify(publishPayload)),
      SECRET,
      revalidate,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: true });
    expect(revalidate.mock.calls.map(([tag]) => tag)).toEqual([
      "articles",
      "sitemap",
      "article:bruno-fernandes-kontrakt",
      "category:transfery",
    ]);
  });
});
