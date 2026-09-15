-- 1 台で店とキャストを行き来できるようにする
--
-- 同じ端末・同じアカウントでは、役割を 2 つ持てない。
-- それでも 1 台でためしたいので、穴を 2 つ塞ぐ。
--
-- ① オーナーが自分でキャストの QR を読むと、同じ人に
--    「オーナーの行」と「qr: の行」が 2 つできる。my_member は limit 1 なので、
--    どちらが返るかはその時次第。ある日いきなり自分の店の数字が見えなくなる。
--    → 強い役割から返す。
-- ② そもそもオーナーが自分の店の招待を読む必要がない。
--    → 読んだら、はっきり断る。
--
-- 何度実行しても安全。
-- ============================================================

-- ① 役割が 2 つあるときは、強いほうを返す
create or replace function public.my_member(sid uuid)
returns table (role text, name text, cast_id text, can_register boolean)
language sql stable security definer set search_path = public as $$
  select m.role, m.name, m.cast_id, m.can_register
  from public.shop_members m
  where m.shop_id = sid
    and (m.user_id = auth.uid() or lower(m.email) = public.my_email())
  order by case m.role when 'owner' then 0 when 'staff' then 1 else 2 end
  limit 1;
$$;
revoke all on function public.my_member(uuid) from public;
grant execute on function public.my_member(uuid) to authenticated;

-- ② オーナーは自分の店の招待を使えない（使う必要がない）
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
  -- 自分の店に、自分をキャストとして足さない。役割が 2 つになって壊れる
  if public.my_role(inv.shop_id) = 'owner' then
    raise exception 'この店のオーナーです。キャスト手帳は、ログインしたまま「どの子として見るか」を選べます';
  end if;

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
