-- seed.sql
-- Dane startowe dla srodowiska lokalnego. Uruchamiane przez `supabase db reset`.
--
-- Konta redakcyjne (tylko lokalnie):
--   redaktor@local.test / redaktor123 - admin
--   edytor@local.test / edytor123 - editor
--   czytelnik@local.test / czytelnik123 - viewer (loguje sie, ale nie ma dostepu do panelu)
-- Identyfikatory sa deterministyczne, zeby testy mogly sie do nich odwolywac.

-- === Konta redakcji ===

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated',
  'authenticated',
  'redaktor@local.test',
  extensions.crypt('redaktor123', extensions.gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"display_name": "Redaktor Lokalny"}'::jsonb,
  now(),
  now(),
  false,
  false
) on conflict (id) do nothing;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  is_sso_user,
  is_anonymous
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111112',
    'authenticated',
    'authenticated',
    'edytor@local.test',
    extensions.crypt('edytor123', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"display_name": "Edytor Lokalny"}'::jsonb,
    now(),
    now(),
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111113',
    'authenticated',
    'authenticated',
    'czytelnik@local.test',
    extensions.crypt('czytelnik123', extensions.gen_salt('bf')),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"display_name": "Czytelnik Lokalny"}'::jsonb,
    now(),
    now(),
    false,
    false
  )
on conflict (id) do nothing;

insert into auth.identities (
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) values (
  '11111111-1111-4111-8111-111111111111',
  jsonb_build_object(
    'sub', '11111111-1111-4111-8111-111111111111',
    'email', 'redaktor@local.test',
    'email_verified', true
  ),
  'email',
  'redaktor@local.test',
  now(),
  now(),
  now()
) on conflict (provider, provider_id) do nothing;

insert into auth.identities (
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) values
  (
    '11111111-1111-4111-8111-111111111112',
    jsonb_build_object('sub', '11111111-1111-4111-8111-111111111112', 'email', 'edytor@local.test', 'email_verified', true),
    'email',
    'edytor@local.test',
    now(),
    now(),
    now()
  ),
  (
    '11111111-1111-4111-8111-111111111113',
    jsonb_build_object('sub', '11111111-1111-4111-8111-111111111113', 'email', 'czytelnik@local.test', 'email_verified', true),
    'email',
    'czytelnik@local.test',
    now(),
    now(),
    now()
  )
on conflict (provider, provider_id) do nothing;

insert into profiles (id, email, display_name, role) values
  ('11111111-1111-4111-8111-111111111111', 'redaktor@local.test', 'Redaktor Lokalny', 'admin'),
  ('11111111-1111-4111-8111-111111111112', 'edytor@local.test', 'Edytor Lokalny', 'editor'),
  ('11111111-1111-4111-8111-111111111113', 'czytelnik@local.test', 'Czytelnik Lokalny', 'viewer')
on conflict (id) do nothing;

insert into authors (id, profile_id, name, slug, role_title, bio) values
  (
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    'Redaktor Lokalny',
    'redaktor-lokalny',
    'Redaktor prowadzacy',
    'Konto redakcyjne uzywane w srodowisku lokalnym.'
  )
on conflict (id) do nothing;

-- === Kategorie ===

insert into categories (id, name, slug, description, position) values
  (
    '33333333-3333-4333-8333-333333333331',
    'Transfery',
    'transfery',
    'Transfery, negocjacje i oficjalne potwierdzenia klubow.',
    1
  ),
  (
    '33333333-3333-4333-8333-333333333332',
    'Pilka nozna',
    'pilka-nozna',
    'Wydarzenia z boisk, kontuzje, kontrakty i wyniki.',
    2
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'Ekstraklasa',
    'ekstraklasa',
    'Polska Ekstraklasa.',
    3
  )
on conflict (id) do nothing;

-- === Ligi i kluby ===
-- aliases sa uzywane przez deduplikacje: "Red Devils" i "United" to ten sam klub.

insert into leagues (id, name, slug, country, tier) values
  ('44444444-4444-4444-8444-444444444441', 'Premier League', 'premier-league', 'en', 1),
  ('44444444-4444-4444-8444-444444444442', 'Ekstraklasa', 'ekstraklasa-liga', 'pl', 1),
  ('44444444-4444-4444-8444-444444444443', 'LaLiga', 'laliga', 'es', 1)
on conflict (id) do nothing;

