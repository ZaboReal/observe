-- Storage for a deployed console (see src/lib/db.ts).
--
-- Tables live in the `observe` schema, which PostgREST does not expose. The console reaches them only through
-- the RPC functions below, which run as their owner and first check a secret token against observe.tokens.
-- So the publishable key on its own can neither read nor write anything.
--
-- Add a token for a site (keep the token itself out of the database):
--   insert into observe.tokens (token_hash, site) values (encode(sha256(convert_to('<token>', 'UTF8')), 'hex'), 'arzach');

create schema if not exists observe;
revoke all on schema observe from public, anon, authenticated;

create table observe.tokens (
  token_hash text primary key,
  site text not null,
  created_at timestamptz not null default now()
);

-- Sensor batches as they arrived (the `lab` raw-event stream is dropped before storing).
create table observe.batches (
  id bigint generated always as identity primary key,
  site text not null,
  session_id text not null,
  received_at bigint not null, -- ms since epoch, server clock
  meta jsonb not null default '{}'::jsonb,
  body jsonb not null
);
create index batches_site_id on observe.batches (site, id);
create index batches_received_at on observe.batches (received_at);

-- Jev's latest answer per session.
create table observe.jev (
  site text not null,
  session_id text not null,
  answer jsonb not null,
  fingerprint text not null,
  updated_at bigint not null,
  primary key (site, session_id)
);
create index jev_site_updated_at on observe.jev (site, updated_at);

alter table observe.tokens enable row level security;
alter table observe.batches enable row level security;
alter table observe.jev enable row level security;

create function observe.site_for(p_token text) returns text
language sql stable security definer set search_path = '' as $$
  select site from observe.tokens where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
$$;
revoke all on function observe.site_for(text) from public, anon, authenticated;

create function public.observe_put_batch(p_token text, p_session_id text, p_received_at bigint, p_meta jsonb, p_body jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_site text := observe.site_for(p_token);
  v_id bigint;
begin
  if v_site is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if length(p_session_id) > 128 or pg_column_size(p_body) > 300000 then raise exception 'too large' using errcode = '22001'; end if;
  insert into observe.batches (site, session_id, received_at, meta, body)
  values (v_site, p_session_id, p_received_at, coalesce(p_meta, '{}'::jsonb), p_body)
  returning id into v_id;
  -- Keep 30 days of raw events: behavioural telemetry is personal data, so it is not kept longer than the pilot needs.
  if random() < 0.002 then
    delete from observe.batches where received_at < (extract(epoch from now()) * 1000)::bigint - 30::bigint * 86400000;
    delete from observe.jev where updated_at < (extract(epoch from now()) * 1000)::bigint - 30::bigint * 86400000;
  end if;
  return v_id;
end $$;

create function public.observe_batches(p_token text, p_after bigint, p_since bigint, p_limit int)
returns table (id bigint, session_id text, received_at bigint, meta jsonb, body jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_site text := observe.site_for(p_token);
begin
  if v_site is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select b.id, b.session_id, b.received_at, b.meta, b.body
    from observe.batches b
    where b.site = v_site and b.id > p_after and b.received_at >= p_since
    order by b.id
    limit least(greatest(p_limit, 1), 2000);
end $$;

create function public.observe_put_jev(p_token text, p_session_id text, p_answer jsonb, p_fingerprint text, p_updated_at bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_site text := observe.site_for(p_token);
begin
  if v_site is null then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into observe.jev (site, session_id, answer, fingerprint, updated_at)
  values (v_site, p_session_id, p_answer, p_fingerprint, p_updated_at)
  on conflict (site, session_id) do update
    set answer = excluded.answer, fingerprint = excluded.fingerprint, updated_at = excluded.updated_at
    where observe.jev.updated_at <= excluded.updated_at;
end $$;

create function public.observe_jev(p_token text, p_after bigint)
returns table (session_id text, answer jsonb, fingerprint text, updated_at bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_site text := observe.site_for(p_token);
begin
  if v_site is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select j.session_id, j.answer, j.fingerprint, j.updated_at
    from observe.jev j
    where j.site = v_site and j.updated_at > p_after
    order by j.updated_at
    limit 5000;
end $$;

revoke all on function public.observe_put_batch(text, text, bigint, jsonb, jsonb) from public;
revoke all on function public.observe_batches(text, bigint, bigint, int) from public;
revoke all on function public.observe_put_jev(text, text, jsonb, text, bigint) from public;
revoke all on function public.observe_jev(text, bigint) from public;
-- The console calls these with the publishable key (role anon) plus its secret token; no signed-in user needs them.
-- Supabase's advisor flags anon-callable SECURITY DEFINER functions: here that is the design, since each one
-- refuses to do anything without the token.
grant execute on function public.observe_put_batch(text, text, bigint, jsonb, jsonb) to anon;
grant execute on function public.observe_batches(text, bigint, bigint, int) to anon;
grant execute on function public.observe_put_jev(text, text, jsonb, text, bigint) to anon;
grant execute on function public.observe_jev(text, bigint) to anon;
