-- Open room-code generator for any signed-in attendee (including anonymous users).
-- Room creation is limited to three rooms per user per hour.

alter table public.rooms
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create or replace function public.create_room(p_name text)
returns table (id uuid, code text, name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  generated_code text;
  created_room public.rooms%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in before creating a room';
  end if;

  if p_name is null or char_length(trim(p_name)) < 2 or char_length(trim(p_name)) > 60 then
    raise exception 'Room name must be between 2 and 60 characters';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(auth.uid()::text, 0)
  );

  if (
    select count(*) from public.rooms room
    where room.created_by = auth.uid()
      and room.created_at > now() - interval '1 hour'
  ) >= 3 then
    raise exception 'Room creation limit reached. Try again in an hour.';
  end if;

  loop
    generated_code := upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));
    exit when not exists (
      select 1 from public.rooms room where room.code = generated_code
    );
  end loop;

  insert into public.rooms (code, name, created_by)
  values (generated_code, trim(p_name), auth.uid())
  returning * into created_room;

  return query select created_room.id, created_room.code, created_room.name;
end;
$$;

revoke all on function public.create_room(text) from public, anon;
grant execute on function public.create_room(text) to authenticated;
