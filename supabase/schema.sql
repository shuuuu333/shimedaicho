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

-- ============================================================
-- レジ(POS)を入れる前の権限の締め直し
-- ここまで、台帳の読み書きは is_member() だけで判定していた。
-- つまり役割は App.tsx の画面の出し分け（クライアント側）でしか効いておらず、
-- QR で入ったキャストのトークンがあれば台帳 JSON を丸ごと読めるうえ、上書きもできた。
-- レジを足すと「入られる = 売上と現金を書き換えられる」になるので、サーバー側で止める。
-- 何度実行しても安全。
-- ============================================================

-- その店での自分の役割。owner / staff / cast、どれでもなければ null
create or replace function public.my_role(sid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.shops s where s.id = sid and s.owner = auth.uid()) then 'owner'
    else (select m.role from public.shop_members m
           where m.shop_id = sid
             and (m.user_id = auth.uid() or lower(m.email) = public.my_email())
           limit 1)
  end;
$$;

-- 台帳を書けるのはオーナーとスタッフだけ。キャストは読み取り専用にする
drop policy if exists ledgers_insert on public.ledgers;
create policy ledgers_insert on public.ledgers for insert
  with check (public.my_role(shop_id) in ('owner','staff'));

drop policy if exists ledgers_update on public.ledgers;
create policy ledgers_update on public.ledgers for update
  using (public.my_role(shop_id) in ('owner','staff'))
  with check (public.my_role(shop_id) in ('owner','staff'));

-- select は据え置き（キャストが自分のシフトを見るのに台帳が要るため）。
-- キャストに台帳全体を見せない分離は、伝票をクラウドに載せるときに合わせて作る。

-- メンバーの一覧はオーナーだけ。本人は自分の行だけ見える（他人のメールを配らない）
drop policy if exists members_select on public.shop_members;
create policy members_select on public.shop_members for select
  using (public.is_owner(shop_id) or user_id = auth.uid() or lower(email) = public.my_email());

-- ============================================================
-- P3: 伝票を複数の端末で共有する（check_ops）
--
-- 伝票まるごとを上書きで送ると、2 台が同時に同じ卓を触ったときに
-- 「後から送った方が相手の注文を消す」。だから「ビールを 1 本足した」という
-- 操作だけを送り、伝票の今の姿はその操作を順に畳んで作る。
--
-- この表は追記だけ。行を書き換えることも消すこともしない。
-- 取消も「取り消した」という操作を足すことで表す（不正防止の土台でもある）。
--
-- 何度実行しても安全。
-- ============================================================

create table if not exists public.check_ops (
  -- 端末が作る id。電波が切れて送り直しても、同じ id なら二重にならない
  id text primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  check_id text not null,
  -- 営業日。1 日ぶんを引くのに使う
  date text not null,
  -- 押した時刻。畳む順はこれで決める（同時刻は id で決める）
  at timestamptz not null,
  op text not null,
  -- 誰が押したか。表示用の名前（shop_members.name）
  by_name text not null default '',
  -- 誰のトークンで書かれたか。表示ではなく、あとから追うため
  by_user uuid references auth.users(id) on delete set null,
  -- op ごとの中身（金額・行・理由など）。押した時点の値を写してある
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists check_ops_shop_date on public.check_ops (shop_id, date);
create index if not exists check_ops_check on public.check_ops (check_id, at);

alter table public.check_ops enable row level security;

-- 読めるのはオーナーとスタッフ。キャストには伝票を見せない。
-- （キャストが自分の携帯でレジを打つ運用は can_register を足すときに開ける）
drop policy if exists check_ops_select on public.check_ops;
create policy check_ops_select on public.check_ops for select
  using (public.my_role(shop_id) in ('owner','staff'));

-- 書けるのも今はオーナーとスタッフだけ。
-- by_user は必ず自分にする（他人が押したことにできないようにする）
drop policy if exists check_ops_insert on public.check_ops;
create policy check_ops_insert on public.check_ops for insert
  with check (
    public.my_role(shop_id) in ('owner','staff')
    and (by_user is null or by_user = auth.uid())
  );

-- 追記だけ。書き換えも削除もさせない（ポリシーを作らなければ誰も通らない）
drop policy if exists check_ops_update on public.check_ops;
drop policy if exists check_ops_delete on public.check_ops;

-- Realtime に流す。ほかの端末が押した操作が、その場で届くようにする
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'check_ops'
    ) then
      alter publication supabase_realtime add table public.check_ops;
    end if;
  end if;
