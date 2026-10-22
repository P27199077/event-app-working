-- Apply after the owner-and-tracking upgrade. Existing data is retained.
begin;
create table if not exists public.event_reports (
 id uuid primary key,
 event_id uuid references public.events(id) on delete set null,
 event_title text not null,
 reporter_hash text not null,
 reason text not null check (reason in ('Wrong location','Wrong time','Event cancelled','Misleading or spam','Other')),
 details text not null default '' check (char_length(details) <= 500),
 status text not null default 'open' check (status in ('open','resolved','dismissed')),
 created_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 review_note text check (char_length(review_note) <= 300)
);
create unique index if not exists event_reports_one_open_per_browser
 on public.event_reports(event_id,reporter_hash) where status='open';
create index if not exists event_reports_queue on public.event_reports(status,created_at);
create index if not exists event_reports_recent_browser on public.event_reports(reporter_hash,created_at);

alter table public.event_reports enable row level security;
revoke all on public.event_reports from public,anon,authenticated;
grant select on public.event_reports to authenticated;
drop policy if exists owners_read_event_reports on public.event_reports;
create policy owners_read_event_reports on public.event_reports for select to authenticated
 using ((select public.is_owner()));

create or replace function public.submit_event_report(
 report_id uuid, browser_id uuid, reported_event_id uuid, report_reason text, report_details text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare identity_hash text; saved_id uuid; reported_event public.events%rowtype;
begin
 if report_id is null or browser_id is null or reported_event_id is null
 or report_reason is null or report_reason not in ('Wrong location','Wrong time','Event cancelled','Misleading or spam','Other')
 or char_length(coalesce(report_details,'')) > 500
 or (report_reason='Other' and char_length(btrim(coalesce(report_details,'')))=0) then
  raise exception 'Check the report reason and details' using errcode='22023';
 end if;
 identity_hash := encode(sha256(convert_to(browser_id::text,'UTF8')),'hex');
 -- Serialize insertion limits and duplicate retries. Browser IDs are a soft
 -- limit, not verified identity; reports never remove a public event by themselves.
 perform pg_advisory_xact_lock(716249104);
 select id into saved_id from public.event_reports
 where id=report_id and reporter_hash=identity_hash and event_id=reported_event_id;
 if saved_id is not null then return saved_id; end if;
 select id into saved_id from public.event_reports where event_id=reported_event_id
 and reporter_hash=identity_hash and status='open';
 if saved_id is not null then return saved_id; end if;
 select * into reported_event from public.events where id=reported_event_id
 and status='published' and starts_at <= now() and ends_at > now() for share;
 if not found then raise exception 'This event is no longer live' using errcode='P0002'; end if;
 if (select count(*) from public.event_reports where status='open') >= 1000
 or (select count(*) from public.event_reports where reporter_hash=identity_hash and created_at > now()-interval '10 minutes') >= 5
 or (select count(*) from public.event_reports where created_at > now()-interval '1 minute') >= 100 then
  raise exception 'Please wait before sending another report' using errcode='P0001';
 end if;
 -- Snapshot the real title on the server; callers cannot choose status or reviewer.
 insert into public.event_reports(id,event_id,event_title,reporter_hash,reason,details)
 values(report_id,reported_event_id,reported_event.title,identity_hash,report_reason,btrim(coalesce(report_details,'')))
 returning id into saved_id;
 return saved_id;
end;
$$;
revoke all on function public.submit_event_report(uuid,uuid,uuid,text,text) from public;
grant execute on function public.submit_event_report(uuid,uuid,uuid,text,text) to anon,authenticated;

create or replace function public.review_event_report(
 report_id uuid, review_action text, expected_event_revision bigint, note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare report public.event_reports%rowtype; reported_event public.events%rowtype; target_event uuid;
begin
 if not public.is_owner() then raise exception 'Owner access required' using errcode='42501'; end if;
 if report_id is null or review_action is null or review_action not in ('resolve','dismiss','cancel')
 or char_length(coalesce(note,'')) > 300 then
  raise exception 'Check the report action and note' using errcode='22023';
 end if;
 if review_action='cancel' then
  select event_id into target_event from public.event_reports where id=report_id;
  if target_event is null then raise exception 'Event no longer available' using errcode='P0002'; end if;
  -- Lock the event before reports so cancelling two reports for one event cannot deadlock.
  select * into reported_event from public.events where id=target_event for update;
  if not found then raise exception 'Event no longer available' using errcode='P0002'; end if;
 end if;
 select * into report from public.event_reports where id=report_id for update;
 if not found then raise exception 'Report not found' using errcode='P0002'; end if;
 if report.status <> 'open' then
  if (report.status='resolved' and review_action='resolve')
  or (report.status='dismissed' and review_action='dismiss') then return report.id; end if;
  raise exception 'Report already reviewed; refresh the queue' using errcode='55000';
 end if;
 if review_action='cancel' then
  if expected_event_revision is null or reported_event.revision <> expected_event_revision then
   raise exception 'Event changed since opening' using errcode='40001';
  end if;
  if reported_event.status <> 'cancelled' then
   perform public.owner_set_event_status(target_event,expected_event_revision,'cancelled');
  end if;
  update public.event_reports set status='resolved',reviewed_by=auth.uid(),reviewed_at=now(),
   review_note=case when btrim(coalesce(note,''))='' then 'Event cancelled after review.' else btrim(note) end
  where event_id=target_event and status='open';
 else
  update public.event_reports set status=case when review_action='dismiss' then 'dismissed' else 'resolved' end,
   reviewed_by=auth.uid(),reviewed_at=now(),review_note=btrim(coalesce(note,'')) where id=report.id;
 end if;
 return report.id;
end;
$$;
revoke all on function public.review_event_report(uuid,text,bigint,text) from public;
grant execute on function public.review_event_report(uuid,text,bigint,text) to authenticated;
commit;
