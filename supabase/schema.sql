-- 締め台帳 Phase 2: クラウド同期のテーブルと権限
-- Supabase ダッシュボード → SQL Editor に貼り付けて Run する（何度実行しても安全）

create extension if not exists pgcrypto;

-- 店
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  owner uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 店のメンバー（メールで招待。まだ登録前の人も入れられる）
create table if not exists public.shop_members (
  shop_id uuid not null references public.shops(id) on delete cascade,
  email text not null,
  role text not null default 'staff' check (role in ('owner','staff')),
  created_at timestamptz not null default now(),
  primary key (shop_id, email)
);
create index if not exists shop_members_email on public.shop_members (lower(email));

-- 台帳（店ごとに 1 行、中身は JSON 丸ごと）
create table if not exists public.ledgers (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  data jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

-- 自分のメールアドレス（JWT から）
create or replace function public.my_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

-- 自分がその店のメンバー（オーナー含む）か
create or replace function public.is_member(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shops s where s.id = sid and s.owner = auth.uid())
      or exists (select 1 from public.shop_members m where m.shop_id = sid and lower(m.email) = public.my_email());
$$;

create or replace function public.is_owner(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shops s where s.id = sid and s.owner = auth.uid());
$$;

alter table public.shops enable row level security;
alter table public.shop_members enable row level security;
alter table public.ledgers enable row level security;

drop policy if exists shops_select on public.shops;
-- 自分がオーナーの行は直接判定する（insert ... returning の時点では is_member() から新しい行が見えないため）
create policy shops_select on public.shops for select using (owner = auth.uid() or public.is_member(id));
drop policy if exists shops_insert on public.shops;
create policy shops_insert on public.shops for insert with check (owner = auth.uid());
drop policy if exists shops_update on public.shops;
create policy shops_update on public.shops for update using (public.is_owner(id));
drop policy if exists shops_delete on public.shops;
create policy shops_delete on public.shops for delete using (public.is_owner(id));

drop policy if exists members_select on public.shop_members;
create policy members_select on public.shop_members for select using (public.is_member(shop_id));
drop policy if exists members_insert on public.shop_members;
create policy members_insert on public.shop_members for insert with check (public.is_owner(shop_id));
drop policy if exists members_delete on public.shop_members;
create policy members_delete on public.shop_members for delete using (public.is_owner(shop_id));

drop policy if exists ledgers_select on public.ledgers;
create policy ledgers_select on public.ledgers for select using (public.is_member(shop_id));
drop policy if exists ledgers_insert on public.ledgers;
create policy ledgers_insert on public.ledgers for insert with check (public.is_member(shop_id));
drop policy if exists ledgers_update on public.ledgers;
create policy ledgers_update on public.ledgers for update using (public.is_member(shop_id));

-- 他の端末の変更を受け取るために Realtime を有効化
do $$ begin
  alter publication supabase_realtime add table public.ledgers;
exception when duplicate_object then null; end $$;

-- 保存のたびに version を進める（同時編集の検出用）
create or replace function public.bump_ledger_version() returns trigger
language plpgsql as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists ledgers_bump on public.ledgers;
create trigger ledgers_bump before update on public.ledgers
  for each row execute function public.bump_ledger_version();
