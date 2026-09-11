-- 0009_media.sql
-- Bez uporzadkowanych praw do zdjec nie da sie prowadzic prawdziwego portalu,
-- dlatego licencja i alt sa wymagane od pierwszego dnia.

create table image_assets (
  id uuid primary key default gen_random_uuid(),
  kind image_kind not null default 'hero',
  storage_path text,
  url text not null,
  source text not null,
  license text not null,
  photographer text,
  copyright text,
  width int not null,
  height int not null,
  alt text not null,
  -- Zdjec zawodnikow nie generujemy. Flaga sluzy do audytu, nie do obchodzenia zasady.
  is_ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  constraint image_assets_alt_not_empty check (length(btrim(alt)) > 0),
  constraint image_assets_license_not_empty check (length(btrim(license)) > 0),
  constraint image_assets_dimensions_positive check (width > 0 and height > 0),
  -- Wymog Discover dotyczy obrazu glownego artykulu. Loga klubow i portrety
  -- sa z natury mniejsze, wiec ograniczenie jest warunkowe.
  constraint image_assets_hero_min_width check (kind <> 'hero' or width >= 1200)
);

alter table image_assets enable row level security;

comment on table image_assets is 'Biblioteka obrazow z prawami. kind = hero wymaga minimum 1200 px szerokosci.';

create index image_assets_kind_idx on image_assets (kind, created_at desc);

-- Bucket na obrazy artykulow. Publiczny do czytania, zapis tylko przez service_role.
insert into storage.buckets (id, name, public)
values ('article-images', 'article-images', true)
on conflict (id) do nothing;
