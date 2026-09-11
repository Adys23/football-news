-- 0011_articles.sql
-- Artykuly i ich satelity. Kluczowa decyzja: jedna historia = jeden artykul.
-- Nowe informacje to aktualizacja (article_updates), nigdy drugi tekst.

create table articles (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories (id) on delete cascade,
  title text not null,
  slug text not null,
  lead text,
  -- Tresc jako bloki JSON, nie HTML. Walidowana schematem zod przed zapisem.
  content jsonb not null default '{"version": 1, "blocks": []}'::jsonb,
  excerpt text,
  seo_title text,
  seo_description text,
  canonical_url text,
  status article_status not null default 'draft',
  author_id uuid references authors (id) on delete set null,
  category_id uuid references categories (id) on delete set null,
  hero_image_id uuid references image_assets (id) on delete set null,
  ai_generated boolean not null default true,
  model_used text,
  prompt_version text,
  approved_by uuid references profiles (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint articles_title_length check (char_length(title) <= 90),
  constraint articles_seo_title_length check (
    seo_title is null or char_length(seo_title) <= 70
  ),
  constraint articles_seo_description_length check (
    seo_description is null or char_length(seo_description) between 120 and 165
  ),
  constraint articles_content_has_blocks check (jsonb_typeof(content -> 'blocks') = 'array')
);

alter table articles enable row level security;

comment on table articles is 'Opublikowalny tekst opisujacy jedna historie. Relacja do stories jest 1:1.';
comment on column articles.content is 'Bloki JSON: paragraph, heading, quote, image, list, fact_box.';

-- Jedna historia, jeden artykul. To techniczne wymuszenie zasady redakcyjnej.
create unique index articles_story_idx on articles (story_id);
create unique index articles_slug_idx on articles (slug);
create index articles_status_published_idx on articles (status, published_at desc);
create index articles_category_idx on articles (category_id, published_at desc);
create index articles_public_feed_idx on articles (published_at desc) where status = 'published';

create trigger articles_set_updated_at
before update on articles
for each row
execute function set_updated_at();

-- Timeline aktualizacji: "09:00 zainteresowany, 11:00 rozmowy, 14:00 oferta".
create table article_updates (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles (id) on delete cascade,
  body text not null,
  fact_ids uuid[] not null default '{}',
  approved_by uuid references profiles (id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table article_updates enable row level security;

create index article_updates_article_idx on article_updates (article_id, published_at desc);

-- Wynik automatycznej kontroli jakosci.
create table article_scores (
  article_id uuid primary key references articles (id) on delete cascade,
  factual_accuracy numeric(3, 2),
  originality numeric(3, 2),
  seo numeric(3, 2),
  clickbait numeric(3, 2),
  quality numeric(3, 2),
  unsupported_claims int not null default 0,
  issues jsonb not null default '[]'::jsonb,
  model_used text,
  prompt_version text,
  checked_at timestamptz not null default now(),
  constraint article_scores_unsupported_not_negative check (unsupported_claims >= 0)
);

alter table article_scores enable row level security;

-- Snapshot przed kazda zmiana. Podstawa do policzenia, ile poprawia redaktor.
create table article_revisions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles (id) on delete cascade,
  title text,
  lead text,
  content jsonb,
  -- null oznacza wersje wygenerowana przez model.
  edited_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table article_revisions enable row level security;

create index article_revisions_article_idx on article_revisions (article_id, created_at desc);

-- Automatyczne linkowanie wewnetrzne artykul - zawodnik/klub/liga.
create table article_entities (
  article_id uuid not null references articles (id) on delete cascade,
  entity_type entity_type not null,
  entity_id uuid not null,
  role text not null default 'mentioned',
  primary key (article_id, entity_type, entity_id),
  constraint article_entities_role_known check (role in ('main', 'mentioned'))
);

alter table article_entities enable row level security;

create index article_entities_entity_idx on article_entities (entity_type, entity_id);

-- Slug nie zmienia sie po publikacji. Gdy musi, stary adres dostaje 301.
create table article_redirects (
  old_slug text primary key,
  article_id uuid not null references articles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table article_redirects enable row level security;

-- Techniczne wymuszenie zasady "czlowiek w petli".
-- Zadna sciezka w kodzie nie moze opublikowac artykulu bez akceptacji redaktora
-- ani takiego, ktory zawiera twierdzenia bez podparcia w faktach.
create or replace function enforce_publish_guard() returns trigger
language plpgsql
as $$
begin
  if new.status = 'published' then
    if new.approved_by is null then
      raise exception 'Artykul % nie moze zostac opublikowany bez akceptacji redaktora', new.id
        using errcode = 'check_violation';
    end if;

    if exists (
      select 1
      from article_scores s
      where s.article_id = new.id
        and s.unsupported_claims > 0
    ) then
      raise exception 'Artykul % zawiera twierdzenia bez podparcia w faktach', new.id
        using errcode = 'check_violation';
    end if;

    new.published_at := coalesce(new.published_at, now());
  end if;

  return new;
end;
$$;

create trigger articles_publish_guard
before insert or update of status on articles
for each row
execute function enforce_publish_guard();
