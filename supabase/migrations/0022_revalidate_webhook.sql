-- 0022_revalidate_webhook.sql
-- Webhook publikacji (docs/architecture.md §7): zmiana widocznej tresci artykulu
-- wysyla POST na /api/revalidate strony, ktora uniewaznia tagi cache.
--
-- Zamiast Database Webhooka z dashboardu Supabase - wlasny trigger z pg_net.
-- Dashboard zapisuje URL i naglowki (czyli sekret) w definicji triggera, a tu URL
-- i sekret czytamy z Vault w chwili wywolania, jak zaklada docs/database.md dla 0015:
--   select vault.create_secret('https://<strona>/api/revalidate', 'revalidate_webhook_url');
--   select vault.create_secret('<REVALIDATE_WEBHOOK_SECRET>', 'revalidate_webhook_secret');
--
-- Webhook nie moze blokowac publikacji. Brak pg_net, Vault albo sekretow to cichy
-- brak wywolania (raise log), a blad pg_net to ostrzezenie, nigdy rollback.
-- pg_net kolejkuje zadanie w tej samej transakcji i wysyla je dopiero po commicie,
-- wiec wycofana publikacja nie uniewaznia cache.

-- pg_net jest w shared_preload_libraries obrazu Supabase, ale nie zawsze zainstalowany.
-- Jak pg_cron w 0001: brak rozszerzenia nie blokuje migracji.
do $$
begin
  execute 'create extension if not exists pg_net with schema extensions';
exception
  when others then
    raise warning 'pg_net niedostepny (%). Webhook publikacji nie bedzie wysylany.', sqlerrm;
end;
$$;

create or replace function send_revalidate_webhook(p_payload jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null then
    raise log 'revalidate webhook: pg_net niedostepny, pomijam';
    return;
  end if;

  if to_regclass('vault.decrypted_secrets') is null then
    raise log 'revalidate webhook: Vault niedostepny, pomijam';
    return;
  end if;

  select
    max(s.decrypted_secret) filter (where s.name = 'revalidate_webhook_url'),
    max(s.decrypted_secret) filter (where s.name = 'revalidate_webhook_secret')
  into v_url, v_secret
  from vault.decrypted_secrets s
  where s.name in ('revalidate_webhook_url', 'revalidate_webhook_secret');

  if coalesce(btrim(v_url), '') = '' or coalesce(v_secret, '') = '' then
    raise log 'revalidate webhook: brak sekretow w Vault, pomijam';
    return;
  end if;

  perform net.http_post(
    url := btrim(v_url),
    body := p_payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_secret
    ),
    timeout_milliseconds := 5000
  );
exception
  when others then
    -- Bez sekretu w komunikacie: sqlerrm z pg_net zawiera najwyzej URL.
    raise warning 'Webhook publikacji nie zostal zakolejkowany (%)', sqlerrm;
end;
$$;

revoke all on function send_revalidate_webhook(jsonb) from public, anon, authenticated;

-- Wejscie do published, wyjscie z niego, usuniecie opublikowanego i kazda zmiana
-- opublikowanego wiersza poza samym updated_at (set_updated_at podbija je przy
-- kazdym update, wiec no-op update nie wysyla webhooka).
create or replace function articles_revalidate_webhook() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was_published boolean := tg_op <> 'INSERT' and old.status = 'published';
  v_is_published boolean := tg_op <> 'DELETE' and new.status = 'published';
  v_event text;
  v_slug text;
  v_previous_slug text;
  v_category_id uuid;
  v_previous_category_id uuid;
begin
  if not v_was_published and not v_is_published then
    return null;
  end if;

  if tg_op = 'UPDATE' and (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
    return null;
  end if;

  v_event := case
    when not v_was_published then 'publish'
    when not v_is_published then 'unpublish'
    else 'update'
  end;

  if tg_op = 'DELETE' then
    v_slug := old.slug;
    v_category_id := old.category_id;
  else
    v_slug := new.slug;
    v_category_id := new.category_id;
  end if;

  if tg_op = 'UPDATE' then
    if old.slug is distinct from new.slug then
      v_previous_slug := old.slug;
    end if;
    if old.category_id is distinct from new.category_id then
      v_previous_category_id := old.category_id;
    end if;
  end if;

  perform public.send_revalidate_webhook(jsonb_build_object(
    'event', v_event,
    'slug', v_slug,
    'previous_slug', v_previous_slug,
    'category_slug', (select c.slug from public.categories c where c.id = v_category_id),
    'previous_category_slug', (select c.slug from public.categories c where c.id = v_previous_category_id)
  ));

  return null;
end;
$$;

revoke all on function articles_revalidate_webhook() from public, anon, authenticated;

create trigger articles_revalidate_webhook
after insert or update or delete on articles
for each row
execute function articles_revalidate_webhook();

-- Strona artykulu pokazuje blok "Aktualizacja" (docs/architecture.md §7), wiec wpis
-- w article_updates opublikowanego artykulu uniewaznia te same tagi.
create or replace function article_updates_revalidate_webhook() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text;
  v_category_slug text;
begin
  select a.slug, c.slug
  into v_slug, v_category_slug
  from public.articles a
  left join public.categories c on c.id = a.category_id
  where a.id = case when tg_op = 'DELETE' then old.article_id else new.article_id end
    and a.status = 'published';

  if not found then
    return null;
  end if;

  perform public.send_revalidate_webhook(jsonb_build_object(
    'event', 'update',
    'slug', v_slug,
    'previous_slug', null,
    'category_slug', v_category_slug,
    'previous_category_slug', null
  ));

  return null;
end;
$$;

revoke all on function article_updates_revalidate_webhook() from public, anon, authenticated;

create trigger article_updates_revalidate_webhook
after insert or update or delete on article_updates
for each row
execute function article_updates_revalidate_webhook();