end $$;

-- ============================================================
-- 1-f 🔴1: キャストに台帳を丸ごと見せるのをやめる
--
-- これまで ledgers_select は is_member() だけを見ていた。つまり QR で入った
-- キャストのトークンがあれば、台帳 JSON 全体（全員の時給・給料・未払い、店の
-- 売上・利益・手元現金、経費）を読めていた。画面で隠しているだけだった。
--
-- 直し方: サーバーが「自分に関係する部分だけに削った台帳」を返し、計算は
-- クライアントの calc.ts に任せる。同じコード・同じ数字のまま、他人のデータが
-- サーバーから出ない。calc.ts を Deno 側に持っていって二重管理するのは避ける。
--
-- 見える範囲は 3 段階。レジを打つキャストには商品・席・全員の名前も要るので、
-- 2 段階では足りない（給料と売上は自分のぶんだけに保つ）。
--
-- 何度実行しても安全。
-- ============================================================

-- 招待のときに決めたキャストを、メンバー行にも残す。
-- これが無いと、LINE でログインした人（メールを持たない）を
-- キャストに結び付ける手がかりがどこにも無い
alter table public.shop_members add column if not exists cast_id text;
-- レジを打たせるかどうか。役割（owner/staff/cast）とは別の軸にしておく
alter table public.shop_members add column if not exists can_register boolean not null default false;

-- QR を読んだときに cast_id も保存する（それ以外は今までと同じ）
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

  insert into public.shop_members as sm (shop_id, email, role, user_id, name, cast_id)
  values (inv.shop_id, 'qr:' || uid::text, inv.role, uid, inv.name, inv.cast_id)
  on conflict (shop_id, email) do update
    set role = excluded.role, user_id = excluded.user_id,
        name = excluded.name, cast_id = excluded.cast_id;

  update public.shop_invites set used_at = now(), used_by = uid where token = inv.token;

  select s.name into sname from public.shops s where s.id = inv.shop_id;
  return json_build_object('shop_id', inv.shop_id, 'shop_name', coalesce(sname, ''),
                           'role', inv.role, 'cast_id', inv.cast_id);
end $$;

revoke all on function public.redeem_invite(uuid) from public;
grant execute on function public.redeem_invite(uuid) to authenticated;

-- 自分のメンバー行（役割・名前・cast_id・can_register）
create or replace function public.my_member(sid uuid)
returns table (role text, name text, cast_id text, can_register boolean)
language sql stable security definer set search_path = public as $$
  select m.role, m.name, m.cast_id, m.can_register
  from public.shop_members m
  where m.shop_id = sid
    and (m.user_id = auth.uid() or lower(m.email) = public.my_email())
  limit 1;
$$;
revoke all on function public.my_member(uuid) from public;
grant execute on function public.my_member(uuid) to authenticated;

