/** 営業中の LINE 通知。出来事をためて、決めた間隔で 1 通にまとめて送る。
 *
 *  ここは「送る」だけを持つ。文面は domain/notify.ts、送信は cloud の Edge Function。
 *
 *  守っていること
 *  - 送信に失敗しても、レジの操作は絶対に止めない（黙って捨てる）
 *  - 送った数を端末に数えておく。LINE の無料枠は月 200 通しかないので、
 *    知らないうちに超えて「送れなくなっていた」が一番困る
 *  - 画面を閉じるときに、ためたぶんを送り切る */
import { batchText, wants, type NowState, type PosEvent } from "../domain/notify";
import { defaultNotify } from "../domain/notify";
import { useApp } from "./store";
import { useCloud } from "./cloud";

const LS_COUNT = "shimedaicho.lineCount";

interface Counter { month: string; n: number }

function readCount(): Counter {
  const m = new Date().toISOString().slice(0, 7);
  try {
    const raw = localStorage.getItem(LS_COUNT);
    if (raw) {
      const c = JSON.parse(raw) as Counter;
      if (c && c.month === m && Number.isFinite(c.n)) return c;
    }
  } catch { /* ignore */ }
  return { month: m, n: 0 };
}

function bump(): void {
  const c = readCount();
  try { localStorage.setItem(LS_COUNT, JSON.stringify({ month: c.month, n: c.n + 1 })); } catch { /* ignore */ }
}

/** この端末から今月 LINE に送った通数（締めの日報ぶんも含む） */
export function sentThisMonth(): number {
  return readCount().n;
}
/** 締めの日報を送ったときにも数える */
export function countSent(): void {
  bump();
}

let queue: PosEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

const rule = () => useApp.getState().ledger.shop.notify ?? defaultNotify();

/** いま送れる端末か。キャストの端末は Edge Function 側で弾かれるので呼ばない */
function canSend(): boolean {
  try {
    const c = useCloud.getState();
    return !!c.shopId && c.role() !== "cast";
  } catch { return false; }
}

/** ためた出来事を 1 通にして送る。中身が無ければ何もしない */
export function flushNotify(): void {
  if (timer) { clearTimeout(timer); timer = null; }
  const events = queue;
  queue = [];
  if (!events.length || !canSend()) return;
  const app = useApp.getState();
  const text = batchText(events, nowState(), app.ledger.shop.name);
  if (!text) return;
  bump();
  // 送れなくても営業は続く。握りつぶして、締めの日報だけは別経路で送れるようにしておく
  void useCloud.getState().sendLine(text).catch(() => { /* ignore */ });
}

/** 出来事を 1 件ためる。設定に合っていなければ捨てる */
export function notifyPos(e: PosEvent): void {
  const r = rule();
  if (!wants(r, e) || !canSend()) return;
  queue.push(e);
  if (r.batchMin <= 0) { flushNotify(); return; }
  if (timer) return;   // すでに次の送信を待っている
  timer = setTimeout(flushNotify, r.batchMin * 60000);
}

/** 通知に添える「いまの様子」。伝票から数える */
function nowState(): NowState {
  const s: NowState = { openGroups: 0, openGuests: 0, closedGroups: 0, guests: 0, cash: 0, card: 0, tab: 0 };
  try {
    // 循環参照を避けるため、pos ストアはここで読む（import は下で遅延）
    const pos = usePosRef?.getState();
    if (!pos) return s;
    for (const c of pos.checks.filter((x) => x.date === pos.date)) {
      if (c.status === "open") { s.openGroups++; s.openGuests += Math.max(0, Math.floor(c.guests)); continue; }
      s.closedGroups++;
      s.guests += Math.max(0, Math.floor(c.guests));
      for (const p of c.payments) {
        const amt = Math.floor(p.amount);
        if (p.method === "cash") s.cash += amt;
        else if (p.method === "tab") s.tab += amt;
        else s.card += amt;
      }
    }
  } catch { /* ignore */ }
  return s;
}

/** pos ストアは notify を呼ぶので、逆向きの import を作らないよう後から渡す */
type PosLike = { getState(): { checks: { date: string; status: string; guests: number; payments: { method: string; amount: number }[] }[]; date: string } };
let usePosRef: PosLike | null = null;
export function bindPosStore(store: PosLike): void { usePosRef = store; }
