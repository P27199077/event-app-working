-- Apply after event-requests.sql. Existing requests are retained; tracking starts
-- with new submissions made through the updated app.
begin;
alter table public.event_requests add column if not exists tracking_hash text;
alter table public.event_requests add column if not exists rejection_reason text;
create unique index if not exists event_request_tracking_hash
 on public.event_requests(tracking_hash) where tracking_hash is not null;

create or replace function public.submit_tracked_event_request(
 request_id uuid, browser_id uuid, event_data jsonb, tracking_token text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid; token_hash text;
begin
 if tracking_token is null or tracking_token !~ '^[0-9a-f]{64}$' then
  raise exception 'Invalid tracking token' using errcode='22023';
 end if;
 token_hash := encode(sha256(convert_to(tracking_token, 'UTF8')), 'hex');
 -- The original function applies input validation, duplicate checks and limits.
 saved_id := public.submit_event_request(request_id, browser_id, event_data);
 update public.event_requests set tracking_hash=token_hash
 where id=saved_id and client_id=browser_id
 and (tracking_hash is null or tracking_hash=token_hash);
 if not found then raise exception 'Tracking token does not match' using errcode='42501'; end if;
 return saved_id;
end;
$$;
revoke all on function public.submit_tracked_event_request(uuid,uuid,jsonb,text) from public;
grant execute on function public.submit_tracked_event_request(uuid,uuid,jsonb,text) to anon,authenticated;

create or replace function public.track_event_request(request_id uuid, tracking_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare request public.event_requests%rowtype; event_state text;
begin
 if request_id is null or tracking_token is null or tracking_token !~ '^[0-9a-f]{64}$' then return null; end if;
 select * into request from public.event_requests
 where id=request_id and tracking_hash=encode(sha256(convert_to(tracking_token, 'UTF8')), 'hex');
 if not found then return null; end if;
 if request.published_event_id is not null then
  select status into event_state from public.events where id=request.published_event_id;
 end if;
 -- No client IDs, email addresses, reviewer IDs or other requests are exposed.
 return jsonb_build_object('id',request.id,'title',request.title,
  'status',request.review_status,'reason',request.rejection_reason,
  'created',request.created_at,'reviewed',request.reviewed_at,
  'start',request.starts_at,'end',request.ends_at,'eventStatus',event_state);
end;
$$;
revoke all on function public.track_event_request(uuid,text) from public;
grant execute on function public.track_event_request(uuid,text) to anon,authenticated;

create or replace function public.review_event_request_with_reason(request_id uuid, approve boolean, reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare request public.event_requests%rowtype;
begin
 if not public.is_organizer() then raise exception 'Reviewer access required' using errcode='42501'; end if;
 if approve is null then raise exception 'Choose approve or reject' using errcode='22023'; end if;
 select * into request from public.event_requests where id=request_id for update;
 if not found then raise exception 'Request not found' using errcode='P0002'; end if;
 if not approve and request.review_status='pending' then
  if reason is null or char_length(btrim(reason)) not between 1 and 300 then
   raise exception 'Add a rejection reason of 1 to 300 characters' using errcode='22023';
  end if;
  update public.event_requests set rejection_reason=btrim(reason) where id=request_id;
 end if;
 -- Review and the reason are committed together. The original function locks
 -- the request, checks reviewer access and publishes exactly once on approval.
 return public.review_event_request(request_id,approve);
end;
$$;
-- Only the wrapper can be called by reviewers, so rejection reasons cannot be bypassed.
revoke all on function public.review_event_request(uuid,boolean) from authenticated;
revoke all on function public.review_event_request_with_reason(uuid,boolean,text) from public;
grant execute on function public.review_event_request_with_reason(uuid,boolean,text) to authenticated;
commit;
