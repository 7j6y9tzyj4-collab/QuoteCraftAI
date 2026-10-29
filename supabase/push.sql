-- Push-сповіщення: підписки телефонів власника + серверні секрети (VAPID). Доступ лише через сервер (service role).
create table if not exists public.push_subs(
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  sub jsonb not null,
  ua text,
  created_at timestamptz not null default now());
alter table public.push_subs enable row level security;
create index if not exists push_subs_user on public.push_subs(user_id);

create table if not exists public.app_secrets(
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now());
alter table public.app_secrets enable row level security;
