-- Event hosts publish the official event record; attendees join by selecting
-- its name. Room codes remain an internal legacy link between existing profile
-- and game tables and are never part of the event onboarding UI.
create table if not exists public.hosted_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.rooms(id) on delete cascade,
  event_name text not null check (char_length(event_name) between 2 and 180),
  event_location text not null check (char_length(event_location) between 2 and 180),
  starts_at timestamptz,
  luma_url text not null unique check (luma_url ~* '^https://(www\.)?(luma\.com|lu\.ma)/[^/?#]+'),
  event_summary text check (event_summary is null or char_length(event_summary) <= 1000),
  organizer_name text check (organizer_name is null or char_length(organizer_name) <= 120),
  host_name text not null check (char_length(host_name) between 1 and 80),
  host_bio text not null check (char_length(host_bio) between 1 and 800),
  host_x_url text check (host_x_url is null or host_x_url ~* '^https://(www\.)?(x\.com|twitter\.com)/'),
  host_linkedin_url text check (host_linkedin_url is null or host_linkedin_url ~* '^https://(www\.)?linkedin\.com/'),
  is_published boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hosted_events_active_idx
  on public.hosted_events (starts_at, created_at desc) where is_published;
alter table public.hosted_events enable row level security;
revoke all on public.hosted_events from anon, authenticated;
grant select on public.hosted_events to authenticated;
create policy "Attendees can find published events"
  on public.hosted_events for select to authenticated
  using (is_published);

-- This is a private list for the profile owner. Event participation and public
-- builder discovery are represented by room membership and profiles instead.
create table if not exists public.profile_event_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.hosted_events(id) on delete cascade,
  event_name text not null,
  event_location text not null,
  joined_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index if not exists profile_event_history_user_idx
  on public.profile_event_history (user_id, joined_at desc);
alter table public.profile_event_history enable row level security;
revoke all on public.profile_event_history from anon, authenticated;
grant select on public.profile_event_history to authenticated;
create policy "Users can view their own event history"
  on public.profile_event_history for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.is_hosted_event_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.room_members member
    where member.room_id = p_room_id and member.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_hosted_event_member(uuid) from public, anon;
grant execute on function public.is_hosted_event_member(uuid) to authenticated;

drop policy if exists "Members can see their own membership" on public.room_members;
drop policy if exists "Room members can see membership in their event" on public.room_members;
create policy "Room members can see membership in their event"
  on public.room_members for select to authenticated
  using (public.is_hosted_event_member(room_id));

create or replace function public.join_hosted_event(p_event_id uuid)
returns table (room_id uuid, event_name text, event_location text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_event public.hosted_events%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in anonymously before joining an event';
  end if;

  select * into selected_event
  from public.hosted_events event
  where event.id = p_event_id and event.is_published;

  if selected_event.id is null then
    raise exception 'This event is not available to join';
  end if;

  insert into public.room_members (room_id, user_id)
  values (selected_event.room_id, auth.uid())
  on conflict (room_id, user_id) do nothing;

  insert into public.profile_event_history (user_id, event_id, event_name, event_location)
  values (auth.uid(), selected_event.id, selected_event.event_name, selected_event.event_location)
  on conflict (user_id, event_id) do nothing;

  return query select selected_event.room_id, selected_event.event_name, selected_event.event_location;
end;
$$;

revoke all on function public.join_hosted_event(uuid) from public, anon;
grant execute on function public.join_hosted_event(uuid) to authenticated;
