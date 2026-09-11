-- 0005_source_items.sql
-- Pojedyncze informacje pobrane ze zrodel. Material roboczy, nie tresc publikowana.

create table source_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources (id) on delete cascade,
  external_id text,
  url text not null,
  title text not null,
  -- Tytul bez znakow diakrytycznych, malymi literami, bez interpunkcji.
  -- Wypelniany przez ingestion (_shared/lib/hash.ts), baza do porownan trigramowych.
  title_normalized text not null,
  content text,
  author text,
  published_at timestamptz,
  -- sha256(url + title_normalized). Pierwsza, najtansza bariera duplikatow.
  hash text not null,
  raw_data jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table source_items enable row level security;

comment on table source_items is 'Surowe informacje ze zrodel. raw_data podlega retencji 30 dni.';

create unique index source_items_hash_idx on source_items (hash);

create unique index source_items_external_idx on source_items (source_id, external_id)
where external_id is not null;

-- Podobienstwo tytulow w deduplikacji.
create index source_items_title_trgm_idx on source_items
using gin (title_normalized extensions.gin_trgm_ops);

create index source_items_published_idx on source_items (published_at desc);

-- Kolejka do przetworzenia.
create index source_items_unprocessed_idx on source_items (created_at)
where processed_at is null;
