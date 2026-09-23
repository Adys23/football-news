/**
 * Pobieranie feedu z timeoutem, cache HTTP i ograniczona liczba prob.
 * Testy podaja wlasne `fetchImpl`, zeby nie chodzic do sieci.
 */

export const FETCH_TIMEOUT_MS = 10_000;
export const FETCH_MAX_ATTEMPTS = 3;
export const INGESTION_USER_AGENT = "football-news-ingestion/0.1";

export type FetchFn = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type ConditionalHeaders = {
  etag?: string | null;
  lastModified?: string | null;
};

export type FeedResponse =
  | { kind: "not_modified" }
  | { kind: "ok"; body: string; etag: string | null; lastModified: string | null }
  | { kind: "http_error"; status: number; statusText: string };

export class FeedFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedFetchError";
  }
}

export async function fetchFeed(
  url: string,
  headers: ConditionalHeaders,
  fetchImpl: FetchFn = fetch,
): Promise<FeedResponse> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= FETCH_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers: {
          "user-agent": INGESTION_USER_AGENT,
          accept:
            "application/rss+xml, application/atom+xml, application/json, application/xml, text/xml",
          ...(headers.etag ? { "if-none-match": headers.etag } : {}),
          ...(headers.lastModified ? { "if-modified-since": headers.lastModified } : {}),
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (response.status === 304) {
        return { kind: "not_modified" };
      }

      if (!response.ok) {
        if (attempt < FETCH_MAX_ATTEMPTS && response.status >= 500) {
          lastError = new FeedFetchError(`HTTP ${response.status} ${response.statusText}`);
          continue;
        }

        return {
          kind: "http_error",
          status: response.status,
          statusText: response.statusText,
        };
      }

      return {
        kind: "ok",
        body: await response.text(),
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
      };
    } catch (error) {
      lastError = error;
      if (attempt === FETCH_MAX_ATTEMPTS) {
        break;
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : "nieznany blad sieci";
  throw new FeedFetchError(
    `Nie udalo sie pobrac feedu po ${FETCH_MAX_ATTEMPTS} probach: ${message}`,
  );
}
