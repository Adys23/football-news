-- 0004_sources.sql
-- Zrodla informacji i ich wiarygodnosc.

create table sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  rss_url text,
  kind source_kind not null default 'rss',
  type source_type not null,
  trust_score numeric(3, 2) not null,
  language text not null default 'pl',
  sport text not null default 'football',
  country text not null default 'international',
  fetch_interval_minutes int not null default 15,
  etag text,
  last_modified text,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  consecutive_failures int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_trust_score_range check (trust_score >= 0 and trust_score <= 1),
  constraint sources_fetch_interval_range check (fetch_interval_minutes between 1 and 1440),
  constraint sources_rss_requires_url check (kind <> 'rss' or rss_url is not null),
  -- Ranking zaufania jest wymuszony w bazie, nie tylko w kodzie. Pomylka w seedzie
  -- nie moze sprawic, ze agregator dostanie wiarygodnosc oficjalnego komunikatu klubu.
  constraint sources_trust_matches_type check (
    case type
      when 'official_club' then trust_score = 1.00
      when 'official_league' then trust_score = 1.00
      when 'official_federation' then trust_score = 1.00
      when 'journalist' then trust_score >= 0.80 and trust_score <= 0.95
      when 'major_outlet' then trust_score >= 0.70 and trust_score <= 0.85
      when 'local_outlet' then trust_score >= 0.60 and trust_score <= 0.75
      when 'aggregator' then trust_score <= 0.50
      when 'social' then trust_score <= 0.40
    end
  )
);

alter table sources enable row level security;

comment on table sources is 'Konfiguracja zrodel. trust_score jest ograniczony typem zrodla.';
comment on column sources.consecutive_failures is 'Circuit breaker: po 10 bledach zrodlo jest dezaktywowane.';

create unique index sources_rss_url_idx on sources (rss_url) where rss_url is not null;

-- Dispatcher wybiera tylko aktywne zrodla, ktorym minal interwal.
create index sources_due_idx on sources (active, last_checked_at) where active;

create trigger sources_set_updated_at
before update on sources
for each row
execute function set_updated_at();
