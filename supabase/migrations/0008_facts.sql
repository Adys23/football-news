-- 0008_facts.sql
-- Strukturalne fakty i ocena informacji. To fakty, nie tresc zrodla,
-- sa wejsciem do generowania artykulu.

create table facts (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories (id) on delete cascade,
  subject text not null,
  predicate text not null,
  object text,
  -- Dane liczbowe i daty: kwota, waluta, contract_until.
  value jsonb,
  -- Fakt zapisany zdaniem po polsku; to trafia do promptu pisania.
  statement_pl text not null,
  confidence numeric(3, 2) not null,
  source_id uuid references sources (id) on delete set null,
  source_item_id uuid references source_items (id) on delete set null,
  verified boolean not null default false,
  superseded_by uuid references facts (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint facts_confidence_range check (confidence >= 0 and confidence <= 1)
);

alter table facts enable row level security;

comment on table facts is 'Fakty w formacie podmiot-orzeczenie-dopelnienie z przypisanym zrodlem.';

create index facts_story_predicate_idx on facts (story_id, predicate);

-- Ten sam fakt z tego samego zrodla zapisujemy raz.
create unique index facts_unique_per_source_idx on facts (
  story_id, subject, predicate, coalesce(object, ''), coalesce(source_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

create table story_assessments (
  story_id uuid primary key references stories (id) on delete cascade,
  publishability publishability not null,
  confidence numeric(3, 2) not null,
  -- Lista sprzecznosci miedzy zrodlami, z waga (low/medium/high).
  conflicts jsonb not null default '[]'::jsonb,
  -- Tylko te fakty trafiaja do generowania artykulu.
  approved_fact_ids uuid[] not null default '{}',
  reasoning text,
  model_used text,
  prompt_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint story_assessments_confidence_range check (confidence >= 0 and confidence <= 1)
);

alter table story_assessments enable row level security;

create trigger story_assessments_set_updated_at
before update on story_assessments
for each row
execute function set_updated_at();
