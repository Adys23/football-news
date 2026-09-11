-- 0010_entities.sql
-- Encje sportowe. Pozwalaja zbudowac z portalu baze wiedzy, nie tylko strumien tekstow.
-- Pole aliases jest kluczowe dla deduplikacji: "Red Devils" i "United" to ten sam klub.

create table leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  country text,
  tier int,
  logo_id uuid references image_assets (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table leagues enable row level security;

create unique index leagues_slug_idx on leagues (slug);

create trigger leagues_set_updated_at
before update on leagues
for each row
execute function set_updated_at();

create table clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  short_name text,
  aliases text[] not null default '{}',
  country text,
  league_id uuid references leagues (id) on delete set null,
  logo_id uuid references image_assets (id) on delete set null,
  founded_year int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table clubs enable row level security;

comment on column clubs.aliases is 'Nazwy alternatywne uzywane przez deduplikacje i rozpoznawanie encji.';

create unique index clubs_slug_idx on clubs (slug);
create index clubs_aliases_idx on clubs using gin (aliases);
create index clubs_name_trgm_idx on clubs using gin (name extensions.gin_trgm_ops);

create trigger clubs_set_updated_at
before update on clubs
for each row
execute function set_updated_at();

create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  full_name text,
  aliases text[] not null default '{}',
  country text,
  birth_date date,
  position text,
  current_club_id uuid references clubs (id) on delete set null,
  image_id uuid references image_assets (id) on delete set null,
  external_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table players enable row level security;

create unique index players_slug_idx on players (slug);
create index players_aliases_idx on players using gin (aliases);
create index players_name_trgm_idx on players using gin (name extensions.gin_trgm_ops);
create index players_club_idx on players (current_club_id);

create trigger players_set_updated_at
before update on players
for each row
execute function set_updated_at();

create table transfers (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players (id) on delete cascade,
  from_club_id uuid references clubs (id) on delete set null,
  to_club_id uuid references clubs (id) on delete set null,
  status transfer_status not null default 'rumour',
  fee numeric(12, 2),
  currency text,
  season text,
  contract_until date,
  story_id uuid references stories (id) on delete set null,
  confirmed_at timestamptz,
  confirmed_by_source_id uuid references sources (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transfers_fee_requires_currency check (fee is null or currency is not null),
  constraint transfers_official_requires_source check (
    status <> 'official' or confirmed_by_source_id is not null
  )
);

alter table transfers enable row level security;

comment on table transfers is 'Baza transferowa. Publicznie widoczne tylko wpisy ze statusem official.';

create index transfers_player_idx on transfers (player_id, created_at desc);
create index transfers_status_idx on transfers (status);

-- Jeden oficjalny transfer zawodnika do danego klubu w sezonie.
create unique index transfers_official_unique_idx on transfers (player_id, to_club_id, season)
where status = 'official';

create trigger transfers_set_updated_at
before update on transfers
for each row
execute function set_updated_at();
