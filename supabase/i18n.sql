-- 🌐 Словник інтерфейсу UA → EN (заповнює /api/i18n-build, читає /api/i18n).
create table if not exists public.i18n(key text primary key, en text, updated_at timestamptz not null default now());
alter table public.i18n enable row level security;
