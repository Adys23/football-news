import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleList } from "@/components/public/ArticleList";
import { ProfileFacts, type ProfileFact } from "@/components/public/ProfileFacts";
import { clubPath, playerPath } from "@/lib/public/paths";
import { getEntityArticles, getPlayerBySlug } from "@/lib/public/profiles";
import { countryName, formatBirthDate, type PublicPlayer } from "@/lib/public/profiles-model";

// Musi byc literalem (analiza statyczna Next.js); docs/architecture.md §7.
export const revalidate = 3600;

// Pusta lista: strony powstaja na zadanie, build nie czyta bazy.
export function generateStaticParams(): { slug: string }[] {
  return [];
}

interface PlayerPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PlayerPageProps): Promise<Metadata> {
  const { slug } = await params;
  const player = await getPlayerBySlug(slug);
  if (!player) {
    return {};
  }
  const articles = await getEntityArticles("player", player.id);

  return {
    title: player.name,
    description: player.club
      ? `${player.name} (${player.club.name}) - profil zawodnika i najnowsze artykuły.`
      : `${player.name} - profil zawodnika i najnowsze artykuły.`,
    alternates: { canonical: playerPath(player.slug) },
    // Profil bez artykulow nie ma wartosci dla czytelnika (docs/architecture.md §8.3).
    ...(articles.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

function playerFacts(player: PublicPlayer): ProfileFact[] {
  const facts: ProfileFact[] = [];
  if (player.fullName && player.fullName !== player.name) {
    facts.push({ label: "Imię i nazwisko", value: player.fullName });
  }
  if (player.club) {
    facts.push({
      label: "Klub",
      value: (
        <Link href={clubPath(player.club.slug)} className="underline hover:no-underline">
          {player.club.name}
        </Link>
      ),
    });
  }
  if (player.position) {
    facts.push({ label: "Pozycja", value: player.position });
  }
  if (player.country) {
    facts.push({ label: "Kraj", value: countryName(player.country) });
  }
  if (player.birthDate) {
    facts.push({ label: "Data urodzenia", value: formatBirthDate(player.birthDate, new Date()) });
  }
  return facts;
}

export default async function PlayerPage({ params }: PlayerPageProps) {
  const { slug } = await params;
  const player = await getPlayerBySlug(slug);
  if (!player) {
    notFound();
  }

  const articles = await getEntityArticles("player", player.id);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm font-medium tracking-wide text-sky-700 uppercase">Zawodnik</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight break-words">{player.name}</h1>
      <ProfileFacts facts={playerFacts(player)} />

      <section aria-labelledby="artykuly-zawodnika" className="mt-10">
        <h2
          id="artykuly-zawodnika"
          className="text-sm font-semibold tracking-wide text-neutral-500 uppercase"
        >
          Artykuły
        </h2>
        <ArticleList
          articles={articles}
          emptyMessage="Nie ma jeszcze opublikowanych artykułów o tym zawodniku."
        />
      </section>
    </div>
  );
}
