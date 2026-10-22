-- Apply after setup.sql and event-requests.sql. No event data is removed.
begin;

create table if not exists private.owner_emails (
 email text primary key check (email = lower(btrim(email)))
);
alter table private.owner_emails enable row level security;
revoke all on private.owner_emails from public, anon, authenticated;
-- Owner email approvals are provisioned separately by the project owner.

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from auth.users u join private.owner_emails o on o.email = lower(u.email)
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null
 );
$$;
revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to anon, authenticated;

alter table public.events add column if not exists revision bigint not null default 1;
-- Reviewers retain their existing own-event cancellation permission. Only owners
-- may edit published details, through the restricted function below.
revoke update(title,category,area,room,host,description,link,starts_at,ends_at,longitude,latitude,status) on public.events from authenticated;
grant update(status) on public.events to authenticated;

create or replace function private.bump_event_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
 new.revision := old.revision + 1;
 return new;
end;
$$;
drop trigger if exists events_revision on public.events;
create trigger events_revision before update on public.events
 for each row execute function private.bump_event_revision();

-- Public reads remain live-only. Owners may also read the full event archive.
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to anon, authenticated using (
 (status='published' and starts_at <= now() and ends_at > now())
 or (organizer_id=(select auth.uid()) and (select public.is_organizer()))
 or (select public.is_owner())
);
-- The existing direct-update policy remains restricted to a reviewer's own events.
-- Cross-account edits use these owner-only functions, with stale-edit protection.
create or replace function public.owner_edit_event(event_id uuid, expected_revision bigint, event_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_event public.events%rowtype; saved public.events%rowtype;
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 if event_data is null or expected_revision is null then raise exception 'Invalid edit' using errcode='22023'; end if;
 select * into current_event from public.events where id=event_id for update;
 if not found then raise exception 'Event not found' using errcode='P0002'; end if;
 if current_event.revision <> expected_revision then raise exception 'Event changed since opening' using errcode='40001'; end if;
 -- Whitelist editable details. Identity, creator, status and creation time are preserved.
 update public.events set
  title=btrim(event_data->>'title'), category=event_data->>'category',
  area=btrim(event_data->>'area'), room=btrim(event_data->>'room'),
  host=btrim(event_data->>'host'), description=btrim(event_data->>'description'),
  link=coalesce(event_data->>'link',''),
  starts_at=(event_data->>'starts_at')::timestamptz,
  ends_at=(event_data->>'ends_at')::timestamptz,
  longitude=(event_data->>'longitude')::double precision,
  latitude=(event_data->>'latitude')::double precision
 where id=event_id returning * into saved;
 return to_jsonb(saved);
end;
$$;
revoke all on function public.owner_edit_event(uuid,bigint,jsonb) from public;
grant execute on function public.owner_edit_event(uuid,bigint,jsonb) to authenticated;

create or replace function public.owner_set_event_status(event_id uuid, expected_revision bigint, next_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_event public.events%rowtype; saved public.events%rowtype;
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 if next_status is null or next_status not in ('published','cancelled') or expected_revision is null then
  raise exception 'Invalid event status' using errcode='22023';
 end if;
 select * into current_event from public.events where id=event_id for update;
 if not found then raise exception 'Event not found' using errcode='P0002'; end if;
 if current_event.revision <> expected_revision then raise exception 'Event changed since opening' using errcode='40001'; end if;
 if next_status='published' and current_event.ends_at <= now() then
  raise exception 'Change the end time before restoring an ended event' using errcode='22023';
 end if;
 update public.events set status=next_status where id=event_id returning * into saved;
 return to_jsonb(saved);
end;
$$;
revoke all on function public.owner_set_event_status(uuid,bigint,text) from public;
grant execute on function public.owner_set_event_status(uuid,bigint,text) to authenticated;
commit;
