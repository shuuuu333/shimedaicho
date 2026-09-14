/** 設定の索引。どの項目がどのまとまりに入っていて、どんな言葉で探せるか。
 *
 *  画面の見出しをそのまま探しても見つからない。「手数料」を直したい人は
 *  「カード」でも「％」でも探すし、「バック」を「歩合」と呼ぶ店もある。
 *  だから見出しとは別に、その項目を指す言い方（keys）を並べて持つ。 */

export interface SettingItem {
  /** 飛び先。画面の id="set-<anchor>" と対応する */
  anchor: string;
  /** 開くまとまり */
  group: string;
  title: string;
  /** 一覧に出す補足 */
  sub: string;
  /** 探すときの手がかり。見出しに出ていない言い方をここに入れる */
  keys: string[];
}

export const SETTING_GROUPS: Record<string, string> = {
  shop: "お店のこと",
  pay: "給料のルール",
  pos: "レジ",
  money: "現金と固定費",
  share: "共有と安全",
  data: "データ",
  app: "アプリのこと",
};

export const SETTING_ITEMS: SettingItem[] = [
  { anchor: "shop", group: "shop", title: "店舗", sub: "店名・基本時給・カード手数料・住所・登録番号",
    keys: ["店名", "みせ", "時給", "じきゅう", "基本時給", "給与の丸め", "丸め", "まるめ", "出勤時刻", "退勤時刻", "初期値",
           "派遣", "はけん", "日給", "保証", "カード手数料", "手数料", "てすうりょう", "カード", "％", "%",
           "住所", "電話", "領収書", "インボイス", "登録番号", "適格請求書"] },
  { anchor: "backs", group: "pay", title: "バックの単価", sub: "ドリンク・指名・同伴の歩合",
    keys: ["バック", "ばっく", "歩合", "ぶあい", "単価", "ドリンク", "指名", "同伴", "ボトル", "チェキ", "本数", "上限", "下限"] },
  { anchor: "pos", group: "pos", title: "会計のルール", sub: "セット料金・延長・消費税・テーブルチャージ",
    keys: ["セット", "せっと", "料金", "延長", "えんちょう", "消費税", "税", "ぜい", "内税", "外税",
           "テーブルチャージ", "チャージ", "丸め", "アラート", "自動延長", "40分", "時間"] },
  { anchor: "menu", group: "pos", title: "商品", sub: "レジに出す商品と、つながるバック項目",
    keys: ["商品", "メニュー", "めにゅー", "品", "値段", "価格", "お通し", "チャージ", "自動投入", "カテゴリ"] },
  { anchor: "seats", group: "pos", title: "席", sub: "カウンター・テーブルの並び",
    keys: ["席", "せき", "カウンター", "テーブル", "卓", "たく"] },
  { anchor: "cash", group: "money", title: "現金の起点", sub: "いつ いくらから数え始めるか",
    keys: ["現金", "げんきん", "起点", "きてん", "開始", "残高", "金庫", "レジ金"] },
  { anchor: "fixed", group: "money", title: "月の固定費", sub: "家賃・固定人件費",
    keys: ["固定費", "こていひ", "家賃", "やちん", "固定人件費", "月額", "経費"] },
  { anchor: "cloud", group: "share", title: "クラウド同期", sub: "ログイン・店の共有・メンバー",
    keys: ["クラウド", "同期", "どうき", "ログイン", "共有", "きょうゆう", "招待", "メンバー", "スタッフ",
           "キャスト", "権限", "アカウント", "supabase", "バックアップ"] },
  { anchor: "line", group: "share", title: "LINE 通知", sub: "締めの日報・営業中の知らせ",
    keys: ["LINE", "ライン", "らいん", "通知", "つうち", "日報", "知らせ", "送る"] },
  { anchor: "pin", group: "share", title: "暗証番号", sub: "アプリを開くときのロック",
    keys: ["暗証番号", "あんしょう", "PIN", "ピン", "ロック", "鍵", "パスワード", "security"] },
  { anchor: "data", group: "data", title: "バックアップと読み込み", sub: "書き出し・読み込み・保存の履歴",
    keys: ["バックアップ", "ばっくあっぷ", "書き出し", "読み込み", "復元", "履歴", "CSV", "保存", "エクスポート", "インポート"] },
  { anchor: "theme", group: "app", title: "見た目", sub: "明るい・暗い・端末に合わせる",
    keys: ["見た目", "テーマ", "ダークモード", "暗い", "明るい", "色", "いろ", "dark", "light"] },
  { anchor: "install", group: "app", title: "ホーム画面に追加", sub: "アプリとして開けるようにする",
    keys: ["ホーム画面", "インストール", "追加", "アプリ", "PWA", "アイコン"] },
  { anchor: "version", group: "app", title: "版と使い方", sub: "バージョン・使い方",
    keys: ["版", "バージョン", "version", "使い方", "つかいかた", "ヘルプ", "更新"] },
];

/** ひらがな・カタカナ・大小・全角半角のゆれを吸収して比べる。
 *  「LINE」と「line」、「ばっく」と「バック」を別ものにしない */
function norm(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))   // カタカナ → ひらがな
    .replace(/[\s・･、。]/g, "");
}

/** 設定を探す。空なら何も返さない（全件を出すと一覧と二重になる） */
export function searchSettings(q: string): SettingItem[] {
  const n = norm(q);
  if (!n) return [];
  const hit = (it: SettingItem): number => {
    const title = norm(it.title), sub = norm(it.sub), grp = norm(SETTING_GROUPS[it.group] ?? "");
    if (title.startsWith(n)) return 0;              // 見出しの頭 … 一番それらしい
    if (title.includes(n)) return 1;
    if (it.keys.some((k) => norm(k) === n)) return 2;   // 言い換えがぴたり
    if (it.keys.some((k) => norm(k).includes(n))) return 3;
    if (sub.includes(n) || grp.includes(n)) return 4;
    return -1;
  };
  return SETTING_ITEMS
    .map((it) => ({ it, r: hit(it) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r)
    .map((x) => x.it);
}
