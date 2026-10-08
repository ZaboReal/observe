-- Sites and their keys, and one database token for the whole console (docs/install.md).
--
-- A token whose site is '*' may read and write every site: that is the console's. A token for one site sees only
-- that site. Secret keys are stored as SHA-256 hashes only.
--
-- The *_v2 functions take the site explicitly; the first migration's functions stay until every running console
-- has moved to these.

create table observe.sites (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name text not null check (length(name) between 1 and 80),
  host text not null check (length(host) between 1 and 253),
  environment text not null default 'Production' check (length(environment) <= 40),
  anonymous boolean not null default false,
  publishable_key text not null unique check (publishable_key ~ '^pk_[a-z0-9-]+_[0-9a-f]{16}$'),
  secret_key_hash text not null check (secret_key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
alter table observe.sites enable row level security;

create function observe.may(p_token text, p_site text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from observe.tokens
    where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') and (site = '*' or site = p_site)
  )
$$;
revoke all on function observe.may(text, text) from public, anon, authenticated;

create function public.observe_sites_v2(p_token text)
returns table (id text, name text, host text, environment text, anonymous boolean, publishable_key text, secret_key_hash text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scope text := observe.site_for(p_token);
begin
  if v_scope is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select s.id, s.name, s.host, s.environment, s.anonymous, s.publishable_key, s.secret_key_hash, s.created_at
    from observe.sites s where v_scope = '*' or s.id = v_scope order by s.created_at;
end $$;

create function public.observe_create_site_v2(
  p_token text, p_id text, p_name text, p_host text, p_environment text, p_anonymous boolean, p_publishable_key text, p_secret_key_hash text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if observe.site_for(p_token) is distinct from '*' then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into observe.sites (id, name, host, environment, anonymous, publishable_key, secret_key_hash)
  values (p_id, p_name, p_host, coalesce(p_environment, 'Production'), coalesce(p_anonymous, false), p_publishable_key, p_secret_key_hash);
end $$;

create function public.observe_set_secret_v2(p_token text, p_id text, p_secret_key_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if observe.site_for(p_token) is distinct from '*' then raise exception 'forbidden' using errcode = '42501'; end if;
  update observe.sites set secret_key_hash = p_secret_key_hash where id = p_id;
  if not found then raise exception 'no such site' using errcode = 'P0002'; end if;
end $$;

create function public.observe_put_batch_v2(p_token text, p_site text, p_session_id text, p_received_at bigint, p_meta jsonb, p_body jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  if not observe.may(p_token, p_site) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from observe.sites where id = p_site) then raise exception 'no such site' using errcode = 'P0002'; end if;
  if length(p_session_id) > 128 or pg_column_size(p_body) > 300000 then raise exception 'too large' using errcode = '22001'; end if;
  insert into observe.batches (site, session_id, received_at, meta, body)
  values (p_site, p_session_id, p_received_at, coalesce(p_meta, '{}'::jsonb), p_body)
  returning id into v_id;
  if random() < 0.002 then
    delete from observe.batches where received_at < (extract(epoch from now()) * 1000)::bigint - 30::bigint * 86400000;
    delete from observe.jev where updated_at < (extract(epoch from now()) * 1000)::bigint - 30::bigint * 86400000;
  end if;
  return v_id;
end $$;

create function public.observe_batches_v2(p_token text, p_after bigint, p_since bigint, p_limit int)
returns table (id bigint, site text, session_id text, received_at bigint, meta jsonb, body jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scope text := observe.site_for(p_token);
begin
  if v_scope is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select b.id, b.site, b.session_id, b.received_at, b.meta, b.body
    from observe.batches b
    where (v_scope = '*' or b.site = v_scope) and b.id > p_after and b.received_at >= p_since
    order by b.id
    limit least(greatest(p_limit, 1), 2000);
end $$;

create function public.observe_put_jev_v2(p_token text, p_site text, p_session_id text, p_answer jsonb, p_fingerprint text, p_updated_at bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not observe.may(p_token, p_site) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into observe.jev (site, session_id, answer, fingerprint, updated_at)
  values (p_site, p_session_id, p_answer, p_fingerprint, p_updated_at)
  on conflict (site, session_id) do update
    set answer = excluded.answer, fingerprint = excluded.fingerprint, updated_at = excluded.updated_at
    where observe.jev.updated_at <= excluded.updated_at;
end $$;

create function public.observe_jev_v2(p_token text, p_after bigint)
returns table (site text, session_id text, answer jsonb, fingerprint text, updated_at bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scope text := observe.site_for(p_token);
begin
  if v_scope is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select j.site, j.session_id, j.answer, j.fingerprint, j.updated_at
    from observe.jev j
    where (v_scope = '*' or j.site = v_scope) and j.updated_at > p_after
    order by j.updated_at
    limit 5000;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'observe_sites_v2(text)',
    'observe_create_site_v2(text, text, text, text, text, boolean, text, text)',
    'observe_set_secret_v2(text, text, text)',
    'observe_put_batch_v2(text, text, text, bigint, jsonb, jsonb)',
    'observe_batches_v2(text, bigint, bigint, int)',
    'observe_put_jev_v2(text, text, text, jsonb, text, bigint)',
    'observe_jev_v2(text, bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, authenticated', f);
    execute format('grant execute on function public.%s to anon', f);
  end loop;
end $$;
