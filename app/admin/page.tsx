import type { Metadata } from "next";
import Link from "next/link";
import { ReviewQueue } from "@/components/admin/ReviewQueue";
import { StatCard } from "@/components/admin/StatCard";
import { UrgentStories } from "@/components/admin/UrgentStories";
import { URGENT_IMPORTANCE } from "@/lib/admin/dashboard";
import { getDashboardCounts, getReviewQueue, getUrgentStories } from "@/lib/admin/dashboard-data";
import { countDeadJobs } from "@/lib/admin/ops-data";
import { requireRole } from "@/lib/auth/dal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panel redakcyjny",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const profile = await requireRole("editor");
  const now = new Date();

  const [counts, urgent, queue, deadJobs] = await Promise.all([
    getDashboardCounts(now),
    getUrgentStories(now),
    getReviewQueue(),
    profile.role === "admin" ? countDeadJobs() : 0,
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Panel redakcyjny</h1>

      {deadJobs > 0 ? (
        <p role="alert" className="mt-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
          Martwe joby: {deadJobs}.{" "}
          <Link href="/admin/joby" className="underline">
            Przejrzyj i ponów
          </Link>
        </p>
      ) : null}

      <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Nowe historie (doba)" value={counts.newStories} />
        <StatCard label="Do weryfikacji" value={counts.inReview} />
        <StatCard label="Gotowe do publikacji" value={counts.approved} />
        <StatCard label="Opublikowane dziś" value={counts.publishedToday} />
      </dl>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Pilne</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Historie z wagą od {URGENT_IMPORTANCE}, aktualizowane w ciągu ostatniej doby.
        </p>
        <UrgentStories stories={urgent} />
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold">Kolejka do weryfikacji</h2>
        <p className="mt-1 text-sm text-neutral-600">Według wagi, potem pewności oceny faktów.</p>
        <ReviewQueue items={queue} total={counts.inReview} />
      </section>

      <p className="mt-12 text-sm">
        <Link href="/admin/historie" className="underline">
          Wszystkie wykryte wydarzenia
        </Link>
      </p>
    </main>
  );
}
