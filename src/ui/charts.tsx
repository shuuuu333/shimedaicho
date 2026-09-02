/** SVG グラフ（旧アーティファクトの描画を JSX に移植） */
import { useState, type PointerEvent } from "react";
import type { CastMonthRow, DayTotals, MonthTotals } from "../domain/types";
import { dayLabel, daysInMonth, jp, yen, yenShort } from "../domain/format";
import { pct } from "../domain/calc";

export const C = { cash: "var(--s-cash)", card: "var(--s-card)", labor: "var(--s-labor)", cost: "var(--s-cost)", rest: "var(--s-rest)" };

function niceMax(v: number): number {
  if (v <= 0) return 1000;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const s = v / p;
  const m = s <= 1 ? 1 : s <= 1.5 ? 1.5 : s <= 2 ? 2 : s <= 3 ? 3 : s <= 5 ? 5 : s <= 7.5 ? 7.5 : 10;
  return m * p;
}
export function topRect(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  return `M${x} ${y + h} L${x} ${y + rr} Q${x} ${y} ${x + rr} ${y} L${x + w - rr} ${y} Q${x + w} ${y} ${x + w} ${y + rr} L${x + w} ${y + h} Z`;
}
export function rightRect(x: number, y: number, w: number, h: number, r: number): string {
  if (w <= 0) return "";
  const rr = Math.min(r, h / 2, w);
  return `M${x} ${y} L${x + w - rr} ${y} Q${x + w} ${y} ${x + w} ${y + rr} L${x + w} ${y + h - rr} Q${x + w} ${y + h} ${x + w - rr} ${y + h} L${x} ${y + h} Z`;
}

/** 日別売上：積み上げ棒 */
export function DailyChart({ month, series }: { month: string; series: DayTotals[] }) {
  const [tip, setTip] = useState<{ t: DayTotals; x: number } | null>(null);
  if (!series.some((t) => t.sales > 0)) return <div className="empty">この月の売上はまだ入っていません</div>;
  const W = 340, H = 170, L = 36, R = 6, T = 12, B = 22;
  const pw = W - L - R, ph = H - T - B;
  const dim = daysInMonth(month);
  const byDay: Record<number, DayTotals> = {};
  series.forEach((t) => { byDay[Number(t.date.slice(8, 10))] = t; });
  const max = niceMax(Math.max(10000, ...series.map((t) => t.sales)));
  const bw = Math.max(3, pw / dim - 2.2), step = pw / dim;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = (e.target as Element).closest?.(".hit") as SVGRectElement | null;
    if (!el) { setTip(null); return; }
    const t = byDay[Number(el.dataset.d)];
    if (!t) { setTip(null); return; }
    const wrap = e.currentTarget.getBoundingClientRect(), b = el.getBoundingClientRect();
    setTip({ t, x: b.left - wrap.left + b.width / 2 });
  };
  return (
    <>
      <div className="chart" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="日別の売上（現金とカードの積み上げ）">
          {[0, 0.5, 1].map((f) => {
            const y = T + ph - ph * f;
            return (
              <g key={f}>
                <line x1={L} y1={y} x2={W - R} y2={y} stroke="var(--grid)" strokeWidth={1} />
                <text x={L - 6} y={y + 3.5} textAnchor="end" fontSize={9} fill="var(--ink-3)" fontFamily="Archivo,sans-serif">{f === 0 ? "0" : yenShort(max * f)}</text>
              </g>
            );
          })}
          {Array.from({ length: dim }, (_, i) => i + 1).map((d) => {
            const x = L + step * (d - 1) + (step - bw) / 2;
            const t = byDay[d];
            if (!t || t.sales <= 0) return null;
            const hCash = ph * (t.cash / max), hCard = ph * (t.card / max);
            const yCard = T + ph - hCash - hCard, yCash = T + ph - hCash;
            return hCard > 0.5 ? (
              <g key={d}>
                <path d={topRect(x, yCard, bw, hCard, 2.5)} fill={C.card} />
                <rect x={x} y={yCash - 2} width={bw} height={Math.min(2, hCash)} fill="var(--surface)" />
                <rect x={x} y={yCash} width={bw} height={Math.max(0, hCash)} fill={C.cash} />
              </g>
            ) : (
              <path key={d} d={topRect(x, yCash, bw, hCash, 2.5)} fill={C.cash} />
            );
          })}
          <line x1={L} y1={T + ph} x2={W - R} y2={T + ph} stroke="var(--axis)" strokeWidth={1} />
          {Array.from({ length: dim }, (_, i) => i + 1).map((d) => (
            <g key={d}>
              {(d === 1 || d % 5 === 0) && <text x={L + step * (d - 1) + step / 2} y={H - 7} textAnchor="middle" fontSize={9} fill="var(--ink-3)" fontFamily="Archivo,sans-serif">{d}</text>}
              <rect className="hit" x={L + step * (d - 1)} y={T} width={step} height={ph} fill="transparent" data-d={d} />
            </g>
          ))}
        </svg>
        <div className={`tip ${tip ? "on" : ""}`} style={{ left: tip ? `clamp(0px, calc(${tip.x}px - 60px), calc(100% - 124px))` : 0, top: 2 }}>
          {tip && (
            <>
              <div className="d">{dayLabel(tip.t.date)}</div>
              <div className="r"><span className="swatch" style={{ background: C.cash }} /><span>現金</span><span>{yen(tip.t.cash)}</span></div>
              <div className="r"><span className="swatch" style={{ background: C.card }} /><span>カード</span><span>{yen(tip.t.card)}</span></div>
              <div className="r" style={{ marginTop: 3, borderTop: "1px solid var(--line)", paddingTop: 3 }}><span>差引</span><span>{yen(tip.t.profit)}</span></div>
            </>
          )}
        </div>
      </div>
      <div className="legend"><span><i style={{ background: C.cash }} />現金</span><span><i style={{ background: C.card }} />カード</span></div>
    </>
  );
}

