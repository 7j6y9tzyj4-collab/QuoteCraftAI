-- 🤖 Облік використання AI по місяцях + ліміт і дозвіл на перекладач у user_settings.
create table if not exists public.ai_usage(
  user_id uuid, month text not null, calls int not null default 0, cost numeric not null default 0,
  by_feature jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create unique index if not exists ai_usage_um on public.ai_usage(coalesce(user_id,'00000000-0000-0000-0000-000000000000'::uuid),month);
alter table public.ai_usage enable row level security;
drop policy if exists "own ai usage" on public.ai_usage;
create policy "own ai usage" on public.ai_usage for select using (auth.uid()=user_id);
alter table public.user_settings add column if not exists ai_limit numeric;
alter table public.user_settings add column if not exists allow_translator boolean not null default false;
alter table public.user_settings add column if not exists company jsonb;
create or replace function public.ai_track(p_user uuid,p_month text,p_feature text,p_cost numeric) returns void language plpgsql security definer set search_path=public as $$
begin
  update ai_usage set calls=calls+1,cost=cost+p_cost,
    by_feature=jsonb_set(by_feature,array[p_feature],to_jsonb(coalesce((by_feature->>p_feature)::int,0)+1)),updated_at=now()
  where coalesce(user_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(p_user,'00000000-0000-0000-0000-000000000000'::uuid) and month=p_month;
  if not found then
    insert into ai_usage(user_id,month,calls,cost,by_feature) values(p_user,p_month,1,p_cost,jsonb_build_object(p_feature,1));
  end if;
end $$;
revoke all on function public.ai_track(uuid,text,text,numeric) from public, anon, authenticated;
