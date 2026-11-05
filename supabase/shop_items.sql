-- 🛒 Список покупок по проєкту (помічник диктує / власник дописує).
create table if not exists public.shop_items(
  id uuid primary key default gen_random_uuid(), user_id uuid not null, sid text not null,
  text text not null, done boolean not null default false, by text, created_at timestamptz not null default now(), done_at timestamptz);
create index if not exists shop_items_sid on public.shop_items(user_id,sid);
alter table public.shop_items enable row level security;
