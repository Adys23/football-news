#!/usr/bin/env node
/**
 * Pomiar LCP i CLS strony publicznej na emulowanym telefonie i porownanie z budzetami
 * (LCP < 2,0 s, CLS < 0,1; docs/architecture.md §8.2). Bez nowych zaleznosci: Chromium
 * pobrany przez Playwrighta albo wskazany w CHROME_PATH, sterowany przez Chrome DevTools
 * Protocol po wbudowanym w Node WebSocket.
 *
 * Wymaga dzialajacej aplikacji (`npm run build && npm run start`) z opublikowanym artykulem.
 *
 *   npm run perf:budget
 *   npm run perf:budget -- --base-url=http://localhost:3000 --runs=5
 *   npm run perf:budget -- --path=/ --path=/transfery --path=/transfery/jakis-slug
 *
 * Bez --path: strona glowna, kategoria i artykul z pierwszego linku na stronie glownej.
 * Kod wyjscia: 0 - budzety spelnione, 1 - przekroczenie, 2 - blad pomiaru.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  computeCls,
  evaluateBudgets,
  findArticlePath,
  kbpsToBytesPerSecond,
  latestLcp,
  median,
  MOBILE_PROFILE,
  PERF_BUDGETS,
  resolveChromePath,
} from "./lib/perf-budget.mjs";

const SETTLE_MS = 3000;
const NAVIGATION_TIMEOUT_MS = 60_000;

// Zbiera kandydatow LCP i przesuniecia ukladu od pierwszego bajtu dokumentu.
const OBSERVER_SCRIPT = `
  window.__perf = { lcp: [], shifts: [] };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const el = entry.element;
      window.__perf.lcp.push({
        startTime: entry.startTime,
        element: el ? el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") : null,
        url: entry.url || null,
      });
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__perf.shifts.push({
        value: entry.value,
        startTime: entry.startTime,
        hadRecentInput: entry.hadRecentInput,
      });
    }
  }).observe({ type: "layout-shift", buffered: true });
`;

const READ_SCRIPT = `JSON.stringify({
  lcp: window.__perf.lcp,
  shifts: window.__perf.shifts,
  status: performance.getEntriesByType("navigation")[0]?.responseStatus ?? null,
})`;

function exitWithError(message) {
  console.error(`\n[BLAD] ${message}\n`);
  process.exit(2);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function launchChrome(chromePath) {
  const userDataDir = mkdtempSync(join(tmpdir(), "perf-budget-"));
  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-networking",
    "--mute-audio",
  ];
  // Sandbox Chromium nie startuje jako root (kontenery CI i sesje w chmurze).
  if (process.getuid?.() === 0) {
    args.push("--no-sandbox");
  }

  const child = spawn(chromePath, args, { stdio: ["ignore", "ignore", "pipe"] });

  const endpoint = new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error("Chromium nie wystartowal w 30 s")), 30_000);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(stderr);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Chromium zakonczyl sie kodem ${code}: ${stderr.slice(-500)}`));
    });
  });

  const close = () => {
    child.kill("SIGKILL");
    rmSync(userDataDir, { recursive: true, force: true });
  };

  return { endpoint, close };
}

/** Minimalny klient CDP: polecenia z id, zdarzenia po nazwie i sesji (tryb flatten). */
async function connectCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("Brak polaczenia z CDP")), {
      once: true,
    });
  });

  let nextId = 1;
  const pending = new Map();
  const waiters = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== undefined) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        request?.reject(new Error(`${request.method}: ${message.error.message}`));
      } else {
        request?.resolve(message.result);
      }
      return;
    }

    for (const waiter of [...waiters]) {
      if (waiter.method === message.method && waiter.sessionId === message.sessionId) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message.params);
      }
    }
  });

  return {
    send(method, params = {}, sessionId) {
      const id = nextId++;
      socket.send(JSON.stringify({ id, method, params, sessionId }));
      return new Promise((resolve, reject) => pending.set(id, { method, resolve, reject }));
    },
    waitFor(method, sessionId, timeoutMs) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index !== -1) {
            waiters.splice(index, 1);
            reject(new Error(`Brak zdarzenia ${method} w ${timeoutMs} ms`));
          }
        }, timeoutMs);
        const waiter = {
          method,
          sessionId,
          resolve: (params) => {
            clearTimeout(timer);
            resolve(params);
          },
        };
        waiters.push(waiter);
      });
    },
    close() {
      socket.close();
    },
  };
}

