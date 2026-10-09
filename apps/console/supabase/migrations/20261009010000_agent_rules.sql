-- Agent rules: what a site lets each agent (or each kind of agent) do, per kind of action, set on the console's Rules
-- page. A row overrides the default policy (src/lib/policy.ts) for one subject and scope; no row means the default.
--
-- subject: a driver id from the agent registry (`claude-in-chrome`), or a group: `any-verified`, `any-recognised`,
-- `unnamed` (unknown automation). scope: one of the console's scopes (view, export, edit, invite, send, pay, settings,
-- delete).

create table observe.agent_rules (
  site text not null references observe.sites (id) on delete cascade,
  subject text not null check (subject ~ '^[a-z0-9][a-z0-9_.:-]{0,63}$'),
  scope text not null check (scope in ('view', 'export', 'edit', 'invite', 'send', 'pay', 'settings', 'delete')),
  choice text not null check (choice in ('allow', 'ask', 'never')),
  updated_at timestamptz not null default now(),
  primary key (site, subject, scope)
);
alter table observe.agent_rules enable row level security;

create function public.observe_agent_rules_v2(p_token text)
returns table (site text, subject text, scope text, choice text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_scope text := observe.site_for(p_token);
begin
  if v_scope is null then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
    select r.site, r.subject, r.scope, r.choice
    from observe.agent_rules r where v_scope = '*' or r.site = v_scope order by r.site, r.subject, r.scope;
end $$;

-- A null choice removes the rule, so the default applies again.
create function public.observe_set_agent_rule_v2(p_token text, p_site text, p_subject text, p_scope text, p_choice text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not observe.may(p_token, p_site) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_choice is null then
    delete from observe.agent_rules where site = p_site and subject = p_subject and scope = p_scope;
  else
    insert into observe.agent_rules (site, subject, scope, choice) values (p_site, p_subject, p_scope, p_choice)
    on conflict (site, subject, scope) do update set choice = excluded.choice, updated_at = now();
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array['observe_agent_rules_v2(text)', 'observe_set_agent_rule_v2(text, text, text, text, text)'] loop
    execute format('revoke all on function public.%s from public, authenticated', f);
    execute format('grant execute on function public.%s to anon', f);
  end loop;
end $$;
