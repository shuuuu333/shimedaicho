/** はじめの設定。何が残っているかを出すためのもの。
 *
 *  新しい店がこのアプリを開くと、値段も時給もバックも「よその店の数字」が
 *  入った状態で始まる。空にすると初回が真っ白になるので、何か入れてある。
 *  そのままレジを打つと、合わない金額が出て、そこで信用を失う。
 *
 *  だから「あと何を直せば自分の店の数字になるか」を一覧で出す。
 *  店名とキャストは入れたかどうかが分かるので自動で消える。
 *  値段や単価は「その額が正しいのか」をこちらから判断できないので、
 *  見て確かめたと押してもらう。勝手に済んだことにはしない。 */
import type { Ledger } from "./types";

export interface SetupStep {
  id: string;
  title: string;
  why: string;
  /** 設定画面のどこへ飛ぶか（Settings の set-<anchor>）。
   *  tab が入っているものは設定ではなく、その画面へ行く */
  anchor: string;
  tab?: "cast";
  /** 押して確かめてもらう必要があるか。false なら中身から分かる */
  ask: boolean;
}

export const SETUP_STEPS: readonly SetupStep[] = [
  { id: "name", title: "店名を入れる", why: "日報と LINE の通知に出ます", anchor: "shop", ask: false },
  { id: "wage", title: "基本時給を決める", why: "ここを直さないと、給料が全員ちがう額で出ます", anchor: "shop", ask: true },
  { id: "set", title: "セット料金と時間", why: "入っている 60分 ¥3,000 はよその店の数字です", anchor: "pos", ask: true },
  { id: "menu", title: "商品の値段", why: "12 品が入っています。自分の店の値段に直してください", anchor: "menu", ask: true },
  { id: "backs", title: "バックの単価", why: "ドリンク・指名・同伴の単価。給料はここで決まります", anchor: "backs", ask: true },
  { id: "casts", title: "キャストを入れる", why: "名前と時給。シフトの画面からも足せます", anchor: "castList", tab: "cast", ask: false },
  { id: "cash", title: "現金の起点", why: "いつ いくらから数え始めるか。現金の照合に使います", anchor: "cash", ask: true },
];

/** 中身から分かるぶんの判定。押してもらう必要のない項目 */
function known(L: Ledger, id: string): boolean | null {
  if (id === "name") return L.shop.name.trim() !== "";
  if (id === "casts") return L.casts.length > 0;
  return null;
}

/** まだ残っている手順。`done` は「確かめた」と押されたものの id */
export function remainingSteps(L: Ledger, done: readonly string[]): SetupStep[] {
  return SETUP_STEPS.filter((s) => {
    const k = known(L, s.id);
    if (k !== null) return !k;          // 入れたかどうかが分かるものは、それで決める
    return !done.includes(s.id);
  });
}

/** 済んだ数と全部の数。「あと 3 つ」と出すため */
export function setupProgress(L: Ledger, done: readonly string[]): { done: number; total: number } {
  const left = remainingSteps(L, done).length;
  return { done: SETUP_STEPS.length - left, total: SETUP_STEPS.length };
}

/** 使い始めたあとの店には出さない。
 *  日報が何日か入っているなら、設定はもう自分のものになっている */
export function needsSetup(L: Ledger, done: readonly string[]): boolean {
  if (Object.keys(L.days).length >= 3) return false;
  return remainingSteps(L, done).length > 0;
}
