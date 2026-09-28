-- 0020_save_article_edit.sql
-- Edycja artykulu przez redaktora w jednej transakcji: snapshot wersji sprzed zmiany
-- w article_revisions i aktualizacja articles. Osobne zapytania z panelu zostawialy
-- okno, w ktorym audit_log mial wpis edit bez edycji albo edycja nie miala snapshotu.
--
-- Funkcja dziala jako invoker, wiec obowiazuja polityki RLS redaktora.
-- Edytowalny jest tylko status review: draft nalezy do pipeline'u, ktory nadpisalby
-- prace redaktora, a zmiana opublikowanego tekstu idzie przez article_updates.
--
-- Kody bledow dla panelu:
--   42501 - brak roli redaktora,
--   P0002 - artykul nie istnieje,
--   55000 - artykul nie jest w statusie review,
--   40001 - ktos zapisal artykul po otwarciu formularza (p_expected_updated_at).

create or replace function save_article_edit(
  p_article_id uuid,
  p_expected_updated_at timestamptz,
  p_title text,
  p_lead text,
  p_content jsonb
) returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_current record;
  v_updated_at timestamptz;
begin
  if not public.is_editor() then
    raise exception 'Tylko redaktor moze edytowac artykul'
      using errcode = 'insufficient_privilege';
  end if;

  select title, lead, content, status, updated_at
  into v_current
  from public.articles
  where id = p_article_id
  for update;

  if not found then
    raise exception 'Artykul % nie istnieje', p_article_id
      using errcode = 'no_data_found';
  end if;

  if v_current.status <> 'review' then
    raise exception 'Artykul % ma status %, edytowac mozna tylko review', p_article_id, v_current.status
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'Artykul % zostal zmieniony po otwarciu formularza', p_article_id
      using errcode = 'serialization_failure';
  end if;

  -- Zapis bez zmian nie jest edycja: brak rewizji i wpisu w audit_log.
  if v_current.title = p_title
    and v_current.lead is not distinct from p_lead
    and v_current.content = p_content then
    return v_current.updated_at;
  end if;

  insert into public.article_revisions (article_id, title, lead, content, edited_by)
  values (p_article_id, v_current.title, v_current.lead, v_current.content, auth.uid());

  update public.articles
  set title = p_title,
      lead = p_lead,
      content = p_content
  where id = p_article_id
  returning updated_at into v_updated_at;

  return v_updated_at;
end;
$$;

revoke all on function save_article_edit(uuid, timestamptz, text, text, jsonb) from public, anon;
grant execute on function save_article_edit(uuid, timestamptz, text, text, jsonb) to authenticated;
