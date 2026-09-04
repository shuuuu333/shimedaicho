# Supabase の設定手順（Phase 2: クラウド同期）

所要 10 分。ブラウザで https://supabase.com にログインして進めます。

## 1. テーブルと権限を作る
1. ダッシュボード左の **SQL Editor** → **New query**
2. このリポジトリの `supabase/schema.sql` の中身を貼り付けて **Run**
3. 「Success. No rows returned」と出れば OK（何度実行しても安全）

## 2. ログイン（メールのリンク）を有効にする
1. **Authentication → Providers → Email**: Enable Email provider を ON、
   「Confirm email」は OFF でもよい（リンクを踏んだ時点で確認済みになる）
2. **Authentication → URL Configuration**
   - Site URL: 実際に使う URL（開発中は `http://localhost:5173`）
   - Redirect URLs に次を追加: `http://localhost:5173/**` と `https://shuuuu333.github.io/shimedaicho/**`
   - Site URL は公開後 `https://shuuuu333.github.io/shimedaicho` にする
3. メール送信は Supabase 付属のもので可（1 時間 3〜4 通まで）。本番はカスタム SMTP を推奨

## 3. アプリにキーを入れる
1. **Project Settings → API** の Project URL と anon public key を控える
2. リポジトリ直下に `.env.local` を作る（`.env.example` をコピー）:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
3. `npm run dev` を起動し直す

service_role key はアプリに入れない（誰でも全データを読めてしまう）。

## 4. 使い方
1. アプリの 設定 → クラウド同期 でメールアドレスを入れる → 届いたリンクを開く
2. 「店を作る」で店名を入れる。今の端末のデータがその店にアップロードされる
3. スタッフを入れるときは「メンバーを追加」にメールを登録 → その人が同じ手順でログインすると店が見える
4. 別の端末では、ログイン → 店を選ぶ → クラウドのデータが降りてくる

## 仕組み（短く）
- 台帳は店ごとに 1 つの JSON（`ledgers` テーブル）。端末内 IndexedDB にも常に保存し、オフラインでも入力できる
- 入力すると 1.5 秒後にクラウドへ送る。同時に他の端末が変えていた場合は、変えた日だけを重ねて（日単位のマージ）保存し直す
- 他の端末の変更は Realtime で数秒以内に届く
- 誰が見られるかは Postgres の RLS（`is_member`）で決まる。アプリ側の細工では回避できない
