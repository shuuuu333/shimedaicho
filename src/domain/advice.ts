/** 利益をどう上げるか。先月と比べて、何がどれだけ効いたのかを分けて見せる。
 *
 *  「先月より 12万 減った」で止まると打つ手が決まらない。
 *  客数が減ったのか、単価が落ちたのか、人件費が増えたのか、どの経費が膨らんだのか。
 *  そこまで割ってはじめて、明日から何をするかが決まる。
 *
 *  大事にしていること
 *  - 内訳の合計は、利益の差とぴったり一致させる。合わない分析は読まれない
 *  - 提案には必ず金額を添える。「気をつけましょう」は打ち手にならない
 *  - ぜんぶ台帳のデータで解ける（LLM は要らない）。言い回しだけの話 */
import { castMonth, dispatchMonth, monthTotals, num, pct } from "./calc";
import { WD, shiftMonth, yen } from "./format";
import type { Ledger, MonthTotals } from "./types";

/** 利益の差に効いた要因ひとつ。diff がプラスなら利益を押し上げた */
export interface Part { id: string; label: string; diff: number; note?: string }

export interface ProfitBridge {
  month: string;
  prevMonth: string;
  prevProfit: number;
  nowProfit: number;
  diff: number;
  /** 効いた順（絶対値の大きい順）。合計は必ず diff に一致する */
  parts: Part[];
  /** 前月に記録がなければ、比べようがない */
  ready: boolean;
}

/** 人件費を「時給・バック・派遣・まとめ日払い・控除」に割る */
interface LaborParts { wage: number; back: number; disp: number; lump: number; deduct: number }
function laborParts(L: Ledger, m: string, t: MonthTotals): LaborParts {
  const casts = castMonth(L, m);
  const disp = dispatchMonth(L, m);
  return {
    wage: casts.reduce((s, r) => s + r.wage, 0),
    back: casts.reduce((s, r) => s + r.backTotal, 0) + disp.reduce((s, r) => s + r.backTotal, 0),
    disp: disp.reduce((s, r) => s + r.guarantee, 0),
    lump: t.paidLump,
    deduct: casts.reduce((s, r) => s + r.deduct, 0) + disp.reduce((s, r) => s + r.deduct, 0),
  };
}

/** 利益の差を要因ごとに分ける。
 *  売上は「客数のせい」と「単価のせい」に割る。
 *  （客数差 × 先月の単価）＋（単価差 × 今月の客数）＝ 売上差 に、きっちり一致する */
export function profitBridge(L: Ledger, m: string): ProfitBridge {
  const pm = shiftMonth(m, -1);
  const a = monthTotals(L, m);
  const p = monthTotals(L, pm);
  const out: ProfitBridge = {
    month: m, prevMonth: pm,
    prevProfit: Math.round(p.profit), nowProfit: Math.round(a.profit),
    diff: Math.round(a.profit) - Math.round(p.profit),
    parts: [], ready: p.days > 0 && a.days > 0,
  };
  if (!out.ready) return out;

  const parts: Part[] = [];
  // 売上：客数と単価に割る。どちらかの月で客数が無ければ割らずに 1 本で出す
  if (a.guests > 0 && p.guests > 0) {
    const av = a.sales / a.guests, pv = p.sales / p.guests;
    parts.push({ id: "guests", label: "客数", diff: Math.round((a.guests - p.guests) * pv), note: `${p.guests}名 → ${a.guests}名` });
    parts.push({ id: "spend", label: "客単価", diff: Math.round((av - pv) * a.guests), note: `${yen(pv)} → ${yen(av)}` });
    // 丸めのずれを客単価に寄せて、合計を売上差にぴったり合わせる
    const want = Math.round(a.sales) - Math.round(p.sales);
    const got = parts[0].diff + parts[1].diff;
    if (got !== want) parts[1].diff += want - got;
  } else {
    parts.push({ id: "sales", label: "売上", diff: Math.round(a.sales) - Math.round(p.sales), note: `${yen(p.sales)} → ${yen(a.sales)}` });
  }

  // 人件費：内訳ごと。利益から見た向きにするので符号を反転する
  const la = laborParts(L, m, a), lp = laborParts(L, pm, p);
  parts.push({ id: "wage", label: "時給ぶん", diff: -(Math.round(la.wage) - Math.round(lp.wage)), note: `${yen(lp.wage)} → ${yen(la.wage)}` });
  parts.push({ id: "back", label: "バック", diff: -(Math.round(la.back) - Math.round(lp.back)), note: `${yen(lp.back)} → ${yen(la.back)}` });
  parts.push({ id: "disp", label: "派遣の日給", diff: -(Math.round(la.disp) - Math.round(lp.disp)), note: `${yen(lp.disp)} → ${yen(la.disp)}` });
  parts.push({ id: "lump", label: "まとめ日払い", diff: -(Math.round(la.lump) - Math.round(lp.lump)) });
  parts.push({ id: "deduct", label: "控除", diff: Math.round(la.deduct) - Math.round(lp.deduct) });
  parts.push({ id: "fixedLabor", label: "固定人件費", diff: -(Math.round(a.fixedLabor) - Math.round(p.fixedLabor)) });

  parts.push({ id: "exp", label: "経費", diff: -(Math.round(a.exp) - Math.round(p.exp)), note: `${yen(p.exp)} → ${yen(a.exp)}` });
  parts.push({ id: "fixedCost", label: "家賃など固定費", diff: -(Math.round(a.fixedCost) - Math.round(p.fixedCost)) });
  parts.push({ id: "fee", label: "カード手数料", diff: -(Math.round(a.fee) - Math.round(p.fee)) });

  // 端数のずれを「その他」に逃がす。内訳の合計は必ず利益の差に一致させる
  const sum = parts.reduce((s, x) => s + x.diff, 0);
  if (sum !== out.diff) parts.push({ id: "rest", label: "その他（端数）", diff: out.diff - sum });

  out.parts = parts.filter((x) => x.diff !== 0).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  return out;
}

