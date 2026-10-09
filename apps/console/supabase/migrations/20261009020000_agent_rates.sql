-- Agent billing by time and by session, alongside per-action prices (observe.prices): what a site charges a recognised
-- or verified agent per hour it drives a session, and per session. Amounts are in millionths of a dollar.

create table observe.agent_rates (
  site text not null references observe.sites (id) on delete cascade,
  unit text not null check (unit in ('hour', 'session')),
  amount_micro bigint not null check (amount_micro > 0 and amount_micro <= 1000000000),
  updated_at timestamptz not null default now(),
  primary key (site, unit)
);
alter table observe.agent_rates enable row level security;

create function public.observe_agent_rates_v2(p_token text)
returns table (site text, unit text, amount_micro bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scope text := observe.site_for(p_token);
begin
  if v_scope is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select r.site, r.unit, r.amount_micro from observe.agent_rates r where v_scope = '*' or r.site = v_scope order by r.site, r.unit;
end $$;

-- A null or zero amount removes the rate.
create function public.observe_set_agent_rate_v2(p_token text, p_site text, p_unit text, p_amount_micro bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not observe.may(p_token, p_site) then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_amount_micro, 0) <= 0 then
    delete from observe.agent_rates where site = p_site and unit = p_unit;
  else
    insert into observe.agent_rates (site, unit, amount_micro) values (p_site, p_unit, p_amount_micro)
    on conflict (site, unit) do update set amount_micro = excluded.amount_micro, updated_at = now();
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['observe_agent_rates_v2(text)', 'observe_set_agent_rate_v2(text, text, text, bigint)'] loop
    execute format('revoke all on function public.%s from public, authenticated', f);
    execute format('grant execute on function public.%s to anon', f);
  end loop;
end $$;
