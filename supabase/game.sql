-- Shared watchlist game votes. Run once in the SideQuest Supabase SQL editor.
create table if not exists public.game_votes (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title_id text not null check (char_length(title_id) between 1 and 80),
  vote text not null check (vote in ('like', 'nope', 'unseen')),
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id, title_id)
);

alter table public.game_votes enable row level security;
revoke all on public.game_votes from anon, authenticated;
grant select, insert, update on public.game_votes to authenticated;

drop policy if exists "Room members can view game votes" on public.game_votes;
create policy "Room members can view game votes"
  on public.game_votes for select to authenticated
  using (exists (
    select 1 from public.room_members member
    where member.room_id = game_votes.room_id
      and member.user_id = (select auth.uid())
  ));

drop policy if exists "Members can save own game votes" on public.game_votes;
create policy "Members can save own game votes"
  on public.game_votes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.room_members member where member.room_id = game_votes.room_id and member.user_id = (select auth.uid()))
  );

drop policy if exists "Members can update own game votes" on public.game_votes;
create policy "Members can update own game votes"
  on public.game_votes for update to authenticated
  using (user_id = (select auth.uid()) and exists (select 1 from public.room_members member where member.room_id = game_votes.room_id and member.user_id = (select auth.uid())))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.room_members member where member.room_id = game_votes.room_id and member.user_id = (select auth.uid())));
