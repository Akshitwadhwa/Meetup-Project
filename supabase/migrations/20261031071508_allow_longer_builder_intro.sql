-- Allow longer builder introductions in profiles.
alter table public.profiles
  drop constraint if exists profiles_bio_check;

alter table public.profiles
  add constraint profiles_bio_check
  check (char_length(bio) between 1 and 800);