/* ---------- 経費を項目ごとに ---------- */

export interface ExpenseDelta { name: string; now: number; prev: number; diff: number }

/** 経費を名前ごとにまとめて、先月と比べる。名前は前後の空白だけそろえる */
export function expenseDeltas(L: Ledger, m: string): ExpenseDelta[] {
  const sumOf = (mm: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (const k of Object.keys(L.days)) {
      if (!k.startsWith(mm)) continue;
      for (const e of L.days[k].expenses ?? []) {
        const name = (e.name ?? "").trim() || "（名前なし）";
        map.set(name, (map.get(name) ?? 0) + num(e.amount));
      }
    }
    return map;
  };
  const now = sumOf(m), prev = sumOf(shiftMonth(m, -1));
  const names = new Set([...now.keys(), ...prev.keys()]);
  return [...names]
    .map((name) => {
      const n = Math.round(now.get(name) ?? 0), p = Math.round(prev.get(name) ?? 0);
      return { name, now: n, prev: p, diff: n - p };
    })
    .filter((x) => x.now > 0 || x.prev > 0)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || b.now - a.now);
}

/* ---------- 曜日ごとの人件費率 ---------- */

export interface WeekdayCost { dow: number; days: number; sales: number; labor: number; rate: number }

/** 曜日ごとの「売上に対する人件費」。暇な日に人を置きすぎていないかを見る */
export function weekdayCost(L: Ledger, m: string): WeekdayCost[] {
  const acc = Array.from({ length: 7 }, (_, dow) => ({ dow, days: 0, sales: 0, labor: 0, rate: 0 }));
  for (const t of monthTotals(L, m).series) {
    const d = new Date(t.date + "T00:00:00").getDay();
    acc[d].days++;
    acc[d].sales += t.sales;
    acc[d].labor += t.labor;
  }
  for (const x of acc) x.rate = pct(x.labor, x.sales);
  return acc.filter((x) => x.days > 0);
}

/* ---------- 提案 ---------- */

export interface Advice {
  id: string;
  title: string;
  body: string;
  /** ひと月あたりの効き目（円）。大きい順に並べる */
  impact: number;
  /** profit … 利益がその額ぶん増えうる打ち手
   *  cash   … 利益は動かないが、現金繰りの手当てが要るもの
   *
   *  分けているのは、未払い給料のように「額は大きいが取り戻せないお金」が
   *  並びの先頭に来てしまうため。渡す義務のあるお金と、取り返せるお金は別もの */
  kind: "profit" | "cash";
}

/** その月のデータから、打ち手を並べる。
 *  どれも金額つき。「気をつけましょう」は打ち手にならないので出さない */
