-- Agent pricing: what a site charges agents for an action. People never pay; a price applies only where the rules
-- would let a recognised or verified agent go ahead (see src/lib/policy.ts). Amounts are in millionths of a dollar,
-- so per-request prices like $0.002 are exact; the most one action can cost is $100.

create table observe.prices (
  site text not null references observe.sites (id) on delete cascade,
  action_id text not null check (action_id ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  amount_micro bigint not null check (amount_micro > 0 and amount_micro <= 100000000),
  currency text not null default 'USD' check (currency = 'USD'),
  updated_at timestamptz not null default now(),
  primary key (site, action_id)
);
alter table observe.prices enable row level security;

create function public.observe_prices_v2(p_token text)
returns table (site text, action_id text, amount_micro bigint, currency text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scope text := observe.site_for(p_token);
begin
  if v_scope is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select p.site, p.action_id, p.amount_micro, p.currency
    from observe.prices p where v_scope = '*' or p.site = v_scope order by p.site, p.action_id;
end $$;

-- A null or zero amount removes the price.
create function public.observe_set_price_v2(p_token text, p_site text, p_action_id text, p_amount_micro bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not observe.may(p_token, p_site) then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_amount_micro, 0) <= 0 then
    delete from observe.prices where site = p_site and action_id = p_action_id;
  else
    insert into observe.prices (site, action_id, amount_micro) values (p_site, p_action_id, p_amount_micro)
    on conflict (site, action_id) do update set amount_micro = excluded.amount_micro, updated_at = now();
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['observe_prices_v2(text)', 'observe_set_price_v2(text, text, text, bigint)'] loop
    execute format('revoke all on function public.%s from public, authenticated', f);
    execute format('grant execute on function public.%s to anon', f);
  end loop;
end $$;
