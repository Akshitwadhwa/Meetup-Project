-- Keep the scraper cache restricted to real Luma hosts; dots must be literal.
alter table public.anakin_event_cache
  drop constraint if exists anakin_event_cache_event_url_check;

alter table public.anakin_event_cache
  add constraint anakin_event_cache_event_url_check
  check (event_url ~* '^https://(www\.)?(luma\.com|lu\.ma)/');