export function adviceFor(L: Ledger, m: string): Advice[] {
  const a = monthTotals(L, m);
  const p = monthTotals(L, shiftMonth(m, -1));
  const out: Advice[] = [];
  if (a.days === 0) return out;

  const laborRate = pct(a.laborAll, a.sales);
  const prevRate = pct(p.laborAll, p.sales);

  // ① 経費で一番増えた項目を名指しする
  const exps = expenseDeltas(L, m).filter((x) => x.diff > 0);
  if (p.days > 0 && exps.length && exps[0].diff >= 3000) {
    const e = exps[0];
    out.push({
      id: "expUp",
      title: `${e.name} が先月より ${yen(e.diff)} 増えています`,
      body: `${yen(e.prev)} → ${yen(e.now)}。仕入れ先か量を見直せば、そのぶんがそのまま利益に戻ります。`,
      impact: e.diff, kind: "profit",
    });
  }

  // ② 人件費率が上がっている
  if (p.days > 0 && p.sales > 0 && a.sales > 0 && laborRate - prevRate >= 2) {
    const extra = Math.round(((laborRate - prevRate) / 100) * a.sales);
    out.push({
      id: "laborRate",
      title: `人件費率が ${prevRate.toFixed(1)}% → ${laborRate.toFixed(1)}% に上がっています`,
      body: `先月と同じ率なら ${yen(extra)} 少なく済んでいました。出勤の人数か時間を、売上の少ない日から削るのが効きます。`,
      impact: extra, kind: "profit",
    });
  }

  // ③ 人件費率の悪い曜日を名指しする（暇な日に人を置きすぎていないか）
  const wd = weekdayCost(L, m).filter((x) => x.sales > 0);
  if (wd.length >= 3) {
    const worst = [...wd].sort((x, y) => y.rate - x.rate)[0];
    const others = wd.filter((x) => x.dow !== worst.dow);
    const base = pct(others.reduce((s, x) => s + x.labor, 0), others.reduce((s, x) => s + x.sales, 0));
    if (worst.rate - base >= 10) {
      const extra = Math.round(((worst.rate - base) / 100) * worst.sales);
      out.push({
        id: "worstDow",
        title: `${WD[worst.dow]}曜の人件費率が ${worst.rate.toFixed(0)}%（ほかの曜日は ${base.toFixed(0)}%）`,
        body: `${WD[worst.dow]}曜は ${worst.days}日で売上 ${yen(worst.sales)}、人件費 ${yen(worst.labor)}。ほかの曜日と同じ率にできれば ${yen(extra)} 残ります。`,
        impact: extra, kind: "profit",
      });
    }
  }

  // ④ 客単価が落ちている（人数は同じなのに売上が減る）
  if (p.guests > 0 && a.guests > 0) {
    const av = a.sales / a.guests, pv = p.sales / p.guests;
    if (pv - av >= 200) {
      const lost = Math.round((pv - av) * a.guests);
      out.push({
        id: "spendDown",
        title: `客単価が ${yen(pv)} → ${yen(av)} に落ちています`,
        body: `今月の客数のままでも、先月の単価なら ${yen(lost)} 多く売れていました。ドリンクの声かけと延長の案内を見直してください。`,
        impact: lost, kind: "profit",
      });
    }
  }

  // ⑤ 客数が落ちている
  if (p.guests > 0 && a.guests > 0 && p.days > 0) {
    const perDayNow = a.guests / a.days, perDayPrev = p.guests / p.days;
    if (perDayPrev - perDayNow >= 1) {
      const av = a.guests > 0 ? a.sales / a.guests : 0;
      const lost = Math.round((perDayPrev - perDayNow) * a.days * av);
      out.push({
        id: "guestsDown",
        title: `1日あたりの客数が ${perDayPrev.toFixed(1)}名 → ${perDayNow.toFixed(1)}名 に減っています`,
        body: `先月と同じ入りなら ${yen(lost)} 多く売れていました。何時に入っているかを見て、暇な時間の集客を考えてください。`,
        impact: lost, kind: "profit",
      });
    }
  }

  // ⑥ カード手数料を店がかぶっている
  const rule = L.posRule;
  if (a.fee >= 3000 && !rule?.cardFeeOnGuest) {
    out.push({
      id: "cardFee",
      title: `カード手数料を ${yen(a.fee)} 店がかぶっています`,
      body: `設定の「この手数料をお客様に請求する」を入にすると、そのぶんが利益に戻ります。カード会計のときだけ請求に乗ります。`,
      impact: Math.round(a.fee), kind: "profit",
    });
  }

  // ⑦ 回収していないツケ
  const tabOut = a.tab - a.tabCollected;
  if (tabOut > 0) {
    out.push({
      id: "tabOut",
      title: `ツケが ${yen(tabOut)} 残っています`,
      body: `売上には立っていますが、まだ手元に入っていません。締めの「ツケ（未回収）」から相手を確かめてください。`,
      impact: Math.round(tabOut), kind: "cash",
    });
  }

  // ⑧ 未払いの給料が溜まっている（利益ではなく現金繰りの話だが、効き目は大きい）
  if (a.unpaid >= 100000) {
    out.push({
      id: "unpaid",
      title: `未払いの給料が ${yen(a.unpaid)} 溜まっています`,
      body: `利益は出ていても、渡す日に現金が足りないと止まります。給料日までに手元の現金がいくら要るか、今のうちに確かめてください。`,
      impact: Math.round(a.unpaid), kind: "cash",
    });
  }

  // 利益の打ち手を先に、現金の手当てをあとに。
  // それぞれの中では効き目の大きい順
  const rank = (x: Advice) => (x.kind === "profit" ? 0 : 1);
  return out.sort((x, y) => rank(x) - rank(y) || y.impact - x.impact);
}
