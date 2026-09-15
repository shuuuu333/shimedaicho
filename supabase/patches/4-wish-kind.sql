-- 変更のお願い（決まったシフトを変えてほしい）
--
-- 入れ物は希望（shift_wishes）と同じ。予定がある日に出された希望は、
-- 意味として変更のお願いそのもので、別に持つと同じことを 2 か所で持つことになる。
--
-- 見分けは kind。**出すときに書く。**
-- あとから「時刻が予定と違う＝お願い」と当てにいくと、どちらが先に入ったかは
-- 記録に残らないので、ふつうの希望が勝手にお願いに化ける。
--
--   want   … ふつうの希望（まだ決まっていない日に出した）
--   change … 決まった日の時間を変えてほしい
--   off    … 決まった日を休みたい
--
-- 何度実行しても安全。
-- ============================================================

alter table public.shift_wishes add column if not exists kind text not null default 'want';

alter table public.shift_wishes drop constraint if exists shift_wishes_kind_chk;
alter table public.shift_wishes add constraint shift_wishes_kind_chk
  check (kind in ('want', 'change', 'off'));
