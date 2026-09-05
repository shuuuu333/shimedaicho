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
  role text not null default 'staff' check (role in ('owner','staff','cast')),
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

-- 既存プロジェクト向け: 役割に 'cast' を足す
do $$ begin
  alter table public.shop_members drop constraint if exists shop_members_role_check;
  alter table public.shop_members add constraint shop_members_role_check check (role in ('owner','staff','cast'));
exception when others then null; end $$;

-- ============================================================
-- QR での招待（メールなしで店に入れる）
-- ============================================================

-- メンバーを「ログインした人そのもの」でも見分けられるようにする
alter table public.shop_members add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.shop_members add column if not exists name text;
create index if not exists shop_members_user on public.shop_members (user_id);

-- 自分がその店のメンバーか（メール一致 か 本人一致）
create or replace function public.is_member(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shops s where s.id = sid and s.owner = auth.uid())
      or exists (select 1 from public.shop_members m where m.shop_id = sid
                 and (m.user_id = auth.uid() or lower(m.email) = public.my_email()));
$$;

-- 招待。token を QR に入れる。期限つき・1回だけ
create table if not exists public.shop_invites (
  token uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  role text not null default 'staff' check (role in ('staff','cast')),
  name text not null default '',
  cast_id text,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists shop_invites_shop on public.shop_invites (shop_id);

alter table public.shop_invites enable row level security;
drop policy if exists invites_select on public.shop_invites;
create policy invites_select on public.shop_invites for select using (public.is_owner(shop_id));
drop policy if exists invites_insert on public.shop_invites;
create policy invites_insert on public.shop_invites for insert with check (public.is_owner(shop_id));
drop policy if exists invites_delete on public.shop_invites;
create policy invites_delete on public.shop_invites for delete using (public.is_owner(shop_id));

-- QR を読んだ人が自分を店に加える。まだメンバーでないので security definer で通す
-- 返り値は json（出力名と列名がぶつからないようにするため）
create or replace function public.redeem_invite(t uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare inv public.shop_invites; uid uuid := auth.uid(); sname text;
begin
  if uid is null then raise exception 'ログインしていません'; end if;
  select * into inv from public.shop_invites where token = t for update;
  if inv is null then raise exception 'この招待は見つかりません'; end if;
  if inv.used_at is not null then raise exception 'この招待は使用済みです'; end if;
  if inv.expires_at < now() then raise exception 'この招待は期限切れです'; end if;

  insert into public.shop_members as sm (shop_id, email, role, user_id, name)
  values (inv.shop_id, 'qr:' || uid::text, inv.role, uid, inv.name)
  on conflict (shop_id, email) do update
    set role = excluded.role, user_id = excluded.user_id, name = excluded.name;

  update public.shop_invites set used_at = now(), used_by = uid where token = inv.token;

  select s.name into sname from public.shops s where s.id = inv.shop_id;
  return json_build_object('shop_id', inv.shop_id, 'shop_name', coalesce(sname, ''), 'role', inv.role, 'cast_id', inv.cast_id);
end $$;

revoke all on function public.redeem_invite(uuid) from public;
grant execute on function public.redeem_invite(uuid) to authenticated;

-- 期限切れの招待を消す（任意）
create or replace function public.purge_invites() returns void
language sql security definer set search_path = public as $$
  delete from public.shop_invites where expires_at < now() - interval '1 day';
$$;
