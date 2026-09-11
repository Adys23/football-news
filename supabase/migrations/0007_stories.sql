-- 0007_stories.sql
-- Wydarzenie, jeszcze nie artykul. Jedna story moze miec wiele zrodel.

create table stories (
  id uuid primary key default gen_random_uuid(),
  -- Tytul roboczy do panelu, nie publikacyjny.
  title text not null,
  summary text,
  sport text not null default 'football',
  category_id uuid references categories (id) on delete set null,
  status story_status not null default 'new',
  importance int not null default 50,
  event_type text not null default 'other',
  -- Embeddingi wchodza w etapie 5 roadmapy; kolumna istnieje od poczatku.
  embedding extensions.vector(1536),
  first_seen_at timestamptz not null default now(),
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint stories_importance_range check (importance between 0 and 100),
  constraint stories_event_type_known check (
    event_type in ('transfer', 'injury', 'match_result', 'contract', 'other')
  )
);

alter table stories enable row level security;

comment on table stories is 'Wydarzenie w swiecie rzeczywistym. Nie ma tresci do czytania - ma status i zrodla.';

-- Kolejka redaktora: najpilniejsze najpierw.
create index stories_status_importance_idx on stories (status, importance desc);
create index stories_updated_idx on stories (last_updated_at desc);

create table story_sources (
  story_id uuid not null references stories (id) on delete cascade,
  source_item_id uuid not null references source_items (id) on delete cascade,
  match_method text not null default 'manual',
  similarity numeric(4, 3),
  created_at timestamptz not null default now(),
  primary key (story_id, source_item_id),
  constraint story_sources_match_method_known check (
    match_method in ('hash', 'trigram', 'entity', 'embedding', 'manual')
  )
);

alter table story_sources enable row level security;

comment on table story_sources is 'Powiazanie wydarzenia ze zrodlami. Wiele zrodel na historie to wartosc dodana portalu.';

create index story_sources_item_idx on story_sources (source_item_id);
