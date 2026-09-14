import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Historie",
  robots: { index: false, follow: false },
};

export default async function AdminStoriesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: stories, error } = await supabase
    .from("stories")
    .select(
      "id, title, status, importance, event_type, last_updated_at, story_sources(source_item_id)",
    )
    .order("last_updated_at", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <p className="text-sm text-neutral-500">
        <Link href="/admin" className="underline">
          Panel
        </Link>
        {" / Historie"}
      </p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Wykryte wydarzenia</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Grupowanie zrodel bez LLM. Logowanie redaktora jest w etapie 3 - bez sesji RLS nie pokaze
        warstwy produkcyjnej.
      </p>

      {!user ? (
        <p className="mt-6 text-sm text-neutral-600">
          Brak sesji. Lokalne konto: <code>redaktor@local.test</code>.
        </p>
      ) : null}

      {error ? (
        <p className="mt-8 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
          Nie udalo sie odczytac historii: {error.message}
        </p>
      ) : !stories || stories.length === 0 ? (
        <p className="mt-8 text-sm text-neutral-600">Brak wykrytych wydarzen.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {stories.map((story) => (
            <li key={story.id} className="rounded-md border border-neutral-200 p-4">
              <p className="font-medium">{story.title}</p>
              <p className="mt-1 text-xs text-neutral-500">
                {story.status} · {story.event_type} · waga {story.importance} · zrodla{" "}
                {story.story_sources?.length ?? 0}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
