-- PinPoint setup. Run in Supabase SQL Editor as the project owner.
-- No existing data is deleted. Run against the new PinPoint project.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

create table if not exists private.organizer_emails (
 email text primary key check (email = lower(btrim(email)))
);
alter table private.organizer_emails enable row level security;
revoke all on private.organizer_emails from public, anon, authenticated;

-- Organizer email approvals are provisioned separately by the project owner.


create or replace function public.is_organizer() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from auth.users u join private.organizer_emails o on o.email = lower(u.email)
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null
 );
$$;
revoke all on function public.is_organizer() from public;
grant execute on function public.is_organizer() to anon, authenticated;

create or replace function public.event_key(value text) returns text
language sql immutable strict set search_path = '' as $$
 select regexp_replace(lower(btrim(value)), '[^[:alnum:]]', '', 'g');
$$;


create or replace function public.inside_campus(lng double precision, lat double precision)
returns boolean language plpgsql immutable strict set search_path = '' as $function$
declare
 ring jsonb := '[[78.56977012,17.54707133],[78.56977426,17.54707245],[78.56987222,17.54710856],[78.57002515,17.54714375],[78.57013251,17.54716657],[78.57028285,17.54721984],[78.57036999,17.54725394],[78.57048467,17.54729896],[78.57066443,17.5473509],[78.57088597,17.5473902],[78.57108779,17.54740003],[78.57121442,17.54739804],[78.57130943,17.54737966],[78.57190256,17.54713106],[78.57209903,17.54702925],[78.57213674,17.54707692],[78.57222828,17.54713663],[78.57233506,17.54716533],[78.57244604,17.54715998],[78.57255302,17.54711902],[78.57263982,17.5470464],[78.57268262,17.54697381],[78.57329898,17.54682225],[78.57373256,17.54664654],[78.57442836,17.54631897],[78.57460257,17.54623691],[78.57484258,17.54612774],[78.57517249,17.54597764],[78.57550761,17.54582513],[78.5755459,17.54580766],[78.57591966,17.54564799],[78.57654684,17.54538003],[78.57657962,17.54536536],[78.57710669,17.54512947],[78.57693144,17.54479652],[78.57741568,17.54459123],[78.57772412,17.54443611],[78.57813365,17.54423399],[78.57824161,17.54418072],[78.57806784,17.54336097],[78.57799774,17.54313815],[78.57773642,17.54262417],[78.5773522,17.54188173],[78.57744665,17.54183736],[78.57725329,17.54155297],[78.5771619,17.54129139],[78.57718623,17.54106702],[78.57745101,17.54072523],[78.57756881,17.54050856],[78.57760571,17.54028971],[78.57774047,17.54024879],[78.57788434,17.54014879],[78.57798774,17.54001023],[78.57804107,17.53983823],[78.57803111,17.53965891],[78.5779589,17.53949304],[78.57783264,17.53935967],[78.57766699,17.53927422],[78.57748089,17.53924643],[78.57729576,17.53927947],[78.57713285,17.53936963],[78.57701101,17.53950633],[78.57694595,17.5396646],[78.57693939,17.5397856],[78.57685221,17.5397882],[78.57653537,17.54004782],[78.5764484,17.53996811],[78.57640766,17.53993702],[78.57629611,17.53990163],[78.57617069,17.53987374],[78.57599356,17.53991761],[78.57592581,17.54000765],[78.57586441,17.54005798],[78.57541033,17.54024849],[78.57469848,17.54054717],[78.57353128,17.54106438],[78.57319812,17.54120432],[78.57245313,17.54152864],[78.5712797,17.54203952],[78.57060009,17.54233315],[78.56962936,17.54277175],[78.56939164,17.54293815],[78.56917536,17.54312749],[78.56904835,17.54327571],[78.56889179,17.54352479],[78.56876122,17.54379474],[78.56866268,17.54421613],[78.56864898,17.54445265],[78.56865033,17.54460469],[78.56869208,17.54484447],[78.56870968,17.54519364],[78.56871463,17.5452537],[78.56870518,17.54526674],[78.56869595,17.54530684],[78.56870377,17.54534717],[78.56872699,17.54538156],[78.56876229,17.5454048],[78.56877762,17.54540798],[78.56877575,17.54540071],[78.56891362,17.54572683],[78.56912331,17.54613857],[78.56962078,17.54696925],[78.56964142,17.5469968],[78.5696406,17.54700897],[78.56965579,17.5470447],[78.56968565,17.54707047],[78.56972425,17.54708135],[78.56976412,17.54707534],[78.56977012,17.54707133]]'::jsonb;
 i integer; j integer := jsonb_array_length(ring)-1;
 xi double precision; yi double precision; xj double precision; yj double precision;
 hit boolean := false;
