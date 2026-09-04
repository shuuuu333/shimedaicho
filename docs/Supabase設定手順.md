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

## 5. メール送信を自前にする（1 時間 2 通の上限を外す・6 桁コードを使う）

Supabase 付属のメール送信は 1 時間に 2 通までで、メール文面も変えられません。
Gmail から送るようにすると 1 日 500 通まで送れ、文面に 6 桁コードを入れられます。

### 5-1. Gmail の「アプリ パスワード」を作る（あなたが行う）
1. https://myaccount.google.com/security で **2 段階認証プロセス** をオンにする（まだなら）
2. https://myaccount.google.com/apppasswords を開き、アプリ名に「締め台帳」と入れて **作成**
3. 表示された 16 文字のパスワードを控える（この画面を閉じると二度と見られません）

### 5-2. Supabase に SMTP を設定する（あなたが行う。パスワードを扱うため）
Authentication → Emails → **SMTP Settings** → Enable Custom SMTP を ON にして:

| 項目 | 値 |
|---|---|
| Sender email | あなたの Gmail アドレス |
| Sender name | 締め台帳 |
| Host | smtp.gmail.com |
| Port number | 465 |
| Username | あなたの Gmail アドレス |
| Password | 5-1 で作った 16 文字 |

保存したら、Authentication → Rate Limits の「Rate limit for sending emails」を 30 などに上げる。

### 5-3. メールの文面に 6 桁コードを入れる
Authentication → Emails → Templates → **Magic link or OTP** を開き、本文を次のようにする（`{{ .Token }}` がコード、`{{ .ConfirmationURL }}` がリンク）:

```html
<h2>締め台帳のログイン</h2>
<p>アプリに次の 6 桁のコードを入力してください。</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:.2em">{{ .Token }}</p>
<p>または <a href="{{ .ConfirmationURL }}">このリンクを開く</a> とログインできます（開いた端末でログインされます）。</p>
<p style="color:#888;font-size:12px">このメールに心当たりがなければ無視してください。</p>
```
件名は「締め台帳 ログインコード」など。
