import type { Metadata } from "next";
import Link from "next/link";
import { SOURCE_FAILURE_LIMIT } from "@shared/lib/circuit-breaker.ts";
import { SourceHealthToggle } from "@/components/admin/SourceHealthToggle";
import { SOURCE_HEALTH_LABELS, type SourceHealth } from "@/lib/admin/ops";
import { getSourcesHealth } from "@/lib/admin/ops-data";
import { SOURCE_TYPE_LABELS, formatNewsroomTime, formatScore } from "@/lib/admin/labels";
import { requireRole } from "@/lib/auth/dal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Zdrowie źródeł",
  robots: { index: false, follow: false },
};

const HEALTH_CLASS: Record<SourceHealth, string> = {
  tripped: "text-destructive",
  disabled: "text-neutral-500",
  degraded: "text-amber-700",
  ok: "text-green-700",
};

function formatTime(iso: string | null): string {
  return iso ? formatNewsroomTime(iso) : "nigdy";
}

export default async function AdminSourcesPage() {
  const profile = await requireRole("editor");
  const isAdmin = profile.role === "admin";
  const sources = await getSourcesHealth(isAdmin);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <p className="text-sm text-neutral-500">
        <Link href="/admin" className="underline">
          Panel
        </Link>
        {" / Źródła"}
      </p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Zdrowie źródeł</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Po {SOURCE_FAILURE_LIMIT} kolejnych błędach pobierania źródło wyłącza się samo.
        {isAdmin
          ? " Włączenie źródła zeruje licznik błędów."
          : " Włączać i wyłączać źródła oraz widzieć błędy pobierania może tylko administrator."}
      </p>

      {sources.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">Brak skonfigurowanych źródeł.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {sources.map((source) => (
            <li key={source.id} className="rounded-md border border-neutral-200 p-4">
              <p className="font-medium">
                {source.name}{" "}
                <span className={`text-sm ${HEALTH_CLASS[source.health]}`}>
                  · {SOURCE_HEALTH_LABELS[source.health]}
                </span>
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {SOURCE_TYPE_LABELS[source.type]} · zaufanie {formatScore(source.trustScore)} ·
                błędy z rzędu {source.failures}/{SOURCE_FAILURE_LIMIT} · sprawdzone{" "}
                {formatTime(source.lastCheckedAt)} · ostatni sukces{" "}
                {formatTime(source.lastSuccessAt)}
              </p>
              {source.lastError ? (
                <pre className="mt-3 overflow-x-auto rounded bg-neutral-50 p-2 text-xs break-words whitespace-pre-wrap">
                  {source.lastError}
                </pre>
              ) : null}
              {isAdmin ? (
                <div className="mt-3">
                  <SourceHealthToggle
                    // Nowy stan montuje formularz od nowa, wiec stary komunikat nie wisi przy nim.
                    key={String(source.active)}
                    sourceId={source.id}
                    active={source.active}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
