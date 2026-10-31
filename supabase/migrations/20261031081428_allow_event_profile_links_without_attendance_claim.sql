-- Event selection connects people around an event; it is not an attendance claim.
drop policy if exists "Owners and opted-in room members can read event history" on public.profile_events;
create policy "Owners and opted-in room members can read event history"
  on public.profile_events for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      share_with_room
      and exists (
        select 1 from public.room_members viewer
        where viewer.room_id = profile_events.room_id
          and viewer.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Users can add their confirmed Luma events" on public.profile_events;
create policy "Users can add their own Luma events"
  on public.profile_events for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.room_members member
      where member.room_id = profile_events.room_id
        and member.user_id = (select auth.uid())
    )
  );

drop policy if exists "Users can edit their Luma events" on public.profile_events;
create policy "Users can edit their Luma events"
  on public.profile_events for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.room_members member
      where member.room_id = profile_events.room_id
        and member.user_id = (select auth.uid())
    )
  );
