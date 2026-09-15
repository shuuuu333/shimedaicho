/** どちらのアプリとして動いているか。
 *
 *  リポジトリは 1 つのまま、ビルドのときの VITE_APP で 2 つに出し分ける。
 *  `calc.ts` を 2 回書くと必ずずれるので、中身は共有したままにしてある。
 *
 *  shop … 締め台帳（店用）。レジ・日報・シフト・キャスト・設定
 *  cast … キャスト手帳（本人用）。自分のシフトと給料だけ
 *
 *  違いは「入口」だけで、計算も保存も同期も同じものを使う。 */
export const APP: "shop" | "cast" = import.meta.env.VITE_APP === "cast" ? "cast" : "shop";
export const IS_CAST_APP = APP === "cast";

/** 画面に出す名前。ヘッダーとようこそ画面で使う */
export const APP_NAME = APP === "cast" ? "キャスト手帳" : "締め台帳";
