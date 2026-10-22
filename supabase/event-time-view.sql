-- Apply after the existing PinPoint setup and owner upgrades.
-- Adds read-only browsing of approved events at a chosen time. Existing data is retained.
begin;
create or replace function public.events_at_time(
 view_time timestamptz, page_size integer default 500, page_offset integer default 0
) returns table (
 id uuid, organizer_id uuid, title text, category text, area text, room text,
 host text, description text, link text, starts_at timestamptz, ends_at timestamptz,
 longitude double precision, latitude double precision, status text, revision bigint
) language plpgsql stable security definer set search_path = '' as $$
begin
 if view_time is null or not isfinite(view_time)
 or page_size is null or page_size not between 1 and 500
 or page_offset is null or page_offset < 0 then
  raise exception 'Choose a valid viewing time and page' using errcode='22023';
 end if;
 return query select e.id,
  case when e.organizer_id=(select auth.uid()) then e.organizer_id else null::uuid end,
  e.title,e.category,e.area,e.room,e.host,e.description,e.link,
  e.starts_at,e.ends_at,e.longitude,e.latitude,e.status,e.revision
 from public.events e
 where e.status='published' and e.starts_at <= view_time and e.ends_at > view_time
 order by e.starts_at,e.id limit page_size offset page_offset;
end;
$$;
revoke all on function public.events_at_time(timestamptz,integer,integer) from public;
grant execute on function public.events_at_time(timestamptz,integer,integer) to anon,authenticated;
comment on function public.events_at_time(timestamptz,integer,integer) is
 'Approved events active at the selected instant. Never returns cancelled events or private event requests; other organizers IDs are omitted.';
commit;
