-- 0002_enums.sql
-- Wszystkie typy wyliczeniowe w jednym miejscu. Nowa wartosc = nowa migracja z alter type.

-- Charakter zrodla. Decyduje o pulapie trust_score (patrz 0004).
create type source_type as enum (
  'official_club',
  'official_league',
  'official_federation',
  'journalist',
  'major_outlet',
  'local_outlet',
  'aggregator',
  'social'
);

-- Mechanizm pobierania. W MVP uzywamy wylacznie rss i json_api.
create type source_kind as enum ('rss', 'json_api', 'html');

-- Cykl zycia wydarzenia.
create type story_status as enum (
  'new',
  'clustering',
  'extracting',
  'validating',
  'drafting',
  'review',
  'approved',
  'published',
  'rejected',
  'blocked'
);

-- Cykl zycia artykulu.
create type article_status as enum (
  'draft',
  'review',
  'approved',
  'published',
  'rejected',
  'archived'
);

-- Wynik oceny faktow (etap VALIDATE_FACTS).
create type publishability as enum ('auto', 'review', 'reject');

-- Typy zadan w kolejce. GENERATE_IMAGE, UPDATE_ARTICLE i GENERATE_EMBEDDING
-- nie maja handlerow w MVP - sa tu, zeby nie zmieniac enuma pozniej.
create type job_type as enum (
  'FETCH_SOURCE',
  'PROCESS_STORY',
  'EXTRACT_FACTS',
  'VALIDATE_FACTS',
  'GENERATE_ARTICLE',
  'GENERATE_TITLE',
  'GENERATE_SEO',
  'CHECK_ARTICLE',
  'PUBLISH_ARTICLE',
  'GENERATE_IMAGE',
  'UPDATE_ARTICLE',
  'GENERATE_EMBEDDING'
);

create type job_status as enum ('queued', 'running', 'done', 'failed', 'dead', 'cancelled');

create type user_role as enum ('admin', 'editor', 'viewer');

create type entity_type as enum ('player', 'club', 'league');

-- Stan transferu, od plotki do oficjalnego potwierdzenia.
create type transfer_status as enum (
  'rumour',
  'interest',
  'negotiations',
  'agreement',
  'medical',
  'official',
  'failed'
);

-- Przeznaczenie obrazu. Decyduje o wymogu minimalnej szerokosci (patrz 0009).
create type image_kind as enum ('hero', 'logo', 'portrait');
