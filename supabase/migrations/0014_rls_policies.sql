-- 0014_rls_policies.sql
-- Zasada domyslna: brak dostepu. Uprawnienia dodajemy wybiorczo.
-- service_role ma bypassrls i nie potrzebuje polityk - pipeline dziala wlasnie nim.
-- Warstwa produkcyjna (sources, source_items, stories, facts, jobs, llm_calls)
-- jest calkowicie niewidoczna dla uzytkownika anonimowego.

-- === Profile ===

create policy "profiles_select_self" on profiles
for select to authenticated
using (id = auth.uid() or is_admin());

create policy "profiles_update_self" on profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = (select p.role from profiles p where p.id = auth.uid()));

create policy "profiles_admin_all" on profiles
for all to authenticated
using (is_admin())
with check (is_admin());

-- === Tresci publiczne ===

create policy "articles_select_published" on articles
for select to anon, authenticated
using (status = 'published');

create policy "articles_editor_select" on articles
for select to authenticated
using (is_editor());

create policy "articles_editor_update" on articles
for update to authenticated
using (is_editor())
with check (is_editor());

create policy "article_updates_select_published" on article_updates
for select to anon, authenticated
using (
  exists (
    select 1 from articles a
    where a.id = article_updates.article_id
      and a.status = 'published'
  )
);

create policy "article_updates_editor_all" on article_updates
for all to authenticated
using (is_editor())
with check (is_editor());

-- Linkowanie wewnetrzne na stronach publicznych wymaga tej tabeli.
-- Nie ma w niej nic wrazliwego - tylko powiazanie artykulu z encja.
create policy "article_entities_select_published" on article_entities
for select to anon, authenticated
using (
  exists (
    select 1 from articles a
    where a.id = article_entities.article_id
      and a.status = 'published'
  )
);

create policy "article_entities_editor_all" on article_entities
for all to authenticated
using (is_editor())
with check (is_editor());

-- Potrzebne do obslugi przekierowan 301 po zmianie sluga.
create policy "article_redirects_select_public" on article_redirects
for select to anon, authenticated
using (true);

create policy "article_redirects_editor_all" on article_redirects
for all to authenticated
using (is_editor())
with check (is_editor());

create policy "authors_select_public" on authors
for select to anon, authenticated
using (active);

create policy "authors_admin_all" on authors
for all to authenticated
using (is_admin())
with check (is_admin());

create policy "categories_select_public" on categories
for select to anon, authenticated
using (true);

create policy "categories_admin_all" on categories
for all to authenticated
using (is_admin())
with check (is_admin());

create policy "image_assets_select_public" on image_assets
for select to anon, authenticated
using (true);

create policy "image_assets_editor_all" on image_assets
for all to authenticated
using (is_editor())
with check (is_editor());

-- === Encje sportowe ===

create policy "leagues_select_public" on leagues
for select to anon, authenticated
using (true);

create policy "leagues_admin_all" on leagues
for all to authenticated
using (is_admin())
with check (is_admin());

create policy "clubs_select_public" on clubs
for select to anon, authenticated
using (true);

create policy "clubs_admin_all" on clubs
for all to authenticated
using (is_admin())
with check (is_admin());

create policy "players_select_public" on players
for select to anon, authenticated
using (true);

create policy "players_admin_all" on players
for all to authenticated
using (is_admin())
with check (is_admin());

-- Publicznie widoczne tylko transfery oficjalnie potwierdzone.
-- Plotka transferowa nie jest danymi, ktore chcemy podawac jako baze wiedzy.
create policy "transfers_select_official" on transfers
for select to anon, authenticated
using (status = 'official');

create policy "transfers_editor_select" on transfers
for select to authenticated
using (is_editor());

create policy "transfers_editor_write" on transfers
for all to authenticated
using (is_editor())
with check (is_editor());

-- === Warstwa produkcyjna: tylko redakcja ===

create policy "sources_editor_select" on sources
for select to authenticated
using (is_editor());

create policy "sources_admin_write" on sources
for all to authenticated
using (is_admin())
with check (is_admin());

create policy "source_items_editor_select" on source_items
for select to authenticated
using (is_editor());

create policy "stories_editor_select" on stories
for select to authenticated
using (is_editor());

create policy "stories_editor_update" on stories
for update to authenticated
using (is_editor())
with check (is_editor());

create policy "story_sources_editor_select" on story_sources
for select to authenticated
using (is_editor());

create policy "story_sources_editor_write" on story_sources
for all to authenticated
using (is_editor())
with check (is_editor());

create policy "facts_editor_select" on facts
for select to authenticated
using (is_editor());

create policy "story_assessments_editor_select" on story_assessments
for select to authenticated
using (is_editor());

create policy "article_scores_editor_select" on article_scores
for select to authenticated
using (is_editor());

create policy "article_revisions_editor_select" on article_revisions
for select to authenticated
using (is_editor());

create policy "article_revisions_editor_insert" on article_revisions
for insert to authenticated
with check (is_editor());

-- === Operacje: tylko admin ===

create policy "jobs_admin_select" on jobs
for select to authenticated
using (is_admin());

create policy "llm_calls_admin_select" on llm_calls
for select to authenticated
using (is_admin());

create policy "settings_admin_all" on settings
for all to authenticated
using (is_admin())
with check (is_admin());

create policy "audit_log_admin_select" on audit_log
for select to authenticated
using (is_admin());

-- === Storage ===

create policy "article_images_public_read" on storage.objects
for select to anon, authenticated
using (bucket_id = 'article-images');

create policy "article_images_editor_write" on storage.objects
for all to authenticated
using (bucket_id = 'article-images' and is_editor())
with check (bucket_id = 'article-images' and is_editor());
