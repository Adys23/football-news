-- 0006_taxonomy.sql
-- Autorzy i kategorie. Autorem publikowanego artykulu jest zawsze realna osoba z redakcji.

create table authors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles (id) on delete set null,
  name text not null,
  slug text not null,
  bio text,
  role_title text,
  avatar_url text,
  x_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table authors enable row level security;

comment on table authors is 'Redaktorzy widoczni publicznie. Wymagane pod E-E-A-T i uczciwosc wobec czytelnika.';

create unique index authors_slug_idx on authors (slug);

create trigger authors_set_updated_at
before update on authors
for each row
execute function set_updated_at();

create table categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references categories (id) on delete set null,
  name text not null,
  slug text not null,
  description text,
  seo_title text,
  seo_description text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table categories enable row level security;

create unique index categories_slug_idx on categories (slug);

create trigger categories_set_updated_at
before update on categories
for each row
execute function set_updated_at();
