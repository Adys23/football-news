import type { HandlerContext } from "./handler-context.ts";
import { findMentionedEntities } from "./entities.ts";
import { JobError } from "./jobs.ts";

/**
 * Kontekst dla modelu piszacego - wylacznie dane z bazy portalu, nigdy
 * z pamieci modelu (docs/ai-pipeline.md, sekcja 5).
 */
export type ArticleContext = {
  players: {
    name: string;
    full_name: string | null;
    country: string | null;
    position: string | null;
    club: string | null;
  }[];
  clubs: { name: string; country: string | null; league: string | null }[];
};

export type ArticleContextResult = {
  context: ArticleContext;
  /** Nazwy rozpoznanych zawodnikow i klubow - tytul musi zawierac co najmniej jedna. */
  entityNames: string[];
};

export async function loadArticleContext(
  ctx: HandlerContext,
  text: string,
): Promise<ArticleContextResult> {
  const [players, clubs, leagues] = await Promise.all([
    ctx.client
      .from("players")
      .select("id, name, full_name, aliases, country, position, current_club_id"),
    ctx.client.from("clubs").select("id, name, aliases, country, league_id"),
    ctx.client.from("leagues").select("id, name"),
  ]);

  for (const result of [players, clubs, leagues]) {
    if (result.error) {
      throw new JobError(`Kontekst artykulu: ${result.error.message}`);
    }
  }

  const playerRows = players.data ?? [];
  const clubRows = clubs.data ?? [];
  const leagueName = new Map((leagues.data ?? []).map((league) => [league.id, league.name]));
  const clubById = new Map(clubRows.map((club) => [club.id, club]));

  const hits = findMentionedEntities(text, playerRows, clubRows);
  const mentionedPlayers = playerRows.filter((player) =>
    hits.some((hit) => hit.type === "player" && hit.id === player.id),
  );
  // Klub wspomnianego zawodnika tez jest kontekstem, nawet gdy tekst go nie nazywa.
  const clubIds = new Set([
    ...hits.filter((hit) => hit.type === "club").map((hit) => hit.id),
    ...mentionedPlayers.flatMap((player) => player.current_club_id ?? []),
  ]);
  const mentionedClubs = [...clubIds].flatMap((id) => clubById.get(id) ?? []);

  return {
    context: {
      players: mentionedPlayers.map((player) => ({
        name: player.name,
        full_name: player.full_name,
        country: player.country,
        position: player.position,
        club: player.current_club_id ? (clubById.get(player.current_club_id)?.name ?? null) : null,
      })),
      clubs: mentionedClubs.map((club) => ({
        name: club.name,
        country: club.country,
        league: club.league_id ? (leagueName.get(club.league_id) ?? null) : null,
      })),
    },
    entityNames: [...mentionedPlayers, ...mentionedClubs].map((entity) => entity.name),
  };
}
