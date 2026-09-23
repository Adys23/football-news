-- 0017_link_source_item.sql
-- Atomowe powiazanie source_item z historia. supabase-js nie trzyma transakcji
-- miedzy osobnymi requestami, wiec lock, ponowne szukanie i insert musza byc
-- w jednym RPC. Inaczej dwa PROCESS_STORY moga utworzyc dwie historie.

-- Jeden material nalezy do jednej historii. Stary indeks nieunikalny zastapiony.
drop index if exists story_sources_item_idx;
create unique index story_sources_item_idx on story_sources (source_item_id);

create or replace function title_contains_label(p_title text, p_label text)
returns boolean
language sql
stable
set search_path = public, extensions
as $$
  select length(normalize_title(p_label)) >= 3
     and strpos(
       ' ' || normalize_title(p_title) || ' ',
       ' ' || normalize_title(p_label) || ' '
     ) > 0;
$$;

create or replace function find_entity_story(p_title text, p_since timestamptz)
returns uuid
language sql
stable
set search_path = public, extensions
as $$
  with labels as (
    select id, 'player'::text as kind, name as label from players
    union all
    select id, 'player', unnest(aliases) from players where aliases is not null
    union all
    select id, 'club', name from clubs
    union all
    select id, 'club', unnest(aliases) from clubs where aliases is not null
  ),
  incoming as (
    select distinct id, kind
      from labels
     where title_contains_label(p_title, label)
  )
  select s.id
    from stories s
   where s.last_updated_at >= p_since
     and exists (
       select 1
         from incoming i
         join labels l on l.id = i.id and l.kind = i.kind
        where title_contains_label(s.title, l.label)
     )
   order by s.last_updated_at desc
   limit 1;
$$;

create or replace function link_source_item_to_story(
  p_source_item_id uuid,
  p_event_type text,
  p_category_id uuid,
  p_importance int
)
returns table (
  out_story_id uuid,
  out_match_method text,
  out_similarity numeric,
  out_created boolean
)
language plpgsql
set search_path = public, extensions
as $$
declare
  v_item source_items%rowtype;
  v_threshold numeric := 0.55;
  v_window_hours numeric := 48;
  v_since timestamptz;
  v_story_id uuid;
  v_method text;
  v_similarity numeric;
  v_created boolean := false;
  v_existing uuid;
  v_existing_method text;
begin
  -- Serializuje caly clustering. Dwa inty, zeby nie kolidowac z innymi lockami.
  perform pg_advisory_xact_lock(2017, 1);

  select * into v_item from source_items where id = p_source_item_id;
  if not found then
    raise exception 'Nie znaleziono source_item %', p_source_item_id;
  end if;

  select ss.story_id, ss.match_method
    into v_existing, v_existing_method
    from story_sources ss
   where ss.source_item_id = p_source_item_id;

  if v_existing is not null then
    update source_items
       set processed_at = coalesce(processed_at, now())
     where id = p_source_item_id;
    out_story_id := v_existing;
    out_match_method := v_existing_method;
    out_similarity := null;
    out_created := false;
    return next;
    return;
  end if;

  v_threshold := coalesce(
    (select (value #>> '{}')::numeric from settings where key = 'dedupe_similarity_threshold'),
    0.55
  );
  v_window_hours := coalesce(
    (select (value #>> '{}')::numeric from settings where key = 'dedupe_window_hours'),
    48
  );
  v_since := now() - make_interval(hours => greatest(1, v_window_hours::int));

  select fs.story_id, fs.similarity
    into v_story_id, v_similarity
    from find_similar_stories(v_item.title_normalized, v_since, v_threshold) fs
   limit 1;

  if v_story_id is not null then
    v_method := 'trigram';
  else
    v_story_id := find_entity_story(v_item.title, v_since);
    if v_story_id is not null then
      v_method := 'entity';
      v_similarity := null;
    end if;
  end if;

  if v_story_id is null then
    insert into stories (title, summary, status, importance, event_type, category_id)
    values (
      v_item.title,
      v_item.title,
      'new',
      coalesce(p_importance, 50),
      coalesce(p_event_type, 'other'),
      p_category_id
    )
    returning id into v_story_id;

    v_method := 'hash';
    v_similarity := null;
    v_created := true;
  else
    update stories set last_updated_at = now() where id = v_story_id;
  end if;

  insert into story_sources (story_id, source_item_id, match_method, similarity)
  values (v_story_id, p_source_item_id, v_method, v_similarity)
  on conflict (source_item_id) do nothing;

  update source_items set processed_at = now() where id = p_source_item_id;

  out_story_id := v_story_id;
  out_match_method := v_method;
  out_similarity := v_similarity;
  out_created := v_created;
  return next;
end;
$$;

comment on function link_source_item_to_story(uuid, text, uuid, int) is
  'Find-or-create historii pod advisory lock. Jedno RPC = jedna transakcja.';

revoke all on function link_source_item_to_story(uuid, text, uuid, int) from public;
grant execute on function link_source_item_to_story(uuid, text, uuid, int) to service_role;
grant execute on function link_source_item_to_story(uuid, text, uuid, int) to postgres;
