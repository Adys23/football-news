import { describe, expect, it, vi } from "vitest";
import { loadArticleContext } from "@shared/lib/article-context.ts";
import type { HandlerContext } from "@shared/lib/handler-context.ts";
import type { ServiceClient } from "@shared/lib/jobs.ts";
import { JobError } from "@shared/lib/jobs.ts";
import { loadApprovedFacts } from "@shared/lib/story-facts.ts";
import { loadStorySources, setStoryStatus } from "@shared/lib/story-sources.ts";

const STORY_ID = "11111111-1111-4111-8111-111111111111";

type Result = { data: unknown[]; error: { message: string } | null };

/**
 * Klient, ktory na kazde zapytanie do tabeli zwraca jej wiersze. Filtry sa
 * ignorowane - kazdy test podaje wylacznie dane swojego scenariusza.
 */
function fakeCtx(tables: Record<string, unknown[]>, errors: Record<string, string> = {}) {
  const updates: { table: string; values: unknown }[] = [];

  function query(table: string) {
    const result: Result = {
      data: tables[table] ?? [],
      error: errors[table] ? { message: errors[table] } : null,
    };
    const chain = {
      select: () => chain,
      eq: () => chain,
      is: () => chain,
      update: (values: unknown) => {
        updates.push({ table, values });
        return chain;
      },
      maybeSingle: async () => ({ data: result.data[0] ?? null, error: result.error }),
      then: <T>(resolve: (value: Result) => T) => Promise.resolve(result).then(resolve),
    };
    return chain;
  }

  // vi.fn() bez sygnatury, bo pelny PostgrestQueryBuilder nie jest tu potrzebny.
  const from = vi.fn();
  from.mockImplementation(query);
  const client = { from } as Pick<ServiceClient, "from"> as ServiceClient;
  const ctx: HandlerContext = { client };
  return { ctx, updates };
}

function storySource(itemId: string, sourceId: string, trust: string) {
  return {
    source_items: {
      id: itemId,
      source_id: sourceId,
      title: `Tytul ${itemId}`,
      content: null,
      published_at: null,
      sources: {
        name: `Zrodlo ${sourceId}`,
        type: "major_outlet",
        trust_score: trust,
        language: "pl",
      },
    },
  };
}

function fact(id: string, sourceId: string, confidence = "0.90") {
  return {
    id,
    subject: "Manchester United",
    predicate: "extended_contract_with",
    object: "Bruno Fernandes",
    statement_pl: "Manchester United przedluzyl kontrakt z Bruno Fernandesem.",
    confidence,
    source_id: sourceId,
  };
}

describe("loadStorySources", () => {
  it("splaszcza materialy, zamienia trust_score na liczbe i pomija material bez zrodla", async () => {
    const { ctx } = fakeCtx({
      story_sources: [
        storySource("i1", "s1", "0.85"),
        { source_items: { ...storySource("i2", "s2", "1").source_items, sources: null } },
      ],
    });

    const rows = await loadStorySources(ctx, STORY_ID);

    expect(rows).toEqual([
      expect.objectContaining({ sourceItemId: "i1", sourceId: "s1", trustScore: 0.85 }),
    ]);
  });

  it("zamienia blad bazy na JobError", async () => {
    const { ctx } = fakeCtx({}, { story_sources: "timeout" });

    await expect(loadStorySources(ctx, STORY_ID)).rejects.toBeInstanceOf(JobError);
  });
});

describe("setStoryStatus", () => {
  it("zapisuje status i zglasza blad zapisu", async () => {
    const ok = fakeCtx({});
    await setStoryStatus(ok.ctx, STORY_ID, "drafting");
    expect(ok.updates).toEqual([{ table: "stories", values: { status: "drafting" } }]);

    const failing = fakeCtx({}, { stories: "brak uprawnien" });
    await expect(setStoryStatus(failing.ctx, STORY_ID, "blocked")).rejects.toThrow(
      /brak uprawnien/,
    );
  });
});

