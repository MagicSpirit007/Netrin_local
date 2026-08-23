-- Netrin_local portable route-sharing baseline for a Supabase project.
-- Review in a staging project before applying. This repository never applies it remotely.

begin;

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

create or replace function public.netrin_valid_localized_text(
  payload jsonb,
  max_length integer,
  require_content boolean default false
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload -> 'zh-CN') = 'string'
    and jsonb_typeof(payload -> 'en') = 'string'
    and char_length(payload ->> 'zh-CN') <= max_length
    and char_length(payload ->> 'en') <= max_length
    and (
      not require_content
      or char_length(btrim(payload ->> 'zh-CN')) > 0
      or char_length(btrim(payload ->> 'en')) > 0
    );
$$;

create or replace function public.netrin_valid_route_tags(payload text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    cardinality(payload) <= 20
    and coalesce((select bool_and(char_length(tag) <= 40) from unnest(payload) as tag), true);
$$;

create or replace function public.netrin_valid_route_stops(payload jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  longitude double precision;
  latitude double precision;
begin
  if jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) > 100 then
    return false;
  end if;

  for item in select value from jsonb_array_elements(payload)
  loop
    if jsonb_typeof(item) <> 'object'
      or jsonb_typeof(item -> 'lng') <> 'number'
      or jsonb_typeof(item -> 'lat') <> 'number'
    then
      return false;
    end if;

    begin
      longitude := (item ->> 'lng')::double precision;
      latitude := (item ->> 'lat')::double precision;
    exception when others then
      return false;
    end;

    if longitude < -180 or longitude > 180
      or latitude < -90 or latitude > 90
    then
      return false;
    end if;

    if item ? 'text' and (
      jsonb_typeof(item -> 'text') <> 'string'
      or char_length(item ->> 'text') > 1000
    ) then
      return false;
    end if;

    if item ? 'speciesName' and (
      jsonb_typeof(item -> 'speciesName') <> 'string'
      or char_length(item ->> 'speciesName') > 120
    ) then
      return false;
    end if;

    if item ? 'photo' and (
      jsonb_typeof(item -> 'photo') <> 'string'
      or char_length(item ->> 'photo') > 512
      or (item ->> 'photo') !~ '^routes/[A-Za-z0-9_-]{1,128}/[A-Za-z0-9_-]{1,128}/[A-Za-z0-9_-]{1,128}\.jpg$'
    ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  author text not null default '' check (char_length(author) <= 80),
  title jsonb not null check (public.netrin_valid_localized_text(title, 120, true)),
  description jsonb not null default '{"zh-CN":"","en":""}'::jsonb
    check (public.netrin_valid_localized_text(description, 4000, false)),
  season jsonb not null default '{"zh-CN":"","en":""}'::jsonb
    check (public.netrin_valid_localized_text(season, 120, false)),
  difficulty jsonb not null default '{"zh-CN":"","en":""}'::jsonb
    check (public.netrin_valid_localized_text(difficulty, 120, false)),
  distance text not null default '' check (char_length(distance) <= 80),
  duration text not null default '' check (char_length(duration) <= 80),
  tags text[] not null default '{}'::text[]
    check (public.netrin_valid_route_tags(tags)),
  stops jsonb not null default '[]'::jsonb check (public.netrin_valid_route_stops(stops)),
  geom extensions.geometry(LineString, 4326) not null
    check (
      extensions.st_npoints(geom) between 2 and 2000
      and extensions.st_isvalid(geom)
      and extensions.st_xmin(extensions.box3d(geom)) >= -180
      and extensions.st_xmax(extensions.box3d(geom)) <= 180
      and extensions.st_ymin(extensions.box3d(geom)) >= -90
      and extensions.st_ymax(extensions.box3d(geom)) <= 90
    ),
  is_official boolean not null default false,
  is_public boolean not null default true,
  downloads integer not null default 0 check (downloads >= 0),
  likes integer not null default 0 check (likes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists routes_geom_gix on public.routes using gist (geom);
create index if not exists routes_public_created_idx
  on public.routes (created_at desc) where is_public = true;
create index if not exists routes_created_by_idx on public.routes (created_by);

alter table public.routes enable row level security;
alter table public.routes force row level security;

drop policy if exists routes_public_read on public.routes;
drop policy if exists routes_insert_own on public.routes;
drop policy if exists routes_update_own on public.routes;
drop policy if exists routes_delete_own on public.routes;

create policy routes_public_read
on public.routes for select
to anon, authenticated
using (is_public = true);

create policy routes_insert_own
on public.routes for insert
to authenticated
with check ((select auth.uid()) = created_by and is_official = false);

create policy routes_update_own
on public.routes for update
to authenticated
using ((select auth.uid()) = created_by)
with check ((select auth.uid()) = created_by and is_official = false);

create policy routes_delete_own
on public.routes for delete
to authenticated
using ((select auth.uid()) = created_by and is_official = false);

revoke all on public.routes from public, anon, authenticated;
grant select on public.routes to anon, authenticated;
grant insert, update, delete on public.routes to authenticated;

drop view if exists public.routes_public;
create view public.routes_public
with (security_invoker = on) as
select
  id,
  author,
  title,
  description,
  season,
  difficulty,
  distance,
  duration,
  tags,
  stops,
  is_official,
  downloads,
  likes,
  created_at,
  extensions.st_asgeojson(geom)::jsonb as geojson
from public.routes
where is_public = true;

revoke all on public.routes_public from public;
grant select on public.routes_public to anon, authenticated;

create or replace function public.publish_route(
  p_title jsonb,
  p_description jsonb,
  p_distance text,
  p_duration text,
  p_author text,
  p_waypoints jsonb,
  p_stops jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  route_id uuid;
  user_id uuid := (select auth.uid());
  coordinate jsonb;
  longitude double precision;
  latitude double precision;
  route_geometry extensions.geometry(LineString, 4326);
begin
  if user_id is null then
    raise exception 'authentication required';
  end if;
  if not public.netrin_valid_localized_text(p_title, 120, true)
    or not public.netrin_valid_localized_text(coalesce(p_description, '{"zh-CN":"","en":""}'::jsonb), 4000, false)
    or char_length(coalesce(p_distance, '')) > 80
    or char_length(coalesce(p_duration, '')) > 80
    or char_length(coalesce(p_author, '')) > 80
  then
    raise exception 'invalid route text payload';
  end if;
  if jsonb_typeof(p_waypoints) <> 'array'
    or jsonb_array_length(p_waypoints) not between 2 and 2000
  then
    raise exception 'route needs 2 to 2000 waypoints';
  end if;
  if not public.netrin_valid_route_stops(coalesce(p_stops, '[]'::jsonb)) then
    raise exception 'invalid route stops';
  end if;

  for coordinate in select value from jsonb_array_elements(p_waypoints)
  loop
    if jsonb_typeof(coordinate) <> 'array'
      or jsonb_array_length(coordinate) <> 2
      or jsonb_typeof(coordinate -> 0) <> 'number'
      or jsonb_typeof(coordinate -> 1) <> 'number'
    then
      raise exception 'invalid route coordinate';
    end if;
    begin
      longitude := (coordinate ->> 0)::double precision;
      latitude := (coordinate ->> 1)::double precision;
    exception when others then
      raise exception 'invalid route coordinate';
    end;
    if longitude < -180 or longitude > 180
      or latitude < -90 or latitude > 90
    then
      raise exception 'route coordinate outside WGS-84 bounds';
    end if;
  end loop;

  route_geometry := extensions.st_setsrid(
    extensions.st_geomfromgeojson(
      jsonb_build_object('type', 'LineString', 'coordinates', p_waypoints)::text
    ),
    4326
  );

  insert into public.routes (
    created_by,
    author,
    title,
    description,
    distance,
    duration,
    stops,
    geom,
    is_official,
    is_public
  ) values (
    user_id,
    coalesce(p_author, ''),
    p_title,
    coalesce(p_description, '{"zh-CN":"","en":""}'::jsonb),
    coalesce(p_distance, ''),
    coalesce(p_duration, ''),
    coalesce(p_stops, '[]'::jsonb),
    route_geometry,
    false,
    true
  ) returning id into route_id;

  return route_id;
end;
$$;

revoke all on function public.publish_route(jsonb, jsonb, text, text, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.publish_route(jsonb, jsonb, text, text, text, jsonb, jsonb)
  to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('route-media', 'route-media', true, 5242880, array['image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists route_media_public_read on storage.objects;
drop policy if exists route_media_auth_insert on storage.objects;
drop policy if exists route_media_auth_update on storage.objects;
drop policy if exists route_media_auth_delete on storage.objects;

create policy route_media_public_read
on storage.objects for select
to anon, authenticated
using (bucket_id = 'route-media');

create policy route_media_auth_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'route-media'
  and array_length(storage.foldername(name), 1) = 3
  and (storage.foldername(name))[1] = 'routes'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (storage.foldername(name))[3] ~ '^[A-Za-z0-9_-]{1,128}$'
  and storage.filename(name) ~ '^[A-Za-z0-9_-]{1,128}\.jpg$'
);

create policy route_media_auth_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'route-media'
  and (storage.foldername(name))[2] = (select auth.uid())::text
)
with check (
  bucket_id = 'route-media'
  and array_length(storage.foldername(name), 1) = 3
  and (storage.foldername(name))[1] = 'routes'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (storage.foldername(name))[3] ~ '^[A-Za-z0-9_-]{1,128}$'
  and storage.filename(name) ~ '^[A-Za-z0-9_-]{1,128}\.jpg$'
);

create policy route_media_auth_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'route-media'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

commit;

notify pgrst, 'reload schema';