/** Jeden pomiar w swiezym kontekscie przegladarki: pusty cache HTTP, bez ciasteczek. */
async function measureOnce(cdp, url) {
  const { browserContextId } = await cdp.send("Target.createBrowserContext");
  try {
    const { targetId } = await cdp.send("Target.createTarget", {
      url: "about:blank",
      browserContextId,
    });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const send = (method, params) => cdp.send(method, params, sessionId);

    await send("Page.enable");
    await send("Network.enable");
    await send("Emulation.setDeviceMetricsOverride", MOBILE_PROFILE.viewport);
    await send("Emulation.setUserAgentOverride", { userAgent: MOBILE_PROFILE.userAgent });
    await send("Emulation.setCPUThrottlingRate", { rate: MOBILE_PROFILE.cpuSlowdown });
    await send("Network.emulateNetworkConditions", {
      offline: false,
      latency: MOBILE_PROFILE.network.latencyMs,
      downloadThroughput: kbpsToBytesPerSecond(MOBILE_PROFILE.network.downloadKbps),
      uploadThroughput: kbpsToBytesPerSecond(MOBILE_PROFILE.network.uploadKbps),
    });
    await send("Page.addScriptToEvaluateOnNewDocument", { source: OBSERVER_SCRIPT });

    const loaded = cdp.waitFor("Page.loadEventFired", sessionId, NAVIGATION_TIMEOUT_MS);
    const navigation = await send("Page.navigate", { url });
    if (navigation.errorText) {
      throw new Error(`Nawigacja do ${url}: ${navigation.errorText}`);
    }
    await loaded;
    await sleep(SETTLE_MS);

    const { result } = await send("Runtime.evaluate", {
      expression: READ_SCRIPT,
      returnByValue: true,
    });
    const data = JSON.parse(result.value);
    const lcp = latestLcp(data.lcp);

    return {
      status: data.status,
      lcpMs: lcp ? Math.round(lcp.startTime) : null,
      lcpElement: lcp ? (lcp.url ?? lcp.element) : null,
      cls: computeCls(data.shifts),
    };
  } finally {
    await cdp.send("Target.disposeBrowserContext", { browserContextId });
  }
}

async function defaultPaths(baseUrl) {
  const response = await fetch(new URL("/", baseUrl));
  if (!response.ok) {
    exitWithError(`Strona glowna ${baseUrl} zwrocila ${response.status}.`);
  }

  const article = findArticlePath(await response.text());
  if (!article) {
    exitWithError(
      "Na stronie glownej nie ma linku do artykulu. Opublikuj artykul albo podaj --path.",
    );
  }

  const category = `/${article.split("/")[1]}`;
  return ["/", category, article];
}

function formatRow(row) {
  const lcp = row.lcpMs === null ? "brak" : `${(row.lcpMs / 1000).toFixed(2)} s`;
  const mark = (ok) => (ok ? "OK" : "PRZEKROCZONY");
  return [
    row.path.padEnd(48),
    `LCP ${lcp.padStart(7)} ${mark(row.lcpOk).padEnd(12)}`,
    `CLS ${row.cls.toFixed(3)} ${mark(row.clsOk).padEnd(12)}`,
    row.lcpElement ? `LCP: ${row.lcpElement}` : "",
  ].join("  ");
}

const { values } = parseArgs({
  options: {
    "base-url": { type: "string", default: process.env.PERF_BASE_URL ?? "http://localhost:3000" },
    path: { type: "string", multiple: true },
    runs: { type: "string", default: "3" },
  },
});

const baseUrl = values["base-url"];
const runs = Number.parseInt(values.runs, 10);
if (!Number.isInteger(runs) || runs < 1) {
  exitWithError("--runs musi byc dodatnia liczba calkowita.");
}

const chromePath = resolveChromePath(process.env);
if (!chromePath) {
  exitWithError(
    "Nie znaleziono Chromium. Ustaw CHROME_PATH albo PLAYWRIGHT_BROWSERS_PATH (np. /opt/pw-browsers).",
  );
}

try {
  await fetch(baseUrl);
} catch {
  exitWithError(`Aplikacja pod ${baseUrl} nie odpowiada. Uruchom npm run build && npm run start.`);
}

const paths = values.path?.length ? values.path : await defaultPaths(baseUrl);

console.log(`Chromium: ${chromePath}`);
console.log(
  `Profil: ${MOBILE_PROFILE.viewport.width}x${MOBILE_PROFILE.viewport.height}, CPU x${MOBILE_PROFILE.cpuSlowdown}, ` +
    `RTT ${MOBILE_PROFILE.network.latencyMs} ms, ${MOBILE_PROFILE.network.downloadKbps} kb/s; ` +
    `mediana z ${runs} pomiarow; budzet LCP < ${PERF_BUDGETS.lcpMs / 1000} s, CLS < ${PERF_BUDGETS.cls}\n`,
);

const chrome = launchChrome(chromePath);
let cdp;
const measurements = [];

try {
  cdp = await connectCdp(await chrome.endpoint);

  for (const path of paths) {
    const url = new URL(path, baseUrl).toString();
    // Rozgrzewka: ISR generuje strone przy pierwszej wizycie, a mierzymy to, co widzi
    // czytelnik po wygenerowaniu (odpowiedz z cache), nie pierwszy render na serwerze.
    await fetch(url);

    const samples = [];
    for (let run = 0; run < runs; run++) {
      samples.push(await measureOnce(cdp, url));
    }

    const failed = samples.find((sample) => sample.status !== null && sample.status >= 400);
    if (failed) {
      throw new Error(`${path} zwrocil HTTP ${failed.status}; pomiar strony bledu nic nie mowi.`);
    }

    const lcpSamples = samples.map((sample) => sample.lcpMs).filter((value) => value !== null);
    measurements.push({
      path,
      lcpMs: lcpSamples.length === samples.length ? median(lcpSamples) : null,
      cls: median(samples.map((sample) => sample.cls)),
      lcpElement: samples.at(-1)?.lcpElement ?? null,
    });
  }
} catch (error) {
  cdp?.close();
  chrome.close();
  exitWithError(error instanceof Error ? error.message : String(error));
}

cdp.close();
chrome.close();

const report = evaluateBudgets(measurements);
for (const row of report.rows) {
  console.log(formatRow(row));
}

if (!report.ok) {
  console.error("\nBudzet wydajnosci przekroczony.");
  process.exit(1);
}

console.log("\nBudzety wydajnosci spelnione.");
