import Link from "next/link";
import { articlePath } from "@/lib/public/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SITE } from "@/lib/site";

// Strona czyta z bazy przez sesje uzytkownika, wiec nie prerenderujemy jej
// w czasie budowania. Wlasciwa strategia (ISR + revalidateTag) wchodzi w etapie 4.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();

  const { data: articles, error } = await supabase
    .from("articles")
    .select("id, slug, title, lead, published_at, categories(slug)")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(20);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{SITE.name}</h1>
      <p className="mt-3 text-sm text-neutral-600">{SITE.description}</p>

      {error ? (
        <p className="mt-10 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
          Nie udalo sie odczytac artykulow: {error.message}
        </p>
      ) : articles && articles.length > 0 ? (
        <ul className="mt-10 space-y-8">
          {articles.map((article) => (
            <li key={article.id}>
              <Link
                href={articlePath({
                  slug: article.slug,
                  categorySlug: article.categories?.slug ?? null,
                })}
                className="text-xl font-medium underline"
              >
                {article.title}
              </Link>
              {article.lead ? (
                <p className="mt-2 text-sm text-neutral-600">{article.lead}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-10 rounded-md border border-neutral-200 p-6 text-sm text-neutral-600">
          <p className="font-medium text-neutral-900">Brak opublikowanych artykulow.</p>
          <p className="mt-2">
            Fundament, pobieranie RSS i grupowanie w wydarzenia sa gotowe. Pipeline AI powstaje w
            etapie 2 (patrz <code>docs/roadmap.md</code>).
          </p>
        </div>
      )}
    </main>
  );
}
