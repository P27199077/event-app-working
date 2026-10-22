-- Apply after setup.sql. Adds public requests; only reviewers can publish them.
begin;
set local search_path = public, extensions;
create table if not exists public.event_requests (
 like public.events including defaults including generated including constraints,
 client_id uuid not null,
 review_status text not null default 'pending' check (review_status in ('pending','approved','rejected')),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 published_event_id uuid references public.events(id),
 primary key (id)
);
-- Requests can be anonymous. The published event belongs to its approving reviewer.
alter table public.event_requests alter column organizer_id drop not null;
alter table public.event_requests enable row level security;
revoke all on public.event_requests from public, anon, authenticated;
grant select on public.event_requests to authenticated;
drop policy if exists reviewers_read_requests on public.event_requests;
create policy reviewers_read_requests on public.event_requests for select to authenticated
 using ((select public.is_organizer()));
create index if not exists event_requests_queue on public.event_requests(review_status,created_at);
create index if not exists event_requests_client on public.event_requests(client_id) where review_status='pending';
-- A separate table must have its own exclusion index (LIKE does not copy indexes).
do $$ begin
 if not exists(select 1 from pg_constraint where conname='no_duplicate_pending_request' and conrelid='public.event_requests'::regclass) then
  alter table public.event_requests add constraint no_duplicate_pending_request exclude using gist (
   title_key with =, venue_key with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (review_status='pending');
 end if;
end $$;

create or replace function public.submit_event_request(request_id uuid, browser_id uuid, event_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid; begin
 if request_id is null or browser_id is null or event_data is null then
  raise exception 'Invalid request' using errcode='22023';
 end if;
 -- Bound the queue and best-effort submissions per browser; this is not verified identity.
 perform pg_advisory_xact_lock(716249103);
 select id into saved_id from public.event_requests where id=request_id and client_id=browser_id;
 if saved_id is not null then return saved_id; end if;
 if (select count(*) from public.event_requests where review_status='pending') >= 500
 or (select count(*) from public.event_requests where review_status='pending' and client_id=browser_id) >= 5
 or (select count(*) from public.event_requests where created_at > now()-interval '1 minute' and client_id=browser_id) >= 2 then
  raise exception 'Too many pending requests. Please try later.' using errcode='P0001';
 end if;
 if (event_data->>'ends_at')::timestamptz <= now() then
  raise exception 'Event must end in the future' using errcode='22023';
 end if;
 if exists(select 1 from public.events where status='published'
  and title_key=public.event_key(event_data->>'title')
  and venue_key=public.event_key(event_data->>'area')||':'||public.event_key(event_data->>'room')
  and tstzrange(starts_at,ends_at,'[)') && tstzrange((event_data->>'starts_at')::timestamptz,(event_data->>'ends_at')::timestamptz,'[)')) then
  raise exception 'Duplicate event' using errcode='23P01';
 end if;
 -- Only these fields are accepted; clients cannot choose status, ownership, or approval.
 insert into public.event_requests(id,client_id,organizer_id,title,category,area,room,host,description,link,starts_at,ends_at,longitude,latitude)
 values(request_id,browser_id,auth.uid(),btrim(event_data->>'title'),event_data->>'category',btrim(event_data->>'area'),btrim(event_data->>'room'),btrim(event_data->>'host'),btrim(event_data->>'description'),coalesce(event_data->>'link',''),(event_data->>'starts_at')::timestamptz,(event_data->>'ends_at')::timestamptz,(event_data->>'longitude')::double precision,(event_data->>'latitude')::double precision);
 return request_id;
end $$;
revoke all on function public.submit_event_request(uuid,uuid,jsonb) from public;
grant execute on function public.submit_event_request(uuid,uuid,jsonb) to anon,authenticated;

create or replace function public.review_event_request(request_id uuid, approve boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare request public.event_requests%rowtype; event_id uuid; begin
 if not public.is_organizer() then raise exception 'Reviewer access required' using errcode='42501'; end if;
 if approve is null then raise exception 'Choose approve or reject' using errcode='22023'; end if;
 select * into request from public.event_requests where id=request_id for update;
 if not found then raise exception 'Request not found' using errcode='P0002'; end if;
 if request.review_status <> 'pending' then
  if request.review_status='approved' and approve then return request.published_event_id; end if;
  if request.review_status='rejected' and not approve then return null; end if;
  raise exception 'Request has already been reviewed' using errcode='55000';
 end if;
 if approve then
  if request.ends_at <= now() then raise exception 'This event has ended' using errcode='22023'; end if;
  insert into public.events(organizer_id,title,category,area,room,host,description,link,starts_at,ends_at,longitude,latitude)
  values(auth.uid(),request.title,request.category,request.area,request.room,request.host,request.description,request.link,request.starts_at,request.ends_at,request.longitude,request.latitude)
  returning id into event_id;
 end if;
 update public.event_requests set review_status=case when approve then 'approved' else 'rejected' end,
 reviewed_by=auth.uid(),reviewed_at=now(),published_event_id=event_id where id=request_id;
 return event_id;
end $$;
revoke all on function public.review_event_request(uuid,boolean) from public;
grant execute on function public.review_event_request(uuid,boolean) to authenticated;
commit;
