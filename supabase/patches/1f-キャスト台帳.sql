-- 1-f 🔴1: キャストに台帳を丸ごと見せるのをやめる
--
-- schema.sql の末尾（283 行目以降）をそのまま切り出したもの。
-- Supabase の SQL Editor に貼って Run するためのファイル。
-- 何度実行しても安全（add column if not exists / create or replace / drop policy if exists）。
--
-- 実行しても既存のアプリは壊れない。クライアントは関数が無ければ
-- 今までの経路に落ちる作りになっている（src/data/cloud.ts の myMember / pullCastLedger）。
-- 実行すると、その落ちる経路を使わなくなる。

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
