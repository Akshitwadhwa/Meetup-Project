-- Luma OAuth tokens and one-time state records are backend-only. Imported
-- attendance is room-scoped and visible to peers only after explicit sharing.
create table if not exists public.luma_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  room_code text not null,
  code_verifier text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.luma_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.luma_oauth_states enable row level security;
alter table public.luma_connections enable row level security;
revoke all on public.luma_oauth_states, public.luma_connections from anon, authenticated;
grant all on public.luma_oauth_states, public.luma_connections to service_role;

create table if not exists public.profile_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  user_id uuid not null,
  luma_event_id text not null,
  event_url text not null check (event_url ~* '^https://(www\.)?(luma\.com|lu\.ma)/'),
  event_name text not null check (char_length(event_name) between 1 and 180),
  starts_at timestamptz,
  attended_confirmed boolean not null default false,
  share_with_room boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (room_id, user_id) references public.profiles(room_id, user_id) on delete cascade,
  unique (room_id, user_id, luma_event_id)
);

create index if not exists profile_events_room_idx on public.profile_events(room_id, user_id);
alter table public.profile_events enable row level security;
revoke all on public.profile_events from anon, authenticated;
grant select, insert, update, delete on public.profile_events to authenticated;

drop policy if exists "Owners and opted-in room members can read event history" on public.profile_events;
create policy "Owners and opted-in room members can read event history"
  on public.profile_events for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      attended_confirmed and share_with_room
      and exists (
        select 1 from public.room_members viewer
        where viewer.room_id = profile_events.room_id and viewer.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users can add their confirmed Luma events" on public.profile_events;
create policy "Users can add their confirmed Luma events"
  on public.profile_events for insert to authenticated
  with check (
    user_id = (select auth.uid()) and attended_confirmed
    and exists (
      select 1 from public.room_members member
      where member.room_id = profile_events.room_id and member.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can edit their Luma events" on public.profile_events;
create policy "Users can edit their Luma events"
  on public.profile_events for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid()) and attended_confirmed
    and exists (
      select 1 from public.room_members member
      where member.room_id = profile_events.room_id and member.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can delete their Luma events" on public.profile_events;
create policy "Users can delete their Luma events"
  on public.profile_events for delete to authenticated
  using (user_id = (select auth.uid()));
