/** 営業中に LINE へ送る文面を作る。
 *
 *  オーナーが店にいなくても、いま何組入っていて いくら上がっているかが分かるようにする。
 *
 *  ためて 1 通にまとめるのが既定。LINE の無料枠は月 200 通しかないので、
 *  1 件ずつ送ると 1 日 10 組の店で月 600 通を超えて、月の途中で送れなくなる。
 *  ここは文面を作るだけで、いつ送るかは state/notify.ts が決める。 */
import { yen } from "./format";
import type { NotifyRule, PayKind } from "./types";

export type PosEvent =
  | { kind: "enter"; at: string; seat: string; guests: number }
  | { kind: "pay"; at: string; seat: string; guests: number; amount: number; method: PayKind; tabName?: string }
  | { kind: "extend"; at: string; seat: string; min: number }
  | { kind: "void"; at: string; seat: string; name: string; reason: string; by: string }
  | { kind: "discount"; at: string; seat: string; amount: number; by: string };

/** いまの店の様子。まとめの最後に添える */
export interface NowState {
  /** 入店中の組数と人数 */
  openGroups: number;
  openGuests: number;
  /** その日ここまでの会計 */
  closedGroups: number;
  guests: number;
  cash: number;
  card: number;
  tab: number;
}

export const defaultNotify = (): NotifyRule =>
  ({ on: false, enter: true, pay: true, alert: true, batchMin: 60 });

/** その出来事を送る設定になっているか */
export function wants(rule: NotifyRule, e: PosEvent): boolean {
  if (!rule.on) return false;
  if (e.kind === "enter") return rule.enter;
  if (e.kind === "pay") return rule.pay;
  return rule.alert;   // 延長・取消・値引き
}

const clock = (iso: string): string => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "--:--";
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const howPaid = (m: PayKind, tabName?: string): string =>
  m === "cash" ? "現金" : m === "card" ? "カード" : `ツケ${tabName ? `／${tabName}` : ""}`;

/** 出来事 1 件ぶんの行 */
export function eventLine(e: PosEvent): string {
  const t = clock(e.at);
  switch (e.kind) {
    case "enter":
      return `${t} 入店　${e.seat}　${e.guests}名`;
    case "pay":
      return `${t} 会計　${e.seat}　${e.guests}名　${yen(e.amount)}（${howPaid(e.method, e.tabName)}）`;
    case "extend":
      return `${t} 延長　${e.seat}　＋${e.min}分`;
    case "void":
      return `${t} 取消　${e.seat}　${e.name}（${e.reason}）／${e.by}`;
    case "discount":
      return `${t} 値引き　${e.seat}　${yen(e.amount)}／${e.by}`;
  }
}

/** ためた出来事を 1 通にまとめる。今の様子も添えて、これだけ見れば分かるようにする */
export function batchText(events: PosEvent[], now: NowState, shopName = ""): string {
  if (!events.length) return "";
  const head = shopName ? `【${shopName}】` : "【営業中】";
  const lines = [...events]
    .sort((a, b) => a.at.localeCompare(b.at))
    .map(eventLine);

  const sales = now.cash + now.card + now.tab;
  const sum: string[] = [];
  sum.push(`いま ${now.openGroups}組 ${now.openGuests}名`);
  sum.push(`本日 ${now.closedGroups}組 ${now.guests}名 ・ ${yen(sales)}`);
  const inner: string[] = [];
  if (now.cash) inner.push(`現金 ${yen(now.cash)}`);
  if (now.card) inner.push(`カード ${yen(now.card)}`);
  if (now.tab) inner.push(`ツケ ${yen(now.tab)}`);
  if (inner.length > 1) sum.push(`（${inner.join(" ／ ")}）`);

  return [head, ...lines, "", ...sum].join("\n");
}

/** ひと月にだいたい何通になるか。設定を選ぶときの目安に出す。
 *  営業 6 時間・月 26 日を前提にした概算 */
export function monthlyEstimate(rule: NotifyRule, groupsPerDay: number, daysPerMonth = 26, openHours = 6): number {
  if (!rule.on) return 0;
  if (rule.batchMin <= 0) {
    // ためずに送る。1 組あたり 入店＋会計 で最大 2 通
    const perGroup = (rule.enter ? 1 : 0) + (rule.pay ? 1 : 0);
    return Math.round(groupsPerDay * perGroup * daysPerMonth);
  }
  // まとめて送る。出来事が無かった区切りは送らないので、組数で頭打ちになる
  const slots = Math.ceil((openHours * 60) / rule.batchMin);
  const perGroup = (rule.enter ? 1 : 0) + (rule.pay ? 1 : 0);
  return Math.round(Math.min(slots, groupsPerDay * perGroup) * daysPerMonth);
}

/** LINE の無料枠（コミュニケーションプラン）。超えると送れなくなる */
export const FREE_LIMIT = 200;
