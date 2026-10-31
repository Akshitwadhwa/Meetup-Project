-- Keep the membership predicate out of the exposed Data API schema. It is a
-- narrowly scoped helper used only by the room_members RLS policy.
create schema if not exists sidequest_private;
revoke all on schema sidequest_private from public, anon, authenticated;
grant usage on schema sidequest_private to authenticated;

drop policy if exists "Room members can see membership in their event" on public.room_members;
drop function if exists public.is_hosted_event_member(uuid);

create or replace function sidequest_private.is_hosted_event_member(p_room_id uuid)
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
revoke all on function sidequest_private.is_hosted_event_member(uuid) from public, anon;
grant execute on function sidequest_private.is_hosted_event_member(uuid) to authenticated;

create policy "Room members can see membership in their event"
  on public.room_members for select to authenticated
  using (sidequest_private.is_hosted_event_member(room_id));

-- Attendees may only add their own membership to rooms that belong to a
-- currently published event. The joined_at value remains database-generated.
grant insert (room_id, user_id) on public.room_members to authenticated;
drop policy if exists "Users can join published event memberships" on public.room_members;
create policy "Users can join published event memberships"
  on public.room_members for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.hosted_events event
      where event.room_id = room_members.room_id and event.is_published
    )
  );

-- The attendee's history is generated from event membership. Users can read
-- their own rows, while the trigger records the event details at join time.
grant insert (user_id, event_id, event_name, event_location) on public.profile_event_history to authenticated;
drop policy if exists "Users can add their own joined event history" on public.profile_event_history;
create policy "Users can add their own joined event history"
  on public.profile_event_history for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.hosted_events event
      join public.room_members member on member.room_id = event.room_id
      where event.id = profile_event_history.event_id
        and event.event_name = profile_event_history.event_name
        and event.event_location = profile_event_history.event_location
        and member.user_id = (select auth.uid())
    )
  );

create or replace function public.record_hosted_event_history()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.profile_event_history (user_id, event_id, event_name, event_location)
  select new.user_id, event.id, event.event_name, event.event_location
  from public.hosted_events event
  where event.room_id = new.room_id and event.is_published
  on conflict (user_id, event_id) do nothing;
  return new;
end;
$$;
revoke all on function public.record_hosted_event_history() from public, anon, authenticated;
drop trigger if exists record_hosted_event_history_after_join on public.room_members;
create trigger record_hosted_event_history_after_join
  after insert on public.room_members
  for each row execute function public.record_hosted_event_history();

create or replace function public.join_hosted_event(p_event_id uuid)
returns table (room_id uuid, event_name text, event_location text)
language plpgsql
security invoker
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

  return query select selected_event.room_id, selected_event.event_name, selected_event.event_location;
end;
$$;
revoke all on function public.join_hosted_event(uuid) from public, anon;
grant execute on function public.join_hosted_event(uuid) to authenticated;

-- Attendee-facing room-code creation/join RPCs are no longer part of SideQuest.
revoke all on function public.create_room(text) from public, anon, authenticated;
revoke all on function public.join_room(text) from public, anon, authenticated;
