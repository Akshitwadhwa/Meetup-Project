-- Save an optional public Luma event link with the attendee's other optional links.
alter table public.profile_social_links
  add column if not exists luma_url text;

alter table public.profile_social_links
  drop constraint if exists profile_social_links_luma_url_check;

alter table public.profile_social_links
  add constraint profile_social_links_luma_url_check
  check (luma_url is null or luma_url ~* '^https://(www\.)?(luma\.com|lu\.ma)/[^/?#]+');
