-- Посилання для помічника (/w/<token>): години, чеки, фото роботи → worker_inbox → власник забирає в Оплати.
create table if not exists public.worker_links(
  token uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  worker text not null,
  rate numeric not null default 0,
  projects text[] not null default '{}',
  revoked boolean not null default false,
  created_at timestamptz not null default now());
alter table public.worker_links enable row level security;
create policy "own worker links" on public.worker_links for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

create table if not exists public.worker_inbox(
  id uuid primary key default gen_random_uuid(),
  token uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  worker text not null,
  sid text not null,
  kind text not null check (kind in ('hours','receipt','photo')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz);
alter table public.worker_inbox enable row level security;
create policy "own worker inbox" on public.worker_inbox for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create index if not exists worker_inbox_user_pending on public.worker_inbox(user_id) where applied_at is null;
