import { existsSync, readdirSync } from "node:fs";
import { join, posix } from "node:path";

/** Budzety z docs/architecture.md §8.2 i docs/roadmap.md (etap 4). */
export const PERF_BUDGETS = Object.freeze({ lcpMs: 2000, cls: 0.1 });

/**
 * Profil mobile jak w Lighthouse (Moto G Power, "Slow 4G"). Lighthouse domyslnie
 * symuluje siec; przy throttlingu w DevTools uzywa tych samych wartosci pomnozonych
 * przez swoje wspolczynniki (RTT x3,75, przepustowosc x0,9) i te wartosci stosujemy.
 */
export const MOBILE_PROFILE = Object.freeze({
  viewport: { width: 412, height: 823, deviceScaleFactor: 1.75, mobile: true },
  userAgent:
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  cpuSlowdown: 4,
  network: {
    latencyMs: 562.5,
    downloadKbps: 1474.56,
    uploadKbps: 607.5,
  },
});

/** Wartosc przepustowosci w bajtach na sekunde, jak oczekuje Network.emulateNetworkConditions. */
export function kbpsToBytesPerSecond(kbps) {
  return (kbps * 1024) / 8;
}

/**
 * CLS wedlug definicji web-vitals: najwieksze okno sesji przesuniec (przerwa miedzy
 * przesunieciami ponizej 1 s, okno najwyzej 5 s), bez przesuniec tuz po interakcji.
 */
export function computeCls(shifts) {
  let max = 0;
  let windowValue = 0;
  let windowStart = 0;
  let previous = 0;

  const ordered = shifts
    .filter((shift) => !shift.hadRecentInput)
    .toSorted((a, b) => a.startTime - b.startTime);

  for (const shift of ordered) {
    const continuesWindow =
      windowValue > 0 && shift.startTime - previous < 1000 && shift.startTime - windowStart < 5000;

    if (continuesWindow) {
      windowValue += shift.value;
    } else {
      windowValue = shift.value;
      windowStart = shift.startTime;
    }

    previous = shift.startTime;
    max = Math.max(max, windowValue);
  }

  return max;
}

/** LCP to ostatni kandydat zgloszony przed interakcja; brak kandydatow to null. */
export function latestLcp(entries) {
  if (entries.length === 0) {
    return null;
  }

  return entries.reduce((latest, entry) => (entry.startTime >= latest.startTime ? entry : latest));
}

export function median(values) {
  if (values.length === 0) {
    return null;
  }

  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Porownanie z budzetami. Brak LCP (np. strona bez tresci) to przekroczenie,
 * bo nie da sie wykazac, ze budzet jest spelniony.
 *
 * @typedef {{ path: string, lcpMs: number | null, cls: number, lcpElement?: string | null }} Measurement
 * @param {Measurement[]} measurements
 * @param {{ lcpMs: number, cls: number }} [budgets]
 * @returns {{ rows: Array<Measurement & { lcpOk: boolean, clsOk: boolean, ok: boolean }>, ok: boolean }}
 */
export function evaluateBudgets(measurements, budgets = PERF_BUDGETS) {
  const rows = measurements.map((measurement) => {
    const lcpOk = measurement.lcpMs !== null && measurement.lcpMs < budgets.lcpMs;
    const clsOk = measurement.cls < budgets.cls;
    return { ...measurement, lcpOk, clsOk, ok: lcpOk && clsOk };
  });

  return { rows, ok: rows.every((row) => row.ok) };
}

function chromiumVersion(directoryName) {
  const match = /^chromium-(\d+)$/.exec(directoryName);
  return match ? Number(match[1]) : null;
}

/**
 * Chromium bez nowej zaleznosci npm: CHROME_PATH albo przegladarka pobrana przez
 * Playwrighta (PLAYWRIGHT_BROWSERS_PATH, domyslnie /opt/pw-browsers i cache uzytkownika).
 *
 * @param {Record<string, string | undefined>} env
 * @param {{ exists?: (path: string) => boolean, list?: (path: string) => string[] }} [fs]
 * @returns {string | null}
 */
export function resolveChromePath(env, { exists = existsSync, list = readdirSync } = {}) {
  if (env.CHROME_PATH) {
    return exists(env.CHROME_PATH) ? env.CHROME_PATH : null;
  }

  const roots = [
    env.PLAYWRIGHT_BROWSERS_PATH,
    "/opt/pw-browsers",
    env.HOME ? join(env.HOME, ".cache", "ms-playwright") : undefined,
  ].filter((root) => typeof root === "string" && root.length > 0);

  for (const root of roots) {
    if (!exists(root)) {
      continue;
    }

    const candidates = list(root)
      .map((name) => ({ name, version: chromiumVersion(name) }))
      .filter((candidate) => candidate.version !== null)
      .toSorted((a, b) => b.version - a.version);

    for (const candidate of candidates) {
      for (const binary of ["chrome-linux/chrome", "chrome-linux64/chrome"]) {
        // Uklad katalogow Playwrighta na Linuksie; join z Windows dalby ukosniki wsteczne.
        const path = posix.join(root, candidate.name, binary);
        if (exists(path)) {
          return path;
        }
      }
    }
  }

  return null;
}

/**
 * Pierwszy link do artykulu (/<kategoria>/<slug>) w HTML strony glownej. Segmenty
 * spoza wzorca sluga (np. /_next) odpadaja same.
 */
export function findArticlePath(html) {
  const match = /href="(\/[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*)"/.exec(html);
  return match ? match[1] : null;
}
