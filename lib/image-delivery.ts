/**
 * Jak next/image dostarcza zdjecia artykulow. Optymalizator Next.js przyjmuje tylko adresy
 * z images.remotePatterns i domyslnie odrzuca adresy lokalne (dangerouslyAllowLocalIP),
 * a lokalny Supabase to http://127.0.0.1:54321. Zamiast luzowac te ochrone, obraz z adresu
 * lokalnego albo spoza bucketu article-images idzie bez optymalizacji (unoptimized).
 * Plik bez importow aliasow: czyta go takze next.config.ts.
 */

export const ARTICLE_IMAGES_PATH = "/storage/v1/object/public/article-images/";

export interface ImageRemotePattern {
  protocol: "http" | "https";
  hostname: string;
  port: string;
  pathname: string;
  search: string;
}

function parseUrl(value: string | undefined): URL | null {
  if (!value) {
    return null;
  }
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const PRIVATE_IPV4 = [
  /^127\./, // loopback
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./, // link-local
  /^0\.0\.0\.0$/,
];

/**
 * Adresy, ktore optymalizator odrzuca bez dangerouslyAllowLocalIP: localhost, *.localhost,
 * loopback i sieci prywatne IPv4 oraz ::1, fc00::/7 i fe80::/10. Nazwa hosta rozwiazywana
 * dopiero przez DNS (np. usluga Dockera) nie jest tu rozpoznawana. Adres wzgledny: false.
 */
export function isLocalImageUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    return true;
  }
  if (host.startsWith("[")) {
    return host === "[::1]" || /^\[f[cd]/.test(host) || /^\[fe[89ab]/.test(host);
  }
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) && PRIVATE_IPV4.some((range) => range.test(host));
}

/** Wzorzec dla bucketu article-images projektu Supabase; brak lub zly adres daje pusta liste. */
export function articleImagePatterns(supabaseUrl: string | undefined): ImageRemotePattern[] {
  const parsed = parseUrl(supabaseUrl);
  if (!parsed || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) {
    return [];
  }
  return [
    {
      protocol: parsed.protocol === "https:" ? "https" : "http",
      hostname: parsed.hostname,
      port: parsed.port,
      pathname: `${ARTICLE_IMAGES_PATH}**`,
      search: "",
    },
  ];
}

/** true tylko dla adresu z bucketu article-images tego projektu, ktory nie jest lokalny. */
export function shouldOptimizeImage(url: string, supabaseUrl: string | undefined): boolean {
  const image = parseUrl(url);
  const project = parseUrl(supabaseUrl);
  if (!image || !project || isLocalImageUrl(url)) {
    return false;
  }
  return (
    image.origin === project.origin &&
    image.pathname.startsWith(ARTICLE_IMAGES_PATH) &&
    image.search === ""
  );
}
