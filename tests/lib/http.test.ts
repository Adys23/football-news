import { describe, expect, it, vi } from "vitest";
import { FeedFetchError, fetchFeed } from "@shared/lib/http.ts";

describe("fetchFeed", () => {
  it("zwraca not_modified przy 304", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    await expect(
      fetchFeed("https://example.test/rss", { etag: '"abc"' }, fetchImpl),
    ).resolves.toEqual({ kind: "not_modified" });
  });

  it("zwraca cialo i etag przy 200", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response("<rss />", { status: 200, headers: { etag: '"x"', "last-modified": "Wed" } }),
      );

    await expect(fetchFeed("https://example.test/rss", {}, fetchImpl)).resolves.toMatchObject({
      kind: "ok",
      body: "<rss />",
      etag: '"x"',
    });
  });

  it("oddaje http_error przy 4xx", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("no", { status: 404, statusText: "Not Found" }));
    await expect(fetchFeed("https://example.test/rss", {}, fetchImpl)).resolves.toMatchObject({
      kind: "http_error",
      status: 404,
    });
  });

  it("ponawia 5xx i na koncu rzuca", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("timeout"));
    await expect(fetchFeed("https://example.test/rss", {}, fetchImpl)).rejects.toBeInstanceOf(
      FeedFetchError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