/** 月カレンダー */
export function Calendar({ month, series, selected, onPick }: { month: string; series: DayTotals[]; selected: string | null; onPick: (k: string) => void }) {
  const y = Number(month.slice(0, 4)), mo = Number(month.slice(5, 7));
  const dim = daysInMonth(month);
  const lead = new Date(y, mo - 1, 1).getDay();
  const byDay: Record<number, DayTotals> = {};
  series.forEach((t) => { byDay[Number(t.date.slice(8, 10))] = t; });
  const max = Math.max(1, ...series.map((t) => t.sales));
  return (
    <>
      <div className="cal">
        <div className="cal-head">{["日", "月", "火", "水", "木", "金", "土"].map((w) => <span key={w}>{w}</span>)}</div>
        <div className="cal-grid">
          {Array.from({ length: lead }, (_, i) => <div key={"b" + i} className="cal-cell blank" aria-hidden="true" />)}
          {Array.from({ length: dim }, (_, i) => i + 1).map((d) => {
            const key = `${month}-${String(d).padStart(2, "0")}`;
            const t = byDay[d];
            const dow = (lead + d - 1) % 7;
            const has = !!(t && t.sales > 0);
            const cw = has ? (t.cash / max) * 100 : 0, dw = has ? (t.card / max) * 100 : 0;
            return (
              <button key={key} type="button" onClick={() => onPick(key)}
                className={`cal-cell${dow === 0 || dow === 6 ? " wk" : ""}${has ? " has" : ""}${selected === key ? " sel" : ""}`}
                aria-pressed={selected === key}
                aria-label={`${mo}月${d}日${has ? ` 売上 ${jp(t.sales)}円${t.profit < 0 ? " 赤字" : ""}` : " 記録なし"}`}>
                <span className="cd">{d}</span>
                <span className={`cv${has && t.profit < 0 ? " neg" : ""}`}>{has ? (t.profit < 0 ? "▲" : "") + yenShort(t.sales) : ""}</span>
                <span className="cb">{has && <><i style={{ width: `${cw.toFixed(1)}%`, background: C.cash }} /><i style={{ width: `${dw.toFixed(1)}%`, background: C.card }} /></>}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="legend"><span><i style={{ background: C.cash }} />現金</span><span><i style={{ background: C.card }} />カード</span><span><b style={{ color: "var(--crit)" }}>▲</b> 差引が赤字の日</span></div>
    </>
  );
}

/** 売上の使われ方：横 100% 積み上げ */
export function CompositionChart({ a }: { a: MonthTotals }) {
  if (a.sales <= 0) return <div className="empty">売上が入ると内訳が出ます</div>;
  const W = 340, H = 54;
  const parts = [
    { k: "人件費", v: a.laborAll, c: C.labor },
    { k: "経費", v: a.costAll, c: C.cost },
    { k: "利益", v: Math.max(0, a.profit), c: C.rest },
  ];
  const sum = parts.reduce((s, p) => s + p.v, 0) || 1;
  let x = 0;
  const nodes = parts.map((p, i) => {
    const w = (p.v / sum) * W;
    const isLast = i === parts.length - 1;
    const gw = Math.max(0, w - (isLast ? 0 : 2));
    const x0 = x;
    x += w;
    return (
      <g key={p.k}>
        {gw > 0.5 && (i === 0
          ? <path d={`M${x0 + 4} 10 L${x0 + gw} 10 L${x0 + gw} 32 L${x0 + 4} 32 Q${x0} 32 ${x0} 28 L${x0} 14 Q${x0} 10 ${x0 + 4} 10 Z`} fill={p.c} />
          : <path d={rightRect(x0, 10, gw, 22, isLast ? 4 : 0)} fill={p.c} />)}
        {w > 52 && <text x={x0 + w / 2} y={47} textAnchor="middle" fontSize={9.5} fill="var(--ink-2)" fontFamily="Archivo,sans-serif">{p.k} {pct(p.v, sum).toFixed(0)}%</text>}
      </g>
    );
  });
  return <div className="chart"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="売上の使われ方">{nodes}</svg></div>;
}

/** キャスト別給料：横棒 */
export function CastChart({ rows }: { rows: CastMonthRow[] }) {
  if (!rows.length) return <div className="empty">この月の出勤記録がまだありません</div>;
  const list = rows.slice(0, 8);
  const W = 340, rowH = 27, H = list.length * rowH + 6, L = 62, R = 52;
  const max = Math.max(1, ...list.map((r) => r.gross));
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="キャスト別の給料">
        {list.map((r, i) => {
          const y = i * rowH + 4, w = (W - L - R) * (r.gross / max);
          return (
            <g key={r.cast.id}>
              <text x={L - 8} y={y + 14} textAnchor="end" fontSize={11} fill="var(--ink-2)">{r.cast.name.slice(0, 5)}</text>
              <path d={rightRect(L, y + 3, Math.max(2, w), 14, 4)} fill={C.labor} />
              <text x={L + Math.max(2, w) + 7} y={y + 14} fontSize={10.5} fill="var(--ink-2)" fontFamily="Archivo,sans-serif">{jp(r.gross)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
