import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Panel redakcyjny",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  await requireRole("editor");
  const supabase = await createSupabaseServerClient();

  const { count: storiesInReview } = await supabase
    .from("stories")
    .select("id", { count: "exact", head: true })
    .eq("status", "review");

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Panel redakcyjny</h1>

      <dl className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="rounded-md border border-neutral-200 p-4">
          <dt className="text-xs tracking-wide text-neutral-500 uppercase">
            Historie w kolejce redaktora
          </dt>
          <dd className="mt-1 text-2xl font-semibold">{storiesInReview ?? 0}</dd>
        </div>
        <div className="rounded-md border border-neutral-200 p-4">
          <dt className="text-xs tracking-wide text-neutral-500 uppercase">Status etapu</dt>
          <dd className="mt-1 text-sm text-neutral-700">
            Ingestion. Pipeline AI (fakty i draft) w etapie 2.
          </dd>
        </div>
      </dl>

      <p className="mt-8 text-sm">
        <Link href="/admin/historie" className="underline">
          Wykryte wydarzenia
        </Link>
      </p>
    </main>
  );
}
