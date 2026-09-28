import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleList } from "@/components/public/ArticleList";
import { ProfileFacts, type ProfileFact } from "@/components/public/ProfileFacts";
import { clubPath, playerPath } from "@/lib/public/paths";
import { getClubBySlug, getClubPlayers, getEntityArticles } from "@/lib/public/profiles";
import { countryName, type PublicClub } from "@/lib/public/profiles-model";

// Musi byc literalem (analiza statyczna Next.js); docs/architecture.md §7.
export const revalidate = 3600;

// Pusta lista: strony powstaja na zadanie, build nie czyta bazy.
export function generateStaticParams(): { slug: string }[] {
  return [];
}

interface ClubPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ClubPageProps): Promise<Metadata> {
  const { slug } = await params;
  const club = await getClubBySlug(slug);
  if (!club) {
    return {};
  }
  const articles = await getEntityArticles("club", club.id);

  return {
    title: club.name,
    description: `${club.name} - profil klubu, zawodnicy i najnowsze artykuły.`,
    alternates: { canonical: clubPath(club.slug) },
    // Profil bez artykulow nie ma wartosci dla czytelnika (docs/architecture.md §8.3).
    ...(articles.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

function clubFacts(club: PublicClub): ProfileFact[] {
  const facts: ProfileFact[] = [];
  if (club.shortName && club.shortName !== club.name) {
    facts.push({ label: "Nazwa skrócona", value: club.shortName });
  }
  if (club.leagueName) {
    facts.push({ label: "Liga", value: club.leagueName });
  }
  if (club.country) {
    facts.push({ label: "Kraj", value: countryName(club.country) });
  }
  if (club.foundedYear) {
    facts.push({ label: "Rok założenia", value: String(club.foundedYear) });
  }
  return facts;
}

export default async function ClubPage({ params }: ClubPageProps) {
  const { slug } = await params;
  const club = await getClubBySlug(slug);
  if (!club) {
    notFound();
  }

  const [articles, players] = await Promise.all([
    getEntityArticles("club", club.id),
    getClubPlayers(club.id),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm font-medium tracking-wide text-sky-700 uppercase">Klub</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight break-words">{club.name}</h1>
      <ProfileFacts facts={clubFacts(club)} />

      <section aria-labelledby="artykuly-klubu" className="mt-10">
        <h2
          id="artykuly-klubu"
          className="text-sm font-semibold tracking-wide text-neutral-500 uppercase"
        >
          Artykuły
        </h2>
        <ArticleList
          articles={articles}
          emptyMessage="Nie ma jeszcze opublikowanych artykułów o tym klubie."
        />
      </section>

      {players.length > 0 ? (
        <section aria-labelledby="zawodnicy-klubu" className="mt-10">
          <h2
            id="zawodnicy-klubu"
            className="text-sm font-semibold tracking-wide text-neutral-500 uppercase"
          >
            Zawodnicy
          </h2>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {players.map((player) => (
              <li key={player.id}>
                <Link href={playerPath(player.slug)} className="font-medium hover:underline">
                  {player.name}
                </Link>
                {player.position ? (
                  <span className="text-neutral-500">, {player.position}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
