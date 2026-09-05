/** SVG グラフ（旧アーティファクトの描画を JSX に移植） */
import { useState, type PointerEvent } from "react";
import type { CastMonthRow, DayTotals, MonthTotals } from "../domain/types";
import { dayLabel, daysInMonth, jp, yen, yenShort } from "../domain/format";
import { pct } from "../domain/calc";

export const C = { cash: "var(--s-cash)", card: "var(--s-card)", labor: "var(--s-labor)", cost: "var(--s-cost)", rest: "var(--s-rest)", muted: "var(--s-muted)" };

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

/** 日別売上：現金とカードを1本の棒として描く。輪郭にだけ丸みを付け、
 *  境目には背景色の細い区切りを入れて、色の切り替わりを見やすくする。 */
export function DailyChart({ month, series }: { month: string; series: DayTotals[] }) {
  const [tip, setTip] = useState<{ t: DayTotals; x: number } | null>(null);
  if (!series.some((t) => t.sales > 0)) return <div className="empty">この月の売上はまだ入っていません</div>;
  const W = 326, H = 96, GAP = 1.8;
  const dim = daysInMonth(month);
  const byDay: Record<number, DayTotals> = {};
  series.forEach((t) => { byDay[Number(t.date.slice(8, 10))] = t; });
  const max = niceMax(Math.max(10000, ...series.map((t) => t.sales)));
  const step = W / dim, bw = Math.max(3, step - 6.5);
  const base = H - 12, top = 4, span = base - top;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = (e.target as Element).closest?.(".hit") as SVGRectElement | null;
    if (!el) { setTip(null); return; }
    const t = byDay[Number(el.dataset.d)];
    if (!t) { setTip(null); return; }
    const wrap = e.currentTarget.getBoundingClientRect(), b = el.getBoundingClientRect();
    setTip({ t, x: b.left - wrap.left + b.width / 2 });
  };
  const days = Array.from({ length: dim }, (_, i) => i + 1);
  return (
    <>
      <div className="chart" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="日別の売上。現金とカードの積み上げ">
          <defs>
            {days.map((d) => {
              const t = byDay[d];
              if (!t || t.sales <= 0) return null;
              const x = step * (d - 1) + (step - bw) / 2;
              const total = span * (t.sales / max);
              return <clipPath key={d} id={`bar-${month}-${d}`}><rect x={x} y={base - total} width={bw} height={total} rx={2.5} /></clipPath>;
            })}
          </defs>
          <line x1={0} y1={base} x2={W} y2={base} stroke="var(--line)" strokeWidth={1} />
          {days.map((d) => {
            const t = byDay[d];
            if (!t || t.sales <= 0) return null;
            const x = step * (d - 1) + (step - bw) / 2;
            const hCash = span * (t.cash / max), hCard = span * (t.card / max);
            const total = hCash + hCard;
            return (
              <g key={d} clipPath={`url(#bar-${month}-${d})`}>
                {hCard > 0 && <rect x={x} y={base - total} width={bw} height={hCard} fill={C.card} />}
                {hCash > 0 && <rect x={x} y={base - hCash} width={bw} height={hCash} fill={C.cash} />}
                {hCard > 0 && hCash > 0 && <rect x={x} y={base - hCash - GAP} width={bw} height={GAP} fill="var(--surface)" />}
              </g>
            );
          })}
          {days.map((d) => (
            <rect key={d} className="hit" x={step * (d - 1)} y={0} width={step} height={base} fill="transparent" data-d={d} />
          ))}
        </svg>
        <div className={`tip ${tip ? "on" : ""}`} style={{ left: tip ? `clamp(0px, calc(${tip.x}px - 62px), calc(100% - 128px))` : 0, top: 0 }}>
          {tip && (
            <>
              <div className="d">{dayLabel(tip.t.date)}</div>
              <div className="r"><span className="swatch" style={{ background: C.cash }} /><span>現金</span><span>{yen(tip.t.cash)}</span></div>
              <div className="r"><span className="swatch" style={{ background: C.card }} /><span>カード</span><span>{yen(tip.t.card)}</span></div>
              <div className="r" style={{ marginTop: 4, borderTop: "1px solid var(--line)", paddingTop: 4 }}><span>差引</span><span className={tip.t.profit < 0 ? "neg" : ""}>{yen(tip.t.profit)}</span></div>
            </>
          )}
        </div>
      </div>
      <div className="xaxis"><div>1</div><div>{Math.round(dim / 3)}</div><div>{Math.round((dim * 2) / 3)}</div><div>{dim}</div></div>
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
              <path d={rightRect(L, y + 3, Math.max(2, w), 14, 3)} fill={C.labor} />
              <text x={L + Math.max(2, w) + 7} y={y + 14} fontSize={10.5} fill="var(--ink-2)" fontFamily="Archivo,sans-serif">{jp(r.gross)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ============================================================
   円グラフ・年グラフ
   ============================================================ */

export interface PiePart { label: string; value: number; color: string;
  /** 切れ端の中に書く短い名前。省くと label の先頭3文字 */
  short?: string }
/** 割当用の色（順に使う） */
export const PALETTE = [C.cash, C.card, C.labor, C.cost, "#00A6B8", "#B87BD6", "#D68A4F", C.muted];

function arcPath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const p = (r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0} ${y0} A${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`;
}

/** ドーナツ型の円グラフ。大きい切れ端には名前と割合を直接書き込み、
 *  細い切れ端は下の凡例で補う。文字は白＋暗い縁取りで、どの色の上でも読めるようにする。 */
export function PieChart({ parts, center, empty = "データがありません" }: { parts: PiePart[]; center?: { label: string; value: string }; empty?: string }) {
  const list = parts.filter((p) => p.value > 0);
  const total = list.reduce((s, p) => s + p.value, 0);
  if (!total) return <div className="empty">{empty}</div>;
  let a = -Math.PI / 2;
  const cx = 100, cy = 100, r1 = 90, r0 = 56, rMid = (r0 + r1) / 2;
  const slices = list.map((p) => {
    const share = p.value / total;
    const a0 = a;
    const a1 = a + share * Math.PI * 2;
    a = a1;
    const mid = (a0 + a1) / 2;
    return { ...p, share, a0, a1, mid, x: cx + rMid * Math.cos(mid), y: cy + rMid * Math.sin(mid) };
  });
  return (
    <div className="pie">
      <svg viewBox="0 0 200 200" role="img" aria-label={list.map((p) => `${p.label} ${pct(p.value, total).toFixed(0)}%`).join("、")}>
        {slices.length === 1
          ? <circle cx={cx} cy={cy} r={rMid} fill="none" stroke={slices[0].color} strokeWidth={r1 - r0} />
          : slices.map((p) => (
            <path key={p.label} d={arcPath(cx, cy, r0, r1, p.a0, Math.max(p.a0 + 0.001, p.a1 - 0.02))} fill={p.color} />
          ))}
        {slices.filter((p) => p.share >= 0.085).map((p) => (
          <g key={"t" + p.label} className="pielabel">
            <text x={p.x} y={p.y - 3} textAnchor="middle" fontSize={10.5} fontWeight={500}>{p.short ?? p.label.slice(0, 3)}</text>
            <text x={p.x} y={p.y + 10} textAnchor="middle" fontSize={11.5} fontWeight={700} className="num">{(p.share * 100).toFixed(0)}%</text>
          </g>
        ))}
        {center && (
          <g>
            <rect x={cx - 46} y={cy - 26} width={92} height={52} rx={12} fill="var(--surface-2)" />
            <text x={cx} y={cy - 6} textAnchor="middle" fontSize={11.5} fill="var(--ink-2)" fontWeight={500}>{center.label}</text>
            <text x={cx} y={cy + 16} textAnchor="middle" fontSize={20} className="ctr" fill="var(--ink)">{center.value}</text>
          </g>
        )}
      </svg>
      <div className="legend">
        {list.map((p) => (
          <span key={p.label}><i style={{ background: p.color }} /><span className="nm">{p.label}</span><em>{pct(p.value, total).toFixed(0)}%</em><b>{yenShort(p.value)}</b></span>
        ))}
      </div>
    </div>
  );
}

/** 年の月別売上：現金／カードの積み上げ棒 ＋ 利益の折れ線 */
export function YearChart({ months, onPick }: { months: { m: string; cash: number; card: number; sales: number; profit: number; days: number }[]; onPick?: (m: string) => void }) {
  const [tip, setTip] = useState<{ i: number; x: number } | null>(null);
  if (!months.some((x) => x.sales > 0)) return <div className="empty">この年の売上はまだ入っていません</div>;
  const W = 340, H = 180, L = 40, R = 8, T = 14, B = 22;
  const pw = W - L - R, ph = H - T - B;
  const max = niceMax(Math.max(10000, ...months.map((x) => Math.max(x.sales, x.profit))));
  const min = Math.min(0, ...months.map((x) => x.profit));
  const minN = min < 0 ? -niceMax(-min) : 0;
  const yOf = (v: number) => T + ph - (ph * (v - minN)) / (max - minN);
  const step = pw / 12, bw = step * 0.62;
  const zero = yOf(0);
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = (e.target as Element).closest?.(".hit") as SVGRectElement | null;
    if (!el) { setTip(null); return; }
    const i = Number(el.dataset.i);
    const wrap = e.currentTarget.getBoundingClientRect(), b = el.getBoundingClientRect();
    setTip({ i, x: b.left - wrap.left + b.width / 2 });
  };
  const line = months.map((x, i) => `${(L + step * i + step / 2).toFixed(1)},${yOf(x.profit).toFixed(1)}`).join(" ");
  const tm = tip ? months[tip.i] : null;
  return (
    <>
      <div className="chart" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="月別の売上と利益">
          {[minN, 0, max / 2, max].filter((v, i, arr) => arr.indexOf(v) === i).map((v) => (
            <g key={v}>
              <line x1={L} y1={yOf(v)} x2={W - R} y2={yOf(v)} stroke={v === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth={1} />
              <text x={L - 6} y={yOf(v) + 3.5} textAnchor="end" fontSize={9} fill="var(--ink-3)" fontFamily="Archivo,sans-serif">{v === 0 ? "0" : yenShort(v)}</text>
            </g>
          ))}
          {months.map((x, i) => {
            const bx = L + step * i + (step - bw) / 2;
            const hCash = (ph * x.cash) / (max - minN), hCard = (ph * x.card) / (max - minN);
            const yCash = zero - hCash, yCard = yCash - hCard;
            return (
              <g key={x.m}>
                {hCard > 0.5 && <path d={topRect(bx, yCard, bw, hCard, 2.5)} fill={C.card} />}
                {hCash > 0.5 && (hCard > 0.5 ? <rect x={bx} y={yCash} width={bw} height={hCash} fill={C.cash} /> : <path d={topRect(bx, yCash, bw, hCash, 2.5)} fill={C.cash} />)}
                <text x={bx + bw / 2} y={H - 7} textAnchor="middle" fontSize={9} fill="var(--ink-3)" fontFamily="Archivo,sans-serif">{i + 1}</text>
              </g>
            );
          })}
          <polyline points={line} fill="none" stroke="var(--ink)" strokeWidth={1.6} strokeLinejoin="round" />
          {months.map((x, i) => x.days > 0 && <circle key={x.m} cx={L + step * i + step / 2} cy={yOf(x.profit)} r={2.6} fill={x.profit < 0 ? "var(--crit)" : "var(--ink)"} stroke="var(--surface)" strokeWidth={1} />)}
          {months.map((x, i) => <rect key={x.m} className="hit" x={L + step * i} y={T} width={step} height={ph} fill="transparent" data-i={i} style={{ cursor: onPick ? "pointer" : undefined }} onClick={() => onPick?.(x.m)} />)}
        </svg>
        <div className={`tip ${tip ? "on" : ""}`} style={{ left: tip ? `clamp(0px, calc(${tip.x}px - 60px), calc(100% - 124px))` : 0, top: 2 }}>
          {tm && (
            <>
              <div className="d">{Number(tm.m.slice(5, 7))}月{tm.days ? ` ・ ${tm.days}日` : ""}</div>
              <div className="r"><span className="swatch" style={{ background: C.cash }} /><span>現金</span><span>{yen(tm.cash)}</span></div>
              <div className="r"><span className="swatch" style={{ background: C.card }} /><span>カード</span><span>{yen(tm.card)}</span></div>
              <div className="r" style={{ marginTop: 3, borderTop: "1px solid var(--line)", paddingTop: 3 }}><span>利益</span><span>{yen(tm.profit)}</span></div>
            </>
          )}
        </div>
      </div>
      <div className="legend"><span><i style={{ background: C.cash }} />現金</span><span><i style={{ background: C.card }} />カード</span><span><i style={{ background: "var(--ink)", borderRadius: "50%" }} />営業利益</span></div>
    </>
  );
}
