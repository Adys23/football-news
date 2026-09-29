import type { Metadata } from "next";
import Link from "next/link";
import {
  QualityCostTable,
  QualityEditsTable,
  QualityScoresTable,
} from "@/components/admin/QualityCategoryTable";
import { QualityCriteria } from "@/components/admin/QualityCriteria";
import { RejectionList } from "@/components/admin/RejectionList";
import { StatCard } from "@/components/admin/StatCard";
import { QUALITY_WINDOWS, formatShare, formatUsd, parseQualityWindow } from "@/lib/admin/quality";
import { getQualityReport } from "@/lib/admin/quality-data";
import { requireRole } from "@/lib/auth/dal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Raport jakości",
  robots: { index: false, follow: false },
};

export default async function AdminQualityPage({
  searchParams,
}: {
  searchParams: Promise<{ okno?: string | string[] }>;
}) {
  await requireRole("editor");
  const { okno } = await searchParams;
  const windowDays = parseQualityWindow(okno);
  const { report, rejections } = await getQualityReport(new Date(), windowDays);
  const { overall, categories } = report;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6">
      <p className="text-sm text-neutral-500">
        <Link href="/admin" className="underline">
          Panel
        </Link>
        {" / Jakość"}
      </p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Raport jakości redakcji</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Ile pracy redaktor wkłada w teksty modelu i jak daleko jest do kryteriów automatycznej
        publikacji z roadmapy. Raport tylko pokazuje dane: niczego nie włącza ani nie zmienia.
      </p>

      <nav aria-label="Okno raportu" className="mt-6 flex gap-2 text-sm">
        {QUALITY_WINDOWS.map((days) => (
          <Link
            key={days}
            href={`/admin/jakosc?okno=${days}`}
            aria-current={days === windowDays ? "page" : undefined}
            className={`rounded-md border px-3 py-1 ${
              days === windowDays
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200"
            }`}
          >
            {days} dni
          </Link>
        ))}
      </nav>

      <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Czeka na decyzję" value={overall.awaitingDecision} />
        <StatCard label={`Opublikowane (${windowDays} dni)`} value={overall.published} />
        <StatCard label={`Odrzucone (${windowDays} dni)`} value={overall.rejected} />
        <StatCard label="Bez edycji redaktora" value={formatShare(overall.noEditShare)} />
        <StatCard label={`Koszt LLM (${windowDays} dni)`} value={formatUsd(overall.cost.costUsd)} />
        <StatCard
          label="Koszt na opublikowany"
          value={formatUsd(overall.cost.costPerPublishedUsd)}
        />
      </dl>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">
          Postęp względem kryteriów automatycznej publikacji
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          Progi z roadmapy, liczone zawsze na stałych oknach (60 i 30 dni), niezależnie od okna
          wybranego wyżej. Pozostałe kryteria (brak skarg na rzetelność, wąskie typy wydarzeń) nie
          są mierzone w panelu.
        </p>
        <QualityCriteria categories={categories} />
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Publikacje i edycje redaktora</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Opublikowane w oknie według rewizji redaktora. „Bez edycji %” to dolna granica udziału
          tekstów bez poprawek merytorycznych.
        </p>
        <QualityEditsTable categories={categories} overall={overall} />
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Oceny automatyczne</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Średnie z ocen wykonanych w oknie. Rozrzut jakości to odchylenie standardowe - im
          mniejsze, tym stabilniejsze wyniki.
        </p>
        <QualityScoresTable categories={categories} overall={overall} />
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Koszt modelu</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Wywołania z okna według kategorii historii. Koszt na opublikowany artykuł obejmuje też
          historie zablokowane i odrzucone.
        </p>
        <QualityCostTable categories={categories} overall={overall} />
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Odrzucenia z powodami</h2>
        <RejectionList items={rejections} total={overall.rejected} />
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Definicje i ograniczenia pomiaru</h2>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-neutral-700">
          <li>
            Okno liczy dni wstecz od teraz. „Czeka na decyzję” to stan bieżący (do weryfikacji i
            zaakceptowane), bez okna. Opublikowane liczymy po dacie publikacji, także jeśli tekst
            później zarchiwizowano. Odrzucone po dacie ostatniego odrzucenia.
          </li>
          <li>
            Edycje pochodzą wyłącznie z rewizji zapisanych przez redaktora. „Tytuł/lead” to zmiana
            tylko tytułu lub leadu, „Treść” to każda zmiana bloków, także poprawka literówki.
          </li>
          <li>
            Dane nie odróżniają poprawki merytorycznej od stylistycznej. Każda poprawka merytoryczna
            wymaga edycji, ale nie każda edycja jest merytoryczna, więc „Bez edycji %” to dolna
            granica. Wynik poniżej progu oznacza „nie wykazane”, a nie „niespełnione”.
          </li>
          <li>
            Halucynacji panel nie mierzy wprost: powód odrzucenia jest wolnym tekstem bez kategorii.
            Sygnałami są odrzucenia i blokady za twierdzenia bez podparcia w faktach.
          </li>
          <li>
            Dni z redaktorem w pętli to dni kalendarzowe od pierwszej publikacji w kategorii, nie
            dni aktywnej pracy.
          </li>
          <li>
            Eskalacja to wywołanie modelu ustawionego obecnie jako model eskalacji. Zmiana tego
            ustawienia przekłamuje historię. Wywołania bez ceny są liczone osobno i nie wchodzą do
            kosztu. Wywołania bez historii trafiają do „Bez kategorii”.
          </li>
        </ul>
      </section>
    </main>
  );
}
