-- シフト希望のテーブルと RLS
--
-- supabase/schema.sql の末尾を切り出したもの。
-- Supabase の SQL Editor に貼って Run する。何度実行しても安全。
--
-- これを流すまで、キャスト端末からの希望はサーバーに届かない。
-- 店（オーナー・スタッフ）の画面だけなら、流さなくても動く。

-- ============================================================
-- シフト希望: キャスト本人が書ける、唯一の場所
--
-- 台帳（ledgers）は owner/staff しか書けない。キャストが「来月ここ入れます」を
-- 出すには、本人が書ける置き場が要る。台帳の書き込みを開けるわけにはいかない
-- （1 つの JSON なので、開けたら店の売上まで書けてしまう）。
--
-- 希望と予定を分けてあるのは画面の都合ではない。予定は店が決めたもので、
-- 希望は本人が言っただけのもの。同じ所に置くと、出しただけの日に
-- 出勤したことにされる事故が起きる。予定（Ledger.plans）は台帳のまま。
--
-- 何度実行しても安全。
-- ============================================================

create table if not exists public.shift_wishes (
  shop_id    uuid not null references public.shops(id) on delete cascade,
  cast_id    text not null,
  d          date not null,
  -- 空なら「店の時間でいい」の意。台帳側の Wish と同じ決まり
  in_at      text,
  out_at     text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (shop_id, cast_id, d)
);

-- 「その月ぶんを出し終えた」。これが無いと
-- 「まだ答えていない」と「その日は入れない」を店が区別できない
create table if not exists public.shift_wish_done (
  shop_id uuid not null references public.shops(id) on delete cascade,
  cast_id text not null,
  month   text not null,
  at      timestamptz not null default now(),
  primary key (shop_id, cast_id, month)
);

create index if not exists shift_wishes_shop_d on public.shift_wishes (shop_id, d);

-- 自分のキャストID。RLS から呼ぶので security definer
create or replace function public.my_cast_id(sid uuid)
returns text
language sql stable security definer set search_path = public as $$
  select m.cast_id from public.my_member(sid) m limit 1;
$$;
revoke all on function public.my_cast_id(uuid) from public;
grant execute on function public.my_cast_id(uuid) to authenticated;

alter table public.shift_wishes    enable row level security;
alter table public.shift_wish_done enable row level security;

-- 読む: オーナーとスタッフは全員ぶん。キャストは自分のぶんだけ。
-- 「誰が何日出したか」は店の内部情報で、キャスト同士で見せ合うものではない
drop policy if exists wishes_select on public.shift_wishes;
create policy wishes_select on public.shift_wishes for select
  using (public.my_role(shop_id) in ('owner','staff')
         or (coalesce(public.my_cast_id(shop_id), '') <> '' and cast_id = public.my_cast_id(shop_id)));

-- 書く: 同じ条件。キャストは自分の行しか作れないし、消せない
drop policy if exists wishes_write on public.shift_wishes;
create policy wishes_write on public.shift_wishes for all
  using (public.my_role(shop_id) in ('owner','staff')
         or (coalesce(public.my_cast_id(shop_id), '') <> '' and cast_id = public.my_cast_id(shop_id)))
  with check (public.my_role(shop_id) in ('owner','staff')
         or (coalesce(public.my_cast_id(shop_id), '') <> '' and cast_id = public.my_cast_id(shop_id)));

drop policy if exists wish_done_select on public.shift_wish_done;
create policy wish_done_select on public.shift_wish_done for select
  using (public.my_role(shop_id) in ('owner','staff')
         or (coalesce(public.my_cast_id(shop_id), '') <> '' and cast_id = public.my_cast_id(shop_id)));

drop policy if exists wish_done_write on public.shift_wish_done;
create policy wish_done_write on public.shift_wish_done for all
  using (public.my_role(shop_id) in ('owner','staff')
         or (coalesce(public.my_cast_id(shop_id), '') <> '' and cast_id = public.my_cast_id(shop_id)))
  with check (public.my_role(shop_id) in ('owner','staff')
         or (coalesce(public.my_cast_id(shop_id), '') <> '' and cast_id = public.my_cast_id(shop_id)));
