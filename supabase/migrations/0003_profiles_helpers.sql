-- 0003_profiles_helpers.sql
-- Uzytkownicy redakcji oraz funkcje pomocnicze uzywane przez polityki RLS.

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  role user_role not null default 'viewer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

comment on table profiles is 'Konta redakcji. Rola decyduje o dostepie w panelu i w politykach RLS.';

-- Wspolny trigger aktualizujacy updated_at.
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on profiles
for each row
execute function set_updated_at();

-- Helpery do polityk RLS.
-- SECURITY DEFINER jest tu konieczne: polityka na profiles wywolujaca zapytanie
-- do profiles weszlaby w rekurencje. Puste search_path wymusza pelne kwalifikowanie nazw.
create or replace function is_editor() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active
      and p.role in ('admin', 'editor')
  );
$$;

create or replace function is_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active
      and p.role = 'admin'
  );
$$;

-- Normalizacja tytulu do porownan. Wersja SQL sluzy zapytaniom pomocniczym i testom;
-- ingestion zapisuje te sama wartosc wyliczona w TypeScript (_shared/lib/hash.ts).
create or replace function normalize_title(p_title text) returns text
language sql
stable
as $$
  select trim(
    regexp_replace(
      lower(extensions.unaccent(coalesce(p_title, ''))),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;
