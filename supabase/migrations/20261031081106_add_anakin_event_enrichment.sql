-- Record only minimal details extracted from a selected public Luma event page.
alter table public.profile_events
  add column if not exists organizer_name text check (organizer_name is null or char_length(organizer_name) <= 120),
  add column if not exists event_summary text check (event_summary is null or char_length(event_summary) <= 500),
  add column if not exists enrichment_source text not null default 'luma_mcp'
    check (enrichment_source in ('luma_mcp', 'anakin_url_scraper'));

-- Reuse public page summaries to avoid scraping the same popular event again.
create table if not exists public.anakin_event_cache (
  event_url text primary key check (event_url ~* '^https://(www\.)?(luma\.com|lu\.ma)/'),
  event_title text,
  organizer_name text,
  event_summary text,
  scraped_at timestamptz not null default now()
);
alter table public.anakin_event_cache enable row level security;
revoke all on public.anakin_event_cache from public, anon, authenticated;
grant all on public.anakin_event_cache to service_role;
