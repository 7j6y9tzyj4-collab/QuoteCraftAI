-- Клієнти QuoteCraft: по рядку на клієнта (ім'я, телефон, адреса в data). Запустити один раз у Supabase → SQL Editor.
create table if not exists public.user_clients (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists user_clients_user_idx on public.user_clients(user_id);
alter table public.user_clients enable row level security;
drop policy if exists "user_clients select own" on public.user_clients;
create policy "user_clients select own" on public.user_clients for select using (auth.uid() = user_id);
drop policy if exists "user_clients insert own" on public.user_clients;
create policy "user_clients insert own" on public.user_clients for insert with check (auth.uid() = user_id);
drop policy if exists "user_clients update own" on public.user_clients;
create policy "user_clients update own" on public.user_clients for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "user_clients delete own" on public.user_clients;
create policy "user_clients delete own" on public.user_clients for delete using (auth.uid() = user_id);
