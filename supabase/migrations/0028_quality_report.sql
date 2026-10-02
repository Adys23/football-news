-- 0028_quality_report.sql
-- Dane dla raportu jakosci redakcji w panelu (/admin/jakosc). Redaktor czyta articles,
-- article_revisions i article_scores, ale powod odrzucenia jest tylko w audit_log, a koszt
-- tylko w llm_calls - obie tabele sa dla admina. Te funkcje (security definer) zwracaja
-- wylacznie pola i agregaty potrzebne raportowi: bez actor_id, bez tresci promptow, bez
-- bledow wywolan. audit_log, llm_calls i settings zostaja wprost niewidoczne dla redaktora.

-- Jeden wiersz na artykul, ktory raport moze policzyc w oknie od p_since: czekajacy na decyzje
-- (review lub approved, stan biezacy bez okna), opublikowany, odrzucony albo oceniony od p_since.
--
-- Klasyfikacja edycji opiera sie tylko na rewizjach redaktora (edited_by is not null).
-- save_article_edit zapisuje w rewizji stan sprzed zmiany, wiec stanem po zmianie jest
-- nastepna rewizja redaktora albo, dla ostatniej, biezacy wiersz articles. Rewizje modelu
-- (edited_by is null) sa pomijane: GENERATE_ARTICLE zapisuje w nich tytul historii, a nie
-- tytul z GENERATE_TITLE, wiec porownanie z nimi zawyzaloby edycje tytulu.
create function quality_report_articles(p_since timestamptz)
returns table (
  article_id uuid,
  title text,
  category_id uuid,
  status public.article_status,
  published_at timestamptz,
  rejected_at timestamptz,
  reject_reason text,
  editor_revisions int,
  title_edited boolean,
  lead_edited boolean,
  content_edited boolean,
  factual_accuracy numeric,
  originality numeric,
  seo numeric,
  clickbait numeric,
  quality numeric,
  unsupported_claims int,
  checked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_editor() then
    raise exception 'Raport jakosci jest dostepny tylko dla redakcji'
      using errcode = 'insufficient_privilege';
  end if;

  if p_since is null then
    raise exception 'Poczatek okna raportu jest wymagany'
      using errcode = 'invalid_parameter_value';
  end if;

  return query
  with rejections as (
    select distinct on (l.entity_id)
      l.entity_id as article_id,
      l.created_at as rejected_at,
      l.diff ->> 'reason' as reason
    from public.audit_log l
    where l.entity_type = 'article'
      and l.action = 'reject'
      and l.entity_id is not null
    order by l.entity_id, l.created_at desc, l.id desc
  ),
  selected as (
    select
      a.id,
      a.title,
      a.lead,
      a.content,
      a.category_id,
      a.status,
      a.published_at,
      a.created_at,
      case when a.status = 'rejected' then rj.rejected_at end as rejected_at,
      case when a.status = 'rejected' then rj.reason end as reject_reason,
      s.factual_accuracy,
      s.originality,
      s.seo,
      s.clickbait,
      s.quality,
      s.unsupported_claims,
      s.checked_at
    from public.articles a
    left join rejections rj on rj.article_id = a.id
    left join public.article_scores s on s.article_id = a.id
    where a.status in ('review', 'approved')
      or a.published_at >= p_since
      or (a.status = 'rejected' and rj.rejected_at >= p_since)
      or s.checked_at >= p_since
  ),
  revisions as (
    select
      r.article_id,
      r.title,
      r.lead,
      r.content,
      lead(r.id) over w as next_id,
      lead(r.title) over w as next_title,
      lead(r.lead) over w as next_lead,
      lead(r.content) over w as next_content
    from public.article_revisions r
    where r.edited_by is not null
      and r.article_id in (select sel.id from selected sel)
    window w as (partition by r.article_id order by r.created_at, r.id)
  ),
  edits as (
    select
      rv.article_id,
      count(*)::int as revisions,
      bool_or(
        rv.title is distinct from case when rv.next_id is null then sel.title else rv.next_title end
      ) as title_edited,
      bool_or(
        rv.lead is distinct from case when rv.next_id is null then sel.lead else rv.next_lead end
      ) as lead_edited,
      bool_or(
        rv.content is distinct from case when rv.next_id is null then sel.content else rv.next_content end
      ) as content_edited
    from revisions rv
    join selected sel on sel.id = rv.article_id
    group by rv.article_id
  )
  select
    sel.id,
    sel.title,
    sel.category_id,
    sel.status,
    sel.published_at,
    sel.rejected_at,
    sel.reject_reason,
    coalesce(e.revisions, 0),
    coalesce(e.title_edited, false),
    coalesce(e.lead_edited, false),
    coalesce(e.content_edited, false),
    sel.factual_accuracy::numeric,
    sel.originality::numeric,
    sel.seo::numeric,
    sel.clickbait::numeric,
    sel.quality::numeric,
    sel.unsupported_claims,
    sel.checked_at
  from selected sel
  left join edits e on e.article_id = sel.id
  order by sel.created_at desc, sel.id;
end;
$$;

-- Agregaty na kategorie. first_published_at liczone od poczatku (dni z redaktorem w petli),
-- koszt i liczby wywolan LLM od p_since. Kategoria wywolania to stories.category_id historii,
-- ktorej dotyczylo wywolanie; category_id null oznacza historie bez kategorii albo wywolanie
-- bez historii. Eskalacja nie ma flagi w llm_calls: liczymy wywolania modelu, ktory jest
-- teraz ustawiony jako settings.model_escalation (zmiana nazwy przeklamie historie).
create function quality_report_category_totals(p_since timestamptz)
returns table (
  category_id uuid,
  first_published_at timestamptz,
  llm_calls bigint,
  llm_cost_usd numeric,
  llm_unpriced_calls bigint,
  llm_failed_calls bigint,
  llm_escalated_calls bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_editor() then
    raise exception 'Raport jakosci jest dostepny tylko dla redakcji'
      using errcode = 'insufficient_privilege';
  end if;

  if p_since is null then
    raise exception 'Poczatek okna raportu jest wymagany'
      using errcode = 'invalid_parameter_value';
  end if;

  return query
  with first_published as (
    select a.category_id, min(a.published_at) as first_published_at
    from public.articles a
    where a.published_at is not null
    group by a.category_id
  ),
  escalation as (
    select st.value #>> '{}' as model
    from public.settings st
    where st.key = 'model_escalation'
  ),
  calls as (
    select
      s.category_id,
      count(*) as calls,
      sum(c.cost_usd)::numeric as cost_usd,
      count(*) filter (where c.cost_usd is null) as unpriced,
      count(*) filter (where not c.ok) as failed,
      count(*) filter (where c.model = (select esc.model from escalation esc)) as escalated
    from public.llm_calls c
    left join public.stories s on s.id = c.story_id
    where c.created_at >= p_since
    group by s.category_id
  ),
  keys as (
    select fp.category_id from first_published fp
    union
    select k.category_id from calls k
  )
  select
    keys.category_id,
    fp.first_published_at,
    coalesce(k.calls, 0),
    k.cost_usd,
    coalesce(k.unpriced, 0),
    coalesce(k.failed, 0),
    coalesce(k.escalated, 0)
  from keys
  left join first_published fp on fp.category_id is not distinct from keys.category_id
  left join calls k on k.category_id is not distinct from keys.category_id
  order by keys.category_id nulls last;
end;
$$;

revoke all on function quality_report_articles(timestamptz) from public, anon;
revoke all on function quality_report_category_totals(timestamptz) from public, anon;
grant execute on function quality_report_articles(timestamptz) to authenticated;
grant execute on function quality_report_category_totals(timestamptz) to authenticated;