begin
 if lng not between 78.568 and 78.579 or lat not between 17.539 and 17.548 then return false; end if;
 for i in 0..jsonb_array_length(ring)-1 loop
  xi := (ring->i->>0)::double precision; yi := (ring->i->>1)::double precision;
  xj := (ring->j->>0)::double precision; yj := (ring->j->>1)::double precision;
  if abs((lng-xi)*(yj-yi)-(lat-yi)*(xj-xi)) < 1e-12
    and lng between least(xi,xj) and greatest(xi,xj)
    and lat between least(yi,yj) and greatest(yi,yj) then return true; end if;
  if (yi>lat) <> (yj>lat) then
   if lng < (xj-xi)*(lat-yi)/(yj-yi)+xi then hit := not hit; end if;
  end if;
  j := i;
 end loop;
 return hit;
end;
$function$;

create table if not exists public.events (
 id uuid primary key default gen_random_uuid(),
 organizer_id uuid not null default auth.uid() references auth.users(id),
 title text not null check (char_length(btrim(title)) between 1 and 80),
 category text not null check (category in ('Speaker','Workshop','Contest','Fun','Other','Empty classroom')),
 area text not null check (char_length(btrim(area)) between 1 and 140),
 room text not null check (char_length(btrim(room)) between 1 and 140),
 host text not null check (char_length(btrim(host)) between 1 and 80),
 description text not null check (char_length(btrim(description)) between 1 and 500),
 link text not null default '' check (link = '' or (char_length(link) <= 2048 and link ~* '^https?://')),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 longitude double precision not null check (longitude between 78.568 and 78.579),
 latitude double precision not null check (latitude between 17.539 and 17.548),
 status text not null default 'published' check (status in ('published','cancelled')),
 created_at timestamptz not null default now(),
 title_key text generated always as (public.event_key(title)) stored,
 venue_key text generated always as (public.event_key(area) || ':' || public.event_key(room)) stored,
 check (ends_at > starts_at),
 check (public.inside_campus(longitude, latitude)),
 check (public.event_key(title) <> '' and public.event_key(room) <> '' and public.event_key(area) <> ''),
 constraint no_duplicate_event exclude using gist (
  title_key with =, venue_key with =, tstzrange(starts_at, ends_at, '[)') with &&
 ) where (status = 'published')
);
create index if not exists events_live_times on public.events(ends_at,starts_at) where status='published';
create index if not exists events_owner on public.events(organizer_id);

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
grant select on public.events to anon, authenticated;
grant insert(title,category,area,room,host,description,link,starts_at,ends_at,longitude,latitude) on public.events to authenticated;
grant update(title,category,area,room,host,description,link,starts_at,ends_at,longitude,latitude,status) on public.events to authenticated;

drop policy if exists events_read on public.events;
create policy events_read on public.events for select to anon,authenticated using (
 (status='published' and starts_at <= now() and ends_at > now())
 or (organizer_id=(select auth.uid()) and (select public.is_organizer()))
);
drop policy if exists events_create on public.events;
create policy events_create on public.events for insert to authenticated with check (
 organizer_id=(select auth.uid()) and (select public.is_organizer()) and status='published' and ends_at > now()
);
drop policy if exists events_edit on public.events;
create policy events_edit on public.events for update to authenticated
 using (organizer_id=(select auth.uid()) and (select public.is_organizer()))
 with check (organizer_id=(select auth.uid()) and (select public.is_organizer()));
commit;
