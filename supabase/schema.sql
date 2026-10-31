-- SideQuest anonymous meetup rooms.
-- Run this migration in the Supabase SQL editor after creating a project.

create extension if not exists pgcrypto;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.profiles (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 32),
  bio text not null check (char_length(bio) between 1 and 260),
  interests text[] not null default '{}',
  social_links jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists profiles_room_updated_idx
  on public.profiles (room_id, updated_at desc);
create index if not exists profiles_user_idx on public.profiles (user_id);
create index if not exists room_members_user_idx on public.room_members (user_id);

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.profiles enable row level security;

revoke all on public.rooms, public.room_members, public.profiles from anon, authenticated;
grant select on public.room_members to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;

drop policy if exists "Members can see their own membership" on public.room_members;
create policy "Members can see their own membership"
  on public.room_members for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Room members can see profiles in their rooms" on public.profiles;
create policy "Room members can see profiles in their rooms"
  on public.profiles for select to authenticated
  using (exists (
    select 1 from public.room_members viewer
    where viewer.room_id = profiles.room_id
      and viewer.user_id = (select auth.uid())
  ));

drop policy if exists "Users can create their own room profile" on public.profiles;
create policy "Users can create their own room profile"
  on public.profiles for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.room_members member
      where member.room_id = profiles.room_id
        and member.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can edit their own room profile" on public.profiles;
create policy "Users can edit their own room profile"
  on public.profiles for update to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.room_members member
      where member.room_id = profiles.room_id
        and member.user_id = (select auth.uid())
    )
  )
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.room_members member
      where member.room_id = profiles.room_id
        and member.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can delete their own room profile" on public.profiles;
create policy "Users can delete their own room profile"
  on public.profiles for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.join_room(p_code text)
returns table (id uuid, code text, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room public.rooms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in anonymously before joining a room';
  end if;

  select * into target_room
  from public.rooms r
  where upper(r.code) = upper(trim(p_code)) and r.is_active
  limit 1;

  if target_room.id is null then
    raise exception 'Room code not found or room is closed';
  end if;

  insert into public.room_members (room_id, user_id)
  values (target_room.id, auth.uid())
  on conflict (room_id, user_id) do nothing;

  return query select target_room.id, target_room.code, target_room.name;
end;
$$;

revoke all on function public.join_room(text) from public, anon;
grant execute on function public.join_room(text) to authenticated;

insert into public.rooms (code, name)
values ('FLOW26', 'Gurugram AI Builders')
on conflict (code) do update set name = excluded.name, is_active = true;

-- Enable profile updates in Supabase Realtime so the room board refreshes live.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;