insert into clubs (id, name, slug, short_name, aliases, country, league_id) values
  (
    '55555555-5555-4555-8555-555555555551',
    'Manchester United',
    'manchester-united',
    'Man United',
    array['Man United', 'Man Utd', 'United', 'Red Devils', 'Czerwone Diably'],
    'en',
    '44444444-4444-4444-8444-444444444441'
  ),
  (
    '55555555-5555-4555-8555-555555555552',
    'Arsenal',
    'arsenal',
    'Arsenal',
    array['Gunners', 'Kanonierzy'],
    'en',
    '44444444-4444-4444-8444-444444444441'
  ),
  (
    '55555555-5555-4555-8555-555555555553',
    'Lech Poznan',
    'lech-poznan',
    'Lech',
    array['Lech', 'Kolejorz'],
    'pl',
    '44444444-4444-4444-8444-444444444442'
  ),
  (
    '55555555-5555-4555-8555-555555555554',
    'Legia Warszawa',
    'legia-warszawa',
    'Legia',
    array['Legia', 'Wojskowi'],
    'pl',
    '44444444-4444-4444-8444-444444444442'
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    'FC Barcelona',
    'fc-barcelona',
    'Barcelona',
    array['Barca', 'Barcelona', 'Blaugrana'],
    'es',
    '44444444-4444-4444-8444-444444444443'
  )
on conflict (id) do nothing;

insert into players (id, name, slug, full_name, aliases, country, position, current_club_id) values
  (
    '66666666-6666-4666-8666-666666666661',
    'Robert Lewandowski',
    'robert-lewandowski',
    'Robert Lewandowski',
    array['Lewandowski', 'Lewy'],
    'pl',
    'napastnik',
    '55555555-5555-4555-8555-555555555555'
  ),
  (
    '66666666-6666-4666-8666-666666666662',
    'Bruno Fernandes',
    'bruno-fernandes',
    'Bruno Miguel Borges Fernandes',
    array['Fernandes', 'Bruno'],
    'pt',
    'pomocnik',
    '55555555-5555-4555-8555-555555555551'
  )
on conflict (id) do nothing;

-- === Zrodla ===
--
-- Zrodla oznaczone jako nieaktywne wymagaja weryfikacji adresu feedu przed
-- wlaczeniem (etap 1 roadmapy, skill add-source). Nie zgadujemy adresow -
-- martwy feed to falszywe alarmy w circuit breakerze.

insert into sources (name, url, rss_url, kind, type, trust_score, language, country, active) values
  (
    'BBC Sport Football',
    'https://www.bbc.com/sport/football',
    'https://feeds.bbci.co.uk/sport/football/rss.xml',
    'rss',
    'major_outlet',
    0.85,
    'en',
    'international',
    true
  ),
  (
    'The Guardian Football',
    'https://www.theguardian.com/football',
    'https://www.theguardian.com/football/rss',
    'rss',
    'major_outlet',
    0.85,
    'en',
    'international',
    true
  ),
  (
    'Sky Sports Football',
    'https://www.skysports.com/football',
    'https://www.skysports.com/rss/12040',
    'rss',
    'major_outlet',
    0.80,
    'en',
    'international',
    true
  ),
  (
    'ESPN Soccer',
    'https://www.espn.com/soccer/',
    'https://www.espn.com/espn/rss/soccer/news',
    'rss',
    'major_outlet',
    0.80,
    'en',
    'international',
    true
  ),
  (
    'UEFA',
    'https://www.uefa.com',
    'https://www.uefa.com/rssfeed/news/rss.xml',
    'rss',
    'official_federation',
    1.00,
    'en',
    'international',
    true
  ),
  (
    'Goal.com',
    'https://www.goal.com',
    'https://www.goal.com/feeds/en/news',
    'rss',
    'aggregator',
    0.50,
    'en',
    'international',
    true
  ),
  (
    'Manchester United (oficjalna)',
    'https://www.manutd.com',
    'https://www.manutd.com/en/rss',
    'rss',
    'official_club',
    1.00,
    'en',
    'en',
    false
  ),
  (
    'Legia Warszawa (oficjalna)',
    'https://legia.com',
    'https://legia.com/feed',
    'rss',
    'official_club',
    1.00,
    'pl',
    'pl',
    false
  ),
  (
    'Lech Poznan (oficjalna)',
    'https://lechpoznan.pl',
    'https://lechpoznan.pl/feed',
    'rss',
    'official_club',
    1.00,
    'pl',
    'pl',
    false
  ),
  (
    'Ekstraklasa (oficjalna)',
    'https://www.ekstraklasa.org',
    'https://www.ekstraklasa.org/feed',
    'rss',
    'official_league',
    1.00,
    'pl',
    'pl',
    false
  ),
  (
    'Fabrizio Romano',
    'https://fabrizioromano.substack.com',
    'https://fabrizioromano.substack.com/feed',
    'rss',
    'journalist',
    0.95,
    'en',
    'international',
    false
  )
on conflict do nothing;
