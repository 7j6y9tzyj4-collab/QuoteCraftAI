-- 🔒 Безпека (листопад 2026): ліміт частоти запитів + атомарне збереження проєктів по одному.
create table if not exists public.rate_hits(id bigserial primary key, key text not null, at timestamptz not null default now());
create index if not exists rate_hits_key_at on public.rate_hits(key,at);
alter table public.rate_hits enable row level security;
create or replace function public.rate_hit(p_key text,p_max int,p_window_sec int) returns boolean language plpgsql security definer set search_path=public as $f$
declare n int;
begin
  delete from rate_hits where at < now()-interval '1 day';
  select count(*) into n from rate_hits where key=p_key and at > now()-make_interval(secs=>p_window_sec);
  if n>=p_max then return false; end if;
  insert into rate_hits(key) values(p_key);
  return true;
end $f$;
revoke all on function public.rate_hit(text,int,int) from public, anon, authenticated;
-- зберігає тільки змінені проєкти (і видаляє вказані), не чіпаючи решту — щоб два пристрої не стирали зміни один одного
create or replace function public.save_statements(p_changed jsonb, p_deleted text[]) returns void language plpgsql security invoker set search_path=public as $f$
declare cur jsonb; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select statements into cur from user_statements where user_id=uid for update;
  cur:=coalesce(cur,'[]'::jsonb);
  with ch as (select e, e->>'id' id from jsonb_array_elements(coalesce(p_changed,'[]'::jsonb)) e),
  kept as (select coalesce(ch.e,x.e) e, x.ord from jsonb_array_elements(cur) with ordinality x(e,ord) left join ch on ch.id=x.e->>'id' where not ((x.e->>'id')=any(coalesce(p_deleted,'{}'::text[])))),
  added as (select ch.e, 1000000+row_number() over () ord from ch where not exists(select 1 from jsonb_array_elements(cur) y where y->>'id'=ch.id))
  select coalesce(jsonb_agg(z.e order by z.ord),'[]'::jsonb) into cur from (select e,ord from kept union all select e,ord from added) z;
  insert into user_statements(user_id,statements,updated_at) values(uid,cur,now()) on conflict (user_id) do update set statements=excluded.statements, updated_at=now();
end $f$;
grant execute on function public.save_statements(jsonb,text[]) to authenticated;
