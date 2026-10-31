-- Builder discovery fields and opt-in, room-scoped social links.
alter table public.profiles
  add column if not exists tools_used text[] not null default '{}',
  add column if not exists tools_curious text[] not null default '{}',
  add column if not exists looking_for text[] not null default '{}';

create table if not exists public.profile_social_links (
  room_id uuid not null,
  user_id uuid not null,
  x_url text check (x_url is null or x_url ~* '^https://(www\.)?(x\.com|twitter\.com)/'),
  linkedin_url text check (linkedin_url is null or linkedin_url ~* '^https://(www\.)?linkedin\.com/'),
  share_with_room boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id),
  foreign key (room_id, user_id) references public.profiles(room_id, user_id) on delete cascade
);

alter table public.profile_social_links enable row level security;
revoke all on public.profile_social_links from anon, authenticated;
grant select, insert, update, delete on public.profile_social_links to authenticated;

create policy "Owners and opted-in room members can view social links"
  on public.profile_social_links for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      share_with_room
      and exists (
        select 1 from public.room_members viewer
        where viewer.room_id = profile_social_links.room_id
          and viewer.user_id = (select auth.uid())
      )
    )
  );

create policy "Users can create their own social links"
  on public.profile_social_links for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.room_members member
      where member.room_id = profile_social_links.room_id
        and member.user_id = (select auth.uid())
    )
  );

create policy "Users can update their own social links"
  on public.profile_social_links for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.room_members member
      where member.room_id = profile_social_links.room_id
        and member.user_id = (select auth.uid())
    )
  );

create policy "Users can delete their own social links"
  on public.profile_social_links for delete to authenticated
  using (user_id = (select auth.uid()));
