-- 0023_article_slug_redirects.sql
-- Slug nie zmienia sie po publikacji, a gdy musi, stary adres dostaje 301
-- (docs/architecture.md §8.1). Wpis w article_redirects robi trigger, a nie osoba
-- zmieniajaca slug, wiec zadna sciezka zmiany nie zostawi martwego adresu.
--
-- Wpis wskazuje artykul (article_id), nie docelowy slug. Strona czyta aktualny slug
-- i kategorie artykulu przy obsludze starego adresu, wiec A -> B -> C daje dwa wpisy
-- (A i B) wskazujace ten sam artykul i jeden skok na C, bez lancucha przekierowan.
-- Kategoria nie potrzebuje wpisu: strona szuka artykulu po samym slugu i sama
-- przekierowuje na sciezke kanoniczna, gdy kategoria w adresie jest nieaktualna.
--
-- Trigger dziala jako definer: zmiana sluga z sesji redaktora nie moze sie wywrocic
-- na RLS article_redirects, a pipeline (service_role) i tak omija RLS.

create or replace function record_article_slug_redirect() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.slug is not distinct from new.slug then
    return null;
  end if;

  -- Powrot do starego sluga: adres znow jest kanoniczny i nie moze przekierowywac.
  delete from public.article_redirects
  where old_slug = new.slug
    and article_id = new.id;

  -- Adresy szkicow nigdy nie byly publiczne. published_at zostaje po wycofaniu
  -- (archived), a zarchiwizowany adres mogl zostac zaindeksowany.
  if old.status = 'published' or old.published_at is not null then
    -- Slug zwolniony wczesniej przez inny artykul wskazuje odtad na ostatniego wlasciciela.
    insert into public.article_redirects (old_slug, article_id)
    values (old.slug, new.id)
    on conflict (old_slug) do update
    set article_id = excluded.article_id,
        created_at = now();
  end if;

  return null;
end;
$$;

revoke all on function record_article_slug_redirect() from public, anon, authenticated;

create trigger articles_record_slug_redirect
after update of slug on articles
for each row
execute function record_article_slug_redirect();