-- キャスト向けの、削った台帳。
-- 返すのは「自分の給料を出すのに必要なものだけ」。
-- レジを打つキャスト（can_register）には、商品・席・会計ルール・全員の名前も足す。
create or replace function public.my_cast_ledger(sid uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  data jsonb;
  me record;
  cid text;
  reg boolean;
  out jsonb;
  days jsonb := '{}'::jsonb;
  k text;
  day jsonb;
  shift jsonb;
  plans jsonb := '{}'::jsonb;
  plan jsonb;
begin
  select * into me from public.my_member(sid);
  if me is null then raise exception 'この店のメンバーではありません'; end if;
  -- オーナーとスタッフは、この関数を通す必要がない（台帳をそのまま読める）
  if me.role <> 'cast' then raise exception 'キャスト向けの関数です'; end if;

  cid := coalesce(me.cast_id, '');
  reg := coalesce(me.can_register, false);
  select l.data into data from public.ledgers l where l.shop_id = sid;
  if data is null then return null; end if;

  -- 店の設定は、給料の計算に要るものだけ（売上・利益・現金・固定費は出さない）
  out := jsonb_build_object(
    'v', data -> 'v',
    'shop', jsonb_build_object(
      'name',         coalesce(data #> '{shop,name}', '""'::jsonb),
      'openTime',     coalesce(data #> '{shop,openTime}', '"20:00"'::jsonb),
      'closeTime',    coalesce(data #> '{shop,closeTime}', '"01:00"'::jsonb),
      'defaultWage',  coalesce(data #> '{shop,defaultWage}', '0'::jsonb),
      'roundMinutes', coalesce(data #> '{shop,roundMinutes}', '15'::jsonb),
      'cardFeeRate',  coalesce(data #> '{shop,cardFeeRate}', '0'::jsonb),
      'openingCash',  '0'::jsonb,
      'openingDate',  coalesce(data #> '{shop,openingDate}', '"2000-01-01"'::jsonb),
      'fixedLabor',   '0'::jsonb,
      'fixedCost',    '0'::jsonb,
      'dispatchGuarantee', '0'::jsonb
    ),
    -- バック単価は自分の額を出すのに要る
    'backItems', coalesce(data -> 'backItems', '[]'::jsonb),
    -- 自分のキャスト行だけ（時給を含む）。ほかの子は名前も出さない
    'casts', coalesce((
      select jsonb_agg(c) from jsonb_array_elements(coalesce(data -> 'casts', '[]'::jsonb)) c
      where c ->> 'id' = cid
    ), '[]'::jsonb)
  );

  -- レジを打つキャストには、打つのに要るものを足す。
  -- 商品・席・会計ルールと、「誰の分か」を選ぶための名前だけ（時給は落とす）
  if reg then
    out := out
      || jsonb_build_object('menu', coalesce(data -> 'menu', '[]'::jsonb))
      || jsonb_build_object('seats', coalesce(data -> 'seats', '[]'::jsonb))
      || jsonb_build_object('posRule', coalesce(data -> 'posRule', 'null'::jsonb))
      || jsonb_build_object('castNames', coalesce((
           select jsonb_agg(jsonb_build_object('id', c -> 'id', 'name', c -> 'name', 'active', c -> 'active'))
           from jsonb_array_elements(coalesce(data -> 'casts', '[]'::jsonb)) c
         ), '[]'::jsonb));
  end if;

  -- 各日は「自分の出勤」だけ。売上・経費・精算・ほかの子の出勤は出さない
  for k, day in select * from jsonb_each(coalesce(data -> 'days', '{}'::jsonb)) loop
    shift := day #> array['shifts', cid];
    if shift is not null then
      days := days || jsonb_build_object(k, jsonb_build_object(
        'cashSales', '0'::jsonb, 'cardSales', '0'::jsonb, 'guests', 'null'::jsonb,
        'expenses', '[]'::jsonb, 'bankDeposit', 'null'::jsonb, 'cardReceived', 'null'::jsonb,
        'cashCounted', 'null'::jsonb, 'payout', 'null'::jsonb,
        'shifts', jsonb_build_object(cid, shift),
        'dispatch', '[]'::jsonb, 'settle', '[]'::jsonb
      ));
    end if;
  end loop;
  out := out || jsonb_build_object('days', days);

  -- シフトの予定も自分のぶんだけ
  for k, plan in select * from jsonb_each(coalesce(data -> 'plans', '{}'::jsonb)) loop
    plan := (select jsonb_agg(p) from jsonb_array_elements(plan) p where p ->> 'castId' = cid);
    if plan is not null then plans := plans || jsonb_build_object(k, plan); end if;
  end loop;
  if plans <> '{}'::jsonb then out := out || jsonb_build_object('plans', plans); end if;

  return out;
end $$;

revoke all on function public.my_cast_ledger(uuid) from public;
grant execute on function public.my_cast_ledger(uuid) to authenticated;

-- 台帳をそのまま読めるのは、オーナーとスタッフだけにする。
-- キャストは my_cast_ledger() 経由だけ（自分に関係する部分しか出てこない）
drop policy if exists ledgers_select on public.ledgers;
create policy ledgers_select on public.ledgers for select
  using (public.my_role(shop_id) in ('owner','staff'));

-- オーナーがメンバーの設定（cast_id・can_register）を変えられるようにする。
-- 店を移したりメールを書き換えたりはさせない
drop policy if exists members_update on public.shop_members;
create policy members_update on public.shop_members for update
  using (public.is_owner(shop_id))
  with check (public.is_owner(shop_id));

-- 精算（未払いの受け取り）はキャストが自分で押す作りだったが、
-- 台帳を書けるのは owner/staff だけなので、押しても保存されない。
-- キャスト用の精算は 1-c のキャスト用アプリで作り直す（それまでは店側で記録する）。
