-- 0026_public_provenance.sql
-- Pochodzenie opublikowanego artykulu dla strony publicznej: lista zrodel i tresc
-- faktow z blokow fact_box. Warstwa produkcyjna (sources, source_items, story_sources,
-- facts) zostaje niewidoczna dla anona; te funkcje zwracaja tylko wybrane kolumny,
-- tylko dla artykulu ze statusem published i tylko to, co widzial redaktor.

-- Bez trust_score, raw_data, content i pol technicznych zrodla. Material dopiety do
-- historii po publikacji pojawia sie dopiero po zaakceptowanej aktualizacji artykulu.
create function public_article_sources(p_article_id uuid)
returns table (
  source_name text,
  source_type public.source_type,
  title text,
  url text,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.name, s.type, si.title, si.url, si.published_at
  from public.articles a
  join public.story_sources ss on ss.story_id = a.story_id
  join public.source_items si on si.id = ss.source_item_id
  join public.sources s on s.id = si.source_id
  where a.id = p_article_id
    and a.status = 'published'
    and ss.created_at <= greatest(
      a.published_at,
      (
        select max(u.published_at)
        from public.article_updates u
        where u.article_id = a.id
          and u.approved_by is not null
          -- published_at ustawia redaktor; zaplanowana aktualizacja nie poszerza okna.
          and u.published_at <= now()
      )
    )
    -- Link na stronie musi byc bezpieczny; inny schemat nie trafia do czytelnika.
    and si.url ~* '^https?://'
  order by si.published_at desc nulls last, s.name, si.id;
$$;

-- Tylko fakty wskazane w blokach fact_box opublikowanej tresci. Ta tresc przeszla
-- akceptacje redaktora; nowa ocena historii po publikacji nie odslania nowych faktow.
create function public_article_facts(p_article_id uuid)
returns table (
  id uuid,
  statement_pl text
)
language sql
stable
security definer
set search_path = ''
as $$
  with box_fact_ids as (
    select distinct a.story_id, lower(fact_id.value) as id
    from public.articles a
    cross join lateral jsonb_array_elements(a.content -> 'blocks') as block(value)
    cross join lateral jsonb_array_elements_text(
      case
        when block.value ->> 'type' = 'fact_box'
          and jsonb_typeof(block.value -> 'factIds') = 'array'
        then block.value -> 'factIds'
        else '[]'::jsonb
      end
    ) as fact_id(value)
    where a.id = p_article_id
      and a.status = 'published'
  )
  select f.id, f.statement_pl
  from box_fact_ids b
  join public.facts f on f.story_id = b.story_id and f.id::text = b.id
  order by f.created_at, f.id;
$$;

revoke all on function public_article_sources(uuid) from public;
revoke all on function public_article_facts(uuid) from public;
grant execute on function public_article_sources(uuid) to anon, authenticated, service_role;
grant execute on function public_article_facts(uuid) to anon, authenticated, service_role;

-- Aktualizacja bez akceptacji redaktora nie jest publiczna (AGENTS.md §4.3).
alter policy "article_updates_select_published" on article_updates
using (
  approved_by is not null
  and exists (
    select 1 from articles a
    where a.id = article_updates.article_id
      and a.status = 'published'
  )
);