describe("loadApprovedFacts", () => {
  const sources = [storySource("i1", "club", "1"), storySource("i2", "outlet", "0.85")];

  it("zwraca zatwierdzone fakty z konfliktami i kluczem zestawu materialow", async () => {
    const { ctx } = fakeCtx({
      story_sources: sources,
      story_assessments: [
        {
          publishability: "review",
          conflicts: [{ description: "Rozne daty.", source_indexes: [1, 2], severity: "low" }],
          approved_fact_ids: ["f-club"],
        },
      ],
      facts: [fact("f-club", "club", "0.97"), fact("f-outlet", "outlet")],
    });

    const approved = await loadApprovedFacts(ctx, STORY_ID);

    expect(approved?.facts.map((group) => [group.id, group.confidence])).toEqual([
      ["f-club", 0.97],
    ]);
    expect(approved?.conflicts).toHaveLength(1);
    expect(approved?.setKey).toMatch(/^[0-9a-f]{16}$/);
  });

  it("rozpoznaje zatwierdzony wiersz, ktory przestal byc reprezentantem grupy", async () => {
    // Walidacja zatwierdzila wiersz z "outlet"; teraz reprezentantem jest "club".
    const { ctx } = fakeCtx({
      story_sources: sources,
      story_assessments: [
        { publishability: "review", conflicts: [], approved_fact_ids: ["f-outlet"] },
      ],
      facts: [fact("f-club", "club"), fact("f-outlet", "outlet")],
    });

    const approved = await loadApprovedFacts(ctx, STORY_ID);

    expect(approved?.facts.map((group) => group.id)).toEqual(["f-outlet"]);
  });

  it("zwraca null, gdy zatwierdzony fakt zniknal po ponownej ekstrakcji", async () => {
    const { ctx } = fakeCtx({
      story_sources: sources,
      story_assessments: [
        { publishability: "review", conflicts: [], approved_fact_ids: ["f-usuniety"] },
      ],
      facts: [fact("f-nowy", "club")],
    });

    await expect(loadApprovedFacts(ctx, STORY_ID)).resolves.toBeNull();
  });

  it("wymaga oceny historii", async () => {
    const { ctx } = fakeCtx({ story_sources: sources });

    await expect(loadApprovedFacts(ctx, STORY_ID)).rejects.toThrow(/nie ma oceny/);
  });
});

describe("loadArticleContext", () => {
  const tables = {
    players: [
      {
        id: "p1",
        name: "Bruno Fernandes",
        full_name: "Bruno Miguel Borges Fernandes",
        aliases: ["Fernandes"],
        country: "pt",
        position: "pomocnik",
        current_club_id: "c1",
      },
      {
        id: "p2",
        name: "Robert Lewandowski",
        full_name: null,
        aliases: [],
        country: "pl",
        position: null,
        current_club_id: null,
      },
    ],
    clubs: [
      {
        id: "c1",
        name: "Manchester United",
        aliases: ["United", "Man Utd"],
        country: "en",
        league_id: "l1",
      },
    ],
    leagues: [{ id: "l1", name: "Premier League" }],
  };

  it("dodaje klub wspomnianego zawodnika z liga", async () => {
    const { ctx } = fakeCtx(tables);

    const result = await loadArticleContext(ctx, "Fernandes przedluzyl kontrakt do 2027 roku.");

    expect(result.context).toEqual({
      players: [
        {
          name: "Bruno Fernandes",
          full_name: "Bruno Miguel Borges Fernandes",
          country: "pt",
          position: "pomocnik",
          club: "Manchester United",
        },
      ],
      clubs: [{ name: "Manchester United", country: "en", league: "Premier League" }],
    });
    expect(result.entityNames).toEqual(["Bruno Fernandes", "Manchester United"]);
  });

  it("zamienia blad slownika na JobError", async () => {
    const { ctx } = fakeCtx(tables, { clubs: "timeout" });

    await expect(loadArticleContext(ctx, "Bruno Fernandes")).rejects.toBeInstanceOf(JobError);
  });
});
