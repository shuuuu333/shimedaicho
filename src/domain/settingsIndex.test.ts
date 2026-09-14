import { describe, it, expect } from "vitest";
import { SETTING_GROUPS, SETTING_ITEMS, searchSettings } from "./settingsIndex";

describe("設定の索引", () => {
  it("飛び先のまとまりは、必ず実在するものを指している", () => {
    for (const it of SETTING_ITEMS) expect(SETTING_GROUPS[it.group], it.anchor).toBeTruthy();
  });

  it("同じ飛び先を二重に登録していない", () => {
    const a = SETTING_ITEMS.map((x) => x.anchor);
    expect(new Set(a).size).toBe(a.length);
  });
});

describe("設定を探す", () => {
  const anchors = (q: string) => searchSettings(q).map((x) => x.anchor);

  it("空のときは何も返さない（一覧と二重に出さない）", () => {
    expect(searchSettings("")).toEqual([]);
    expect(searchSettings("   ")).toEqual([]);
  });

  it("見出しに出ていない言い方でも見つかる", () => {
    // 「手数料」は店舗の欄にあるが、見出しは「店舗」
    expect(anchors("手数料")).toContain("shop");
    // 「歩合」と呼ぶ店もある
    expect(anchors("歩合")).toContain("backs");
    // 「家賃」は見出しに無い
    expect(anchors("家賃")).toContain("fixed");
  });

  it("ひらがな・カタカナ・大文字小文字のゆれを吸収する", () => {
    expect(anchors("ばっく")).toContain("backs");
    expect(anchors("バック")).toContain("backs");
    expect(anchors("line")).toContain("line");
    expect(anchors("ライン")).toContain("line");
    expect(anchors("ＬＩＮＥ")).toContain("line");
  });

  it("見出しに当たったものを先に出す", () => {
    // 「席」は seats の見出しそのもの。pos の言い換えにも「席」は無いので先頭
    expect(anchors("席")[0]).toBe("seats");
    // 「商品」は menu の見出し
    expect(anchors("商品")[0]).toBe("menu");
  });

  it("途中まで打っても出る", () => {
    expect(anchors("あんしょう")).toContain("pin");
    expect(anchors("バックア")).toContain("data");
  });

  it("当たらない言葉では空", () => {
    expect(searchSettings("そんな項目はない")).toEqual([]);
  });

  it("まとまりの名前でも探せる（「給料」で給料のルールの中身が出る）", () => {
    expect(anchors("給料")).toContain("backs");
  });
});
