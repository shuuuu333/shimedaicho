import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useApp } from "../../state/store";
import { useCloud } from "../../state/cloud";
import type { Check, RankMetric } from "../../domain/types";
import { balances, cashFlow, castContribution, castRanking, dayTotals, missingDays, monthCashFlow, monthTotals, num, owedList, pct, weekdaySales, yearTotals } from "../../domain/calc";
import { WD, dayLabel, jp, shiftDay, shiftMonth, todayISO, yen, yenShort } from "../../domain/format";
import { ArrivalChart, C, Calendar, CompositionChart, DailyChart, PALETTE, PieChart, YearChart, type PiePart } from "../charts";
import { MonthBar } from "../components/MonthBar";
import { Notice } from "../components/Notice";
import { ChevLeft, ChevRight, Plus } from "../icons";
import { csvFilename, monthCSV, offerFile } from "../../data/backup";
import { forecastMonth, type Forecast } from "../../domain/forecast";
import { arrivalsByHour, avgPerGroup, busiestHour } from "../../domain/arrivals";
import { adviceFor, expenseDeltas, profitBridge, weekdayCost, type Advice, type ProfitBridge } from "../../domain/advice";
import { BottomSheet } from "../components/BottomSheet";
import { defaultPosRule } from "../../domain/migrate";
import { usePos } from "../../state/pos";

type PieKind = "bar" | "use" | "cast" | "dow";

const METRICS: { id: RankMetric; label: string; unit: string; sub: string }[] = [
  { id: "target", label: "売上", unit: "円", sub: "ボトルなど「売上%」型バックの対象売上" },
  { id: "back", label: "バック", unit: "円", sub: "ドリンク・指名・同伴・ボトルの合計" },
  { id: "count", label: "本数", unit: "本", sub: "件数で付けるバックの本数の合計" },
];

/** 現金の動き。月ぶんと、起点からの累計を切り替えて見る */
function CashCard({ L, m }: { L: ReturnType<typeof useApp.getState>["ledger"]; m: string }) {
  const [scope, setScope] = useState<"month" | "all">("month");
  const f = useMemo(() => (scope === "month" ? monthCashFlow(L, m) : cashFlow(L, Object.keys(L.days).filter((k) => k >= (L.shop.openingDate || "")))), [L, m, scope]);
  const opening = num(L.shop.openingCash);
  const total = scope === "month" ? f.net : opening + f.net;
  const goSet = useApp((s) => s.goSettings);
  return (
    <div className="card">
      <div className="cardhead">
        <h2>現金の動き</h2>
        <div className="seg" role="group" aria-label="期間">
          <button type="button" aria-pressed={scope === "month"} onClick={() => setScope("month")}>今月</button>
          <button type="button" aria-pressed={scope === "all"} onClick={() => setScope("all")}>累計</button>
        </div>
      </div>
      <p className="sub">{scope === "month" ? `${Number(m.slice(5, 7))}月に入ってきた現金と、出ていった現金` : "起点の日からの積み上げ"}</p>
      {scope === "all" && <div className="lrow"><div className="g"><div className="t">起点の現金</div><div className="s">{L.shop.openingDate}</div></div><div className="a num">{jp(opening)}</div></div>}
      <div className="lrow"><div className="g"><div className="t">現金売上</div></div><div className="a num" style={{ color: "var(--good)" }}>＋{jp(f.cash)}</div></div>
      {f.tabCollected > 0 && (
        <div className="lrow"><div className="g"><div className="t">受け取ったツケ</div><div className="s">売上には入れません（立てた日に入っています）</div></div>
          <div className="a num" style={{ color: "var(--good)" }}>＋{jp(f.tabCollected)}</div></div>
      )}
      <div className="lrow"><div className="g"><div className="t">現金で払った経費</div></div><div className="a num">−{jp(f.expCash)}</div></div>
      <div className="lrow"><div className="g"><div className="t">給料で払った額</div></div><div className="a num">−{jp(f.paidCash)}</div></div>
      <div className="lrow"><div className="g"><div className="t">銀行へ入金</div></div><div className="a num">−{jp(f.bankDeposit)}</div></div>
      <div className="lrow total"><div className="g"><div className="t">{scope === "month" ? "今月ぶんの残り" : "手元の現金"}</div></div><div className={`a num ${total < 0 ? "neg" : ""}`}>{yen(total)}</div></div>
      {scope === "all" && <div className="btnrow" style={{ marginTop: 12 }}><button type="button" className="btn sm" onClick={() => goSet("cash")}>起点を直す</button></div>}
    </div>
  );
}

/** キャスト別のランキング。キャストから見るときは金額を伏せる */
function RankingCard({ L, m }: { L: ReturnType<typeof useApp.getState>["ledger"]; m: string }) {
  const [metric, setMetric] = useState<RankMetric>("target");
  const role = useCloud((s) => s.role());
  const myEmail = useCloud((s) => s.email);
  const rows = useMemo(() => castRanking(L, m, metric), [L, m, metric]);
  const info = METRICS.find((x) => x.id === metric)!;
  const hide = role === "cast";
  const myId = useMemo(() => {
    if (!hide || !myEmail) return null;
    const e = myEmail.toLowerCase();
    const c = L.casts.find((x) => (x.email ?? "").toLowerCase() === e);
    return c ? "c:" + c.id : null;
  }, [L.casts, myEmail, hide]);
  const top = rows[0]?.value ?? 1;
  const medal = ["#E8B44F", "#B8BEC9", "#C98A5A"];

  return (
    <div className="card">
      <div className="cardhead">
        <h2>ランキング</h2>
        <div className="seg" role="group" aria-label="ランキングの基準">
          {METRICS.map((x) => (
            <button key={x.id} type="button" aria-pressed={metric === x.id} onClick={() => setMetric(x.id)}>{x.label}</button>
          ))}
        </div>
      </div>
      <p className="sub">キャスト別。{info.sub}{hide ? "。金額はオーナーだけが見られます。" : ""}</p>
      {rows.length ? rows.slice(0, 10).map((r, i) => {
        const mine = myId === r.id;
        return (
          <div key={r.id} className="rankrow">
            <span className="rk" style={i < 3 ? { background: medal[i], color: "#14171E" } : undefined}>{i + 1}</span>
            <span className="g">
              <span className="t">{r.name}{r.isDispatch && <span className="tag">派遣</span>}{mine && <span className="tag me">あなた</span>}</span>
              <span className="bar"><i style={{ width: `${Math.max(3, (r.value / top) * 100).toFixed(1)}%` }} /></span>
            </span>
            <span className="a num">{hide && !mine ? "—" : metric === "count" ? `${jp(r.value)}${info.unit}` : jp(r.value)}</span>
          </div>
        );
      }) : <div className="empty">この月はまだ記録がありません</div>}
    </div>
  );
}

/** 売上の使われ方カードの中身（横棒／円 3 種） */
function BreakdownCard({ a, L, m }: { a: ReturnType<typeof monthTotals>; L: ReturnType<typeof useApp.getState>["ledger"]; m: string }) {
  const [kind, setKind] = useState<PieKind>("bar");
  const contrib = useMemo(() => castContribution(L, m), [L, m]);
  const dow = useMemo(() => weekdaySales(a.series), [a]);
  const useParts: PiePart[] = [
    { label: "人件費", value: a.laborAll, color: C.labor, short: "人件費" },
    { label: "経費・手数料", value: a.costAll, color: C.cost, short: "経費" },
    { label: "営業利益", value: Math.max(0, a.profit), color: C.rest, short: "利益" },
  ];
  const top = contrib.rows.slice(0, 7);
  const rest = contrib.rows.slice(7).reduce((s, r) => s + r.value, 0);
  const castParts: PiePart[] = [...top.map((r, i) => ({ label: r.name, value: r.value, color: PALETTE[i % PALETTE.length], short: r.name.slice(0, 3) })), ...(rest > 0 ? [{ label: "その他", value: rest, color: C.rest, short: "他" }] : [])];
  // 曜日はそれぞれ違う色にする。赤は「赤字」用に空けておく
  const dowColors = ["#9B8AFA", "#4C9AFF", "#22B8CF", "#2FBF9B", "#7FC24A", "#E0B13C", "#E8843D"];
  const dowParts: PiePart[] = dow.map((v, i) => ({ label: WD[i] + "曜", value: v, color: dowColors[i], short: WD[i] }));
  const sub = kind === "bar" ? `今月の売上 ${yen(a.sales)} の内訳`
    : kind === "use" ? `売上 ${yen(a.sales)} が何に使われたか`
    : kind === "cast" ? (contrib.basis === "target" ? "売上%型バック（ボトルなど）の対象売上で見た貢献" : "バック額で見た貢献（売上%型の項目が無いため）")
    : "曜日ごとの売上合計。どの曜日が強いか";
  return (
    <div className="card">
      <div className="cardhead">
        <h2>売上の使われ方</h2>
        <div className="seg" role="group" aria-label="内訳の種類">
          <button type="button" aria-pressed={kind === "bar"} onClick={() => setKind("bar")}>棒</button>
          <button type="button" aria-pressed={kind === "use"} onClick={() => setKind("use")}>円</button>
          <button type="button" aria-pressed={kind === "cast"} onClick={() => setKind("cast")}>キャスト</button>
          <button type="button" aria-pressed={kind === "dow"} onClick={() => setKind("dow")}>曜日</button>
        </div>
      </div>
      <p className="sub">{sub}</p>
      {kind === "bar" && <CompositionChart a={a} />}
      {kind === "use" && <PieChart parts={a.sales > 0 ? useParts : []} center={a.sales > 0 ? { label: "営業利益", value: `${pct(a.profit, a.sales).toFixed(0)}%` } : undefined} empty="売上が入ると内訳が出ます" />}
      {kind === "cast" && <PieChart parts={castParts} empty="出勤とバックが入ると貢献が出ます" />}
      {kind === "dow" && <PieChart parts={dowParts} empty="売上が入ると曜日別が出ます" />}
      {kind === "bar" && (
        <div className="tw"><table><tbody>
          <tr><td><span className="swatch" style={{ background: C.labor }} /> 人件費</td><td className="n">{yen(a.laborAll)}</td><td className="n">{pct(a.laborAll, a.sales).toFixed(1)}%</td></tr>
          <tr className="muted"><td style={{ paddingLeft: 20 }}>在籍</td><td className="n">{yen(a.laborR)}</td><td className="n">{pct(a.laborR, a.sales).toFixed(1)}%</td></tr>
          <tr className="muted"><td style={{ paddingLeft: 20 }}>派遣</td><td className="n">{yen(a.laborD)}</td><td className="n">{pct(a.laborD, a.sales).toFixed(1)}%</td></tr>
          {a.paidLump > 0 && <tr className="muted"><td style={{ paddingLeft: 20 }}>まとめ日払い</td><td className="n">{yen(a.paidLump)}</td><td className="n">{pct(a.paidLump, a.sales).toFixed(1)}%</td></tr>}
          <tr className="tr-link muted" tabIndex={0} onClick={() => useApp.getState().goSettings("fixed")}><td style={{ paddingLeft: 20 }}>固定人件費 ›</td><td className="n">{yen(a.fixedLabor)}</td><td className="n">{pct(a.fixedLabor, a.sales).toFixed(1)}%</td></tr>
          <tr><td><span className="swatch" style={{ background: C.cost }} /> 経費・手数料</td><td className="n">{yen(a.costAll)}</td><td className="n">{pct(a.costAll, a.sales).toFixed(1)}%</td></tr>
          <tr><td><span className="swatch" style={{ background: C.rest }} /> 営業利益</td><td className="n">{yen(a.profit)}</td><td className="n">{pct(a.profit, a.sales).toFixed(1)}%</td></tr>
        </tbody></table></div>
      )}
    </div>
  );
}

/** 年表示 */
function YearView() {
  const L = useApp((s) => s.ledger);
  const ui = useApp((s) => s.ui);
  const setUI = useApp((s) => s.setUI);
  const year = ui.month.slice(0, 4);
  const y = useMemo(() => yearTotals(L, year), [L, year]);
  const laborRate = pct(y.laborAll, y.sales);
  const useParts: PiePart[] = [
    { label: "人件費", value: y.laborAll, color: C.labor, short: "人件費" },
    { label: "経費・手数料", value: y.costAll, color: C.cost, short: "経費" },
    { label: "営業利益", value: Math.max(0, y.profit), color: C.rest, short: "利益" },
  ];
  const pickMonth = (m: string) => { setUI({ month: m, monthView: "month", calDay: null, castDetail: null }); window.scrollTo(0, 0); };
  return (
    <>
      <div className="hero">
        <div className="label"><span className="eyebrow">{year}年の営業利益</span></div>
        <div className={`big num ${y.profit < 0 ? "neg" : ""}`}>{yen(y.profit)}</div>
        <div className="meta">売上 {yen(y.sales)} − 人件費 {yen(y.laborAll)} − 経費 {yen(y.costAll)}</div>
        <div className="heroSplit cols3">
          <div><div className="k">人件費率</div><div className="v">{laborRate.toFixed(1)}<span style={{ fontSize: 13 }}>%</span></div></div>
          <div><div className="k">客単価</div><div className="v">{y.guests > 0 ? yen(y.avgSpend) : "—"}</div></div>
          <div><div className="k">営業日</div><div className="v">{y.days}<span style={{ fontSize: 13 }}>日</span></div></div>
        </div>
      </div>

      <div className="card">
        <h2>月別の売上と利益</h2><p className="sub">棒が売上（下が現金、上がカード）、線が営業利益。棒に触れると内訳が出ます。</p>
        <YearChart months={y.months} />
      </div>

      <div className="card">
        <h2>月別の明細</h2><p className="sub">行をタップするとその月の画面が開きます。固定費は日報のある月だけ引いています。</p>
        <div className="tw"><table>
          <thead><tr><th>月</th><th>日数</th><th>売上</th><th>人件費</th><th>経費</th><th>利益</th></tr></thead>
          <tbody>{y.months.map((x) => (
            <tr key={x.m} className={`tr-link ${x.days ? "" : "muted"}`} tabIndex={0} onClick={() => pickMonth(x.m)} onKeyDown={(e) => { if (e.key === "Enter") pickMonth(x.m); }}>
              <td>{Number(x.m.slice(5, 7))}月</td>
              <td className="n">{x.days || "—"}</td>
              <td className="n">{x.sales ? jp(x.sales) : "—"}</td>
              <td className="n">{x.laborAll ? jp(x.laborAll) : "—"}</td>
              <td className="n">{x.costAll ? jp(x.costAll) : "—"}</td>
              <td className={`n ${x.profit < 0 ? "neg" : ""}`}>{x.days ? jp(x.profit) : "—"}</td>
            </tr>
          ))}</tbody>
          <tfoot><tr><td>合計</td><td className="n">{y.days}</td><td className="n">{jp(y.sales)}</td><td className="n">{jp(y.laborAll)}</td><td className="n">{jp(y.costAll)}</td><td className={`n ${y.profit < 0 ? "neg" : ""}`}>{jp(y.profit)}</td></tr></tfoot>
        </table></div>
      </div>

      <div className="card">
        <h2>年の売上の使われ方</h2><p className="sub">売上 {yen(y.sales)} が何に使われたか</p>
        <PieChart parts={y.sales > 0 ? useParts : []} center={y.sales > 0 ? { label: "営業利益", value: `${pct(y.profit, y.sales).toFixed(0)}%` } : undefined} empty="売上が入ると内訳が出ます" />
      </div>
    </>
  );
}

export function Month() {
  const ui = useApp((s) => s.ui);
  const setUI = useApp((s) => s.setUI);
  const L = useApp((s) => s.ledger);
  const defaultCalDay = (mm: string) => { const k = Object.keys(L.days).sort().filter((d) => d.startsWith(mm) && dayTotals(L, d).sales > 0); return k.length ? k[k.length - 1] : null; };
  const seg = (
    <span className="seg" role="group" aria-label="月と年の切替">
      <button type="button" aria-pressed={ui.monthView !== "year"} onClick={() => setUI({ monthView: "month" })}>月</button>
      <button type="button" aria-pressed={ui.monthView === "year"} onClick={() => setUI({ monthView: "year" })}>年</button>
    </span>
  );
  if (ui.monthView === "year") {
    return (
      <>
        <MonthBar month={ui.month} yearMode onChange={(mm) => setUI({ month: mm, calDay: null, castDetail: null })} right={seg} />
        <YearView />
      </>
    );
  }
  return <MonthView seg={seg} defaultCalDay={defaultCalDay} />;
}

function MonthView({ seg, defaultCalDay }: { seg: ReactNode; defaultCalDay: (m: string) => string | null }) {
  const L = useApp((s) => s.ledger);
  const ui = useApp((s) => s.ui);
  const setUI = useApp((s) => s.setUI);
  const openDay = useApp((s) => s.openDay);
  const goSet = useApp((s) => s.goSettings);
  const showToast = useApp((s) => s.showToast);
  const m = ui.month;

  const a = useMemo(() => monthTotals(L, m), [L, m]);
  const prev = useMemo(() => monthTotals(L, shiftMonth(m, -1)), [L, m]);
  const b = useMemo(() => balances(L), [L]);
  const mCash = useMemo(() => monthCashFlow(L, m), [L, m]);

  const today = todayISO(), isCur = m === today.slice(0, 7);
  const dProfit = a.profit - prev.profit;
  // 「このままいくと今月はいくらで終わるのか」。曜日別に伸ばす（金土が効くため）
  const fc = useMemo(() => forecastMonth(L, m, today), [L, m, today]);
  const missing = isCur ? missingDays(L, today, shiftDay) : [];
  const owedCount = useMemo(() => owedList(L, m).length, [L, m]);
  const todayDone = !!L.days[today];

  const setMonth = (mm: string) => setUI({ month: mm, calDay: defaultCalDay(mm), castDetail: null });
  const setMode = (mode: "chart" | "cal") => {
    try { localStorage.setItem("shimedaicho.mode", mode); } catch { /* ignore */ }
    setUI({ monthMode: mode, calDay: mode === "cal" && (!ui.calDay || !ui.calDay.startsWith(m)) ? defaultCalDay(m) : ui.calDay });
  };
  const exportCsv = async () => {
    try { await offerFile(csvFilename(m), monthCSV(L, m), "text/csv"); showToast("書き出しました"); }
    catch (e) { if ((e as Error).name !== "AbortError") showToast("書き出せませんでした"); }
  };

  const calT = ui.calDay && L.days[ui.calDay] ? dayTotals(L, ui.calDay) : null;

  return (
    <>
      <div className="titlebar">
        <div>
          <div className="y">{m.slice(0, 4)}</div>
          <div className="m">{Number(m.slice(5, 7))}月</div>
        </div>
        <div className="mstep" style={{ marginLeft: 8, marginBottom: 3 }}>
          <button type="button" aria-label="前の月" onClick={() => setMonth(shiftMonth(m, -1))}><ChevLeft size={18} /></button>
          <button type="button" aria-label="次の月" onClick={() => setMonth(shiftMonth(m, 1))}><ChevRight size={18} /></button>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ marginBottom: 4 }}>{seg}</div>
      </div>

      {!L.casts.length && !a.days && (
        <Notice title="はじめに 3 つだけ">
          <b>設定</b>でバック単価と時給を決めて、<b>キャスト</b>に在籍者を登録してください。
          あとは<b>日報</b>を毎日つけるだけで、ここが埋まります。
        </Notice>
      )}

      {isCur && (!todayDone || missing.length > 0) && (
        <div className="todo">
          {!todayDone && (
            <button type="button" className="btn primary wide" style={{ minHeight: 52, fontSize: 15.5 }} onClick={() => openDay(today, 0)}>
              <Plus size={18} />今日の日報をつける
            </button>
          )}
          {missing.length > 0 && (
            <div className="chips"><span className="chiplbl">未入力の日</span>
              {missing.map((k) => <button key={k} type="button" className="chip num" onClick={() => openDay(k, 0)}>{dayLabel(k)}</button>)}
            </div>
          )}
        </div>
      )}

      <div className="hero">
        <div className="label">
          <span>{isCur ? "今月" : Number(m.slice(5, 7)) + "月"}の営業利益</span>
          {prev.days > 0 && (
            <span className={`pill ${dProfit >= 0 ? "ok" : "bad"}`} style={{ marginLeft: "auto" }}>
              {dProfit >= 0 ? "+" : "−"}<span className="num">{yenShort(Math.abs(dProfit))}</span>
            </span>
          )}
        </div>
        <div className={`big num ${a.profit < 0 ? "neg" : ""}`}>{yen(a.profit)}</div>
        {a.sales > 0 ? (
          <>
            <div className="mixbar">
              <div style={{ width: `${pct(a.laborAll, a.sales).toFixed(1)}%`, background: C.labor }} />
              <div style={{ width: `${pct(a.costAll, a.sales).toFixed(1)}%`, background: C.cost }} />
              <div style={{ flex: 1, background: a.profit >= 0 ? C.rest : "var(--crit)" }} />
            </div>
            <div className="mixlegend">
              <span><i className="swatch" style={{ background: C.labor }} />人件費 <b>{pct(a.laborAll, a.sales).toFixed(1)}%</b></span>
              <span><i className="swatch" style={{ background: C.cost }} />経費 <b>{pct(a.costAll, a.sales).toFixed(1)}%</b></span>
              <span><i className="swatch" style={{ background: a.profit >= 0 ? C.rest : "var(--crit)" }} />利益 <b>{pct(a.profit, a.sales).toFixed(1)}%</b></span>
            </div>
          </>
        ) : (
          <div className="hint" style={{ marginTop: 0 }}>売上を入れると内訳が出ます</div>
        )}
        <div className="heroSplit cols3">
          <div><div className="k">売上</div><div className="v">{yenShort(a.sales)}</div></div>
          <div><div className="k">客単価</div><div className="v">{a.guests > 0 ? yenShort(a.avgSpend) : "—"}</div></div>
          <div><div className="k">入力済み</div><div className="v">{a.days}<span style={{ fontSize: 13 }}>日</span></div></div>
        </div>
      </div>

      {fc.ready && <ForecastCard fc={fc} />}

      <AdviceCard L={L} m={m} />

      <ArrivalCard L={L} m={m} />

      <div className="tiles">
        <button type="button" className="tile link" onClick={() => { setUI({ tab: "cast" }); window.scrollTo(0, 0); }}>
          <div className="k">未払いの給料<ChevRight size={13} className="chevt" /></div><div className="v">{yen(a.unpaid)}</div>
          <div className="n">{owedCount > 0 ? `${owedCount}名分` : "未払いなし"}</div>
        </button>
        <button type="button" className="tile link" onClick={() => goSet("cash")}>
          <div className="k">今月の現金<ChevRight size={13} className="chevt" /></div><div className="v">{yen(mCash.net)}</div>
          <div className="n">売上 {yenShort(mCash.cash)} − 出金 {yenShort(mCash.expCash + mCash.paidCash + mCash.bankDeposit)}</div>
        </button>
        <button type="button" className="tile link" onClick={() => goSet("shop")}>
          <div className="k">カード未回収<ChevRight size={13} className="chevt" /></div><div className="v">{yen(b.cardOut)}</div><div className="n">手数料 {L.shop.cardFeeRate}%</div>
        </button>
        <button type="button" className="tile link" onClick={() => goSet("fixed")}>
          <div className="k">今月の経費<ChevRight size={13} className="chevt" /></div><div className="v">{yen(a.exp)}</div><div className="n">固定費 {yenShort(a.fixedCost)}</div>
        </button>
      </div>

      <div className="card">
        <div className="cardhead">
          <h2>日別の売上</h2>
          <div className="seg" role="group" aria-label="表示切替">
            <button type="button" aria-pressed={ui.monthMode !== "cal"} onClick={() => setMode("chart")}>グラフ</button>
            <button type="button" aria-pressed={ui.monthMode === "cal"} onClick={() => setMode("cal")}>カレンダー</button>
          </div>
        </div>
        <p className="sub" style={{ margin: "0 0 12px" }}>{ui.monthMode === "cal" ? "日付をタップすると、下にその日の収支が出ます" : "棒の高さが1日の売上。下が現金、上がカード。"}</p>
        {ui.monthMode === "cal"
          ? <Calendar month={m} series={a.series} selected={ui.calDay} onPick={(k) => setUI({ calDay: ui.calDay === k ? null : k })} />
          : <DailyChart month={m} series={a.series} />}
        {ui.monthMode === "cal" && (calT ? (
          <div className="caldetail">
            <div className="cdhead"><b>{dayLabel(calT.date)}</b><span className={`num ${calT.profit < 0 ? "neg" : ""}`}>{yen(calT.profit)}</span></div>
            <div className="lrow"><div className="g"><div className="t">売上</div><div className="s">現金 {jp(calT.cash)} ・ カード {jp(calT.card)}{calT.guests ? ` ・ ${calT.guests}名` : ""}</div></div><div className="a num">{yen(calT.sales)}</div></div>
            <div className="lrow"><div className="g"><div className="t">人件費</div><div className="s">在籍 {jp(calT.laborR)} ・ 派遣 {jp(calT.laborD)}{calT.paidLump ? ` ・ まとめ ${jp(calT.paidLump)}` : ""}</div></div><div className="a num">−{yen(calT.labor)}</div></div>
            <div className="lrow"><div className="g"><div className="t">経費</div><div className="s">うち現金 {jp(calT.expCash)}</div></div><div className="a num">−{yen(calT.exp)}</div></div>
            <div className="lrow"><div className="g"><div className="t">カード手数料</div><div className="s">{L.shop.cardFeeRate}%</div></div><div className="a num">−{yen(calT.fee)}</div></div>
            <div className="lrow total"><div className="g"><div className="t">差引</div><div className="s">日払い {jp(calT.paidCash)} ／ 未払い {jp(calT.unpaid)}</div></div><div className={`a num ${calT.profit < 0 ? "neg" : ""}`}>{yen(calT.profit)}</div></div>
            <div className="btnrow" style={{ marginTop: 12 }}><button type="button" className="btn sm" onClick={() => openDay(calT.date, 0)}>この日の日報を開く</button></div>
          </div>
        ) : <div className="empty" style={{ padding: "20px 12px" }}>日付をタップすると、その日の収支が出ます</div>)}
      </div>

      <CashCard L={L} m={m} />

      <BreakdownCard a={a} L={L} m={m} />

      <RankingCard L={L} m={m} />

      <div className="card">
        <h2>日別の明細</h2><p className="sub">行をタップするとその日の日報が開きます。横にスクロールできます。</p>
        {a.series.length ? (
          <div className="tw"><table>
            <thead><tr><th>日</th><th>現金</th><th>カード</th><th>人件費</th><th>経費</th><th>差引</th></tr></thead>
            <tbody>{a.series.map((t) => (
              <tr key={t.date} className="tr-link" tabIndex={0} onClick={() => openDay(t.date, 4)} onKeyDown={(e) => { if (e.key === "Enter") openDay(t.date, 4); }}>
                <td>{dayLabel(t.date)}</td>
                <td className="n">{t.cash ? jp(t.cash) : "—"}</td>
                <td className="n">{t.card ? jp(t.card) : "—"}</td>
                <td className="n">{t.labor ? jp(t.labor) : "—"}</td>
                <td className="n">{t.exp ? jp(t.exp) : "—"}</td>
                <td className={`n ${t.profit < 0 ? "neg" : ""}`}>{jp(t.profit)}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td>合計</td><td className="n">{jp(a.cash)}</td><td className="n">{jp(a.card)}</td><td className="n">{jp(a.labor)}</td><td className="n">{jp(a.exp)}</td><td className="n">{jp(a.sales - a.labor - a.exp - a.fee)}</td></tr></tfoot>
          </table></div>
        ) : <div className="empty">まだ日報がありません</div>}
        <div className="btnrow" style={{ marginTop: 12 }}><button type="button" className="btn sm" onClick={exportCsv}>CSVで書き出す</button></div>
      </div>

      <div className="card">
        <h2>金額の設定</h2><p className="sub">タップすると設定画面のその場所へ飛びます</p>
        <button type="button" className="setrow" onClick={() => goSet("shop")}><span className="g"><span className="t">基本時給・カード手数料</span><span className="s">時給 {yen(L.shop.defaultWage)} ／ 手数料 {L.shop.cardFeeRate}% ／ 派遣日給 {yen(L.shop.dispatchGuarantee)}</span></span><ChevRight className="chevi" /></button>
        <button type="button" className="setrow" onClick={() => goSet("backs")}><span className="g"><span className="t">バックの単価</span><span className="s">{L.backItems.slice(0, 3).map((x) => x.name).join("・")}{L.backItems.length > 3 ? ` ほか${L.backItems.length - 3}件` : ""}</span></span><ChevRight className="chevi" /></button>
        <button type="button" className="setrow" onClick={() => goSet("cash")}><span className="g"><span className="t">現金の起点</span><span className="s">{L.shop.openingDate} に {yen(L.shop.openingCash)}</span></span><ChevRight className="chevi" /></button>
        <button type="button" className="setrow" onClick={() => goSet("fixed")}><span className="g"><span className="t">月の固定費</span><span className="s">固定人件費 {yen(L.shop.fixedLabor)} ／ 家賃ほか {yen(L.shop.fixedCost)}</span></span><ChevRight className="chevi" /></button>
      </div>
    </>
  );
}

/** 今月の着地予測。日報は今日のことしか教えないので、月末に赤字と気づくのを防ぐ */
function ForecastCard({ fc }: { fc: Forecast }) {
  const v = fc.vsPrev;
  const sign = (n: number) => (n >= 0 ? "+" : "−");
  /** 売上・客単価は増えたら良い。人件費率は増えたら悪い */
  const tone = (n: number, upIsGood: boolean, eps = 0.5) =>
    Math.abs(n) < eps ? undefined : (n > 0) === upIsGood ? "var(--good)" : "var(--warn)";

  return (
    <div className="card">
      <div className="cardhead">
        <h2>このペースだと</h2>
        <span className="muted">残り {fc.remainingDays}日 ／ 入力済み {fc.recordedDays}日</span>
      </div>
      <div className={`fbig num ${fc.profit < 0 ? "neg" : ""}`}>{fc.profit >= 0 ? "+" : ""}{yen(fc.profit)}</div>
      <div className="hint" style={{ margin: "2px 0 0" }}>
        月末の営業利益の見込み。売上 {yenShort(fc.sales)} ・ 人件費率 {fc.laborRate.toFixed(1)}% ・ 客単価 {yenShort(fc.avgSpend)}
      </div>

      {v && (
        <>
          <div className="heroSplit cols3">
            <div><div className="k">先月比 売上</div>
              <div className="v" style={{ color: tone(v.sales, true, 1) }}>{sign(v.sales)}{yenShort(Math.abs(v.sales))}</div></div>
            <div><div className="k">人件費率</div>
              <div className="v" style={{ color: tone(v.laborRate, false) }}>{sign(v.laborRate)}{Math.abs(v.laborRate).toFixed(1)}%</div></div>
            <div><div className="k">客単価</div>
              <div className="v" style={{ color: tone(v.avgSpend, true, 1) }}>{sign(v.avgSpend)}{yenShort(Math.abs(v.avgSpend))}</div></div>
          </div>
          {fc.weekdays.length > 0 && (
            <div className="hint" style={{ marginBottom: 0 }}>
              先月より落ちているのは{" "}
              {fc.weekdays.map((w) => <b key={w.dow} style={{ marginRight: 8 }}>{WD[w.dow]}曜 {yen(w.diff)}</b>)}
              <span className="muted">（1 日あたりの差引）</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** 何時にお客様が入っているか。レジで打った伝票の入店時刻から出す。
 *  開店時刻を決め直したり、人を厚くする時間を決めたりするための材料。 */
function ArrivalCard({ L, m }: { L: ReturnType<typeof useApp.getState>["ledger"]; m: string }) {
  const checksOfMonth = usePos((s) => s.checksOfMonth);
  const posChecks = usePos((s) => s.checks);
  const [checks, setChecks] = useState<Check[]>([]);

  useEffect(() => {
    let alive = true;
    void checksOfMonth(m).then((list) => { if (alive) setChecks(list); });
    return () => { alive = false; };
  }, [checksOfMonth, m, posChecks]);

  const rule = L.posRule ?? defaultPosRule();
  const rows = useMemo(() => arrivalsByHour(checks, rule, L.shop), [checks, rule, L.shop]);
  const busiest = busiestHour(rows);
  const groups = rows.reduce((s, r) => s + r.groups, 0);

  // レジを使っていない月には出さない（空のグラフを置いても仕方がない）
  if (!checks.length) return null;

  return (
    <div className="card">
      <div className="cardhead">
        <h2>何時に入っているか</h2>
        <span className="muted">{groups} 組</span>
      </div>
      <p className="sub">レジで打った入店時刻から出しています。棒が組数、線が 1 組あたりの単価です。</p>
      <ArrivalChart rows={rows} />
      {busiest && (
        <div className="hint" style={{ marginBottom: 0 }}>
          一番入っているのは <b>{busiest.hour}時台</b>（{busiest.groups}組 ・ 1組あたり {yen(avgPerGroup(busiest))}）。
          {rows[0] && rows[0].groups === 0 && `${rows[0].hour}時台はまだ 0 組です。`}
        </div>
      )}
    </div>
  );
}

/** 利益をどう上げるか。効き目の大きい打ち手を上から並べ、
 *  タップすると「先月と比べて何がどれだけ効いたか」の内訳を開く。 */
function AdviceCard({ L, m }: { L: ReturnType<typeof useApp.getState>["ledger"]; m: string }) {
  const [open, setOpen] = useState(false);
  const list = useMemo(() => adviceFor(L, m), [L, m]);
  const bridge = useMemo(() => profitBridge(L, m), [L, m]);
  // 利益の打ち手だけをカードに出す。現金の手当ては金額が大きくても打ち手ではないので、
  // 内訳のシートの方にまとめる
  const levers = list.filter((x) => x.kind === "profit");
  const cash = list.filter((x) => x.kind === "cash");
  const [top, ...rest] = levers;

  if (!list.length && !bridge.ready) return null;

  return (
    <div className="card">
      <div className="cardhead">
        <h2>利益をどう上げるか</h2>
        {bridge.ready && (
          <span className={`pill ${bridge.diff >= 0 ? "ok" : "bad"}`}>
            先月より {bridge.diff >= 0 ? "+" : "−"}<span className="num">{yenShort(Math.abs(bridge.diff))}</span>
          </span>
        )}
      </div>
      <p className="sub">台帳の数字だけで出しています。効き目の大きい順です。</p>

      {levers.length === 0 ? (
        <div className="hint" style={{ marginBottom: 0 }}>いまのところ、目立って直せるところはありません。</div>
      ) : (
        <>
          <div className="lrow" style={{ alignItems: "flex-start" }}>
            <div className="g">
              <div className="t">{top.title}</div>
              <div className="s jp" style={{ whiteSpace: "normal" }}>{top.body}</div>
            </div>
            <div className="a num" style={{ color: "var(--warn)" }}>{yen(top.impact)}</div>
          </div>
          {rest.slice(0, 2).map((x) => (
            <div key={x.id} className="lrow" style={{ alignItems: "flex-start" }}>
              <div className="g"><div className="t">{x.title}</div></div>
              <div className="a num">{yen(x.impact)}</div>
            </div>
          ))}
          {rest.length > 2 && <div className="hint">ほか {rest.length - 2}件</div>}
        </>
      )}

      {cash.length > 0 && (
        <div className="hint" style={{ marginTop: 4 }}>
          あわせて現金の手当てが要ります：{cash.map((x) => x.title).join(" ／ ")}
        </div>
      )}

      {bridge.ready && (
        <div className="btnrow" style={{ marginTop: 10 }}>
          <button type="button" className="btn sm" onClick={() => setOpen(true)}>先月との差を分けて見る<ChevRight size={13} /></button>
        </div>
      )}

      {open && <AdviceSheet L={L} m={m} list={list} bridge={bridge} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** 先月との差の内訳。合計は必ず利益の差に一致する（合わない分析は読まれないので） */
function AdviceSheet({ L, m, list, bridge, onClose }: {
  L: ReturnType<typeof useApp.getState>["ledger"]; m: string;
  list: Advice[]; bridge: ProfitBridge; onClose: () => void;
}) {
  const exps = useMemo(() => expenseDeltas(L, m).filter((x) => x.diff !== 0).slice(0, 6), [L, m]);
  const wd = useMemo(() => weekdayCost(L, m).filter((x) => x.sales > 0), [L, m]);

  return (
    <BottomSheet open title={`${Number(m.slice(5, 7))}月 と ${Number(bridge.prevMonth.slice(5, 7))}月 の差`} onClose={onClose}>
      <div className="lrow"><div className="g"><div className="t">{Number(bridge.prevMonth.slice(5, 7))}月の営業利益</div></div>
        <div className="a num">{yen(bridge.prevProfit)}</div></div>
      <div className="lrow"><div className="g"><div className="t">{Number(m.slice(5, 7))}月の営業利益</div></div>
        <div className="a num">{yen(bridge.nowProfit)}</div></div>
      <div className="lrow total"><div className="g"><div className="t">差</div></div>
        <div className={`a num ${bridge.diff < 0 ? "neg" : ""}`}>{bridge.diff >= 0 ? "+" : ""}{yen(bridge.diff)}</div></div>

      <div className="sechead" style={{ marginTop: 12 }}><div className="t">何が効いたか</div><div className="l" /></div>
      <p className="hint" style={{ margin: "0 0 6px" }}>プラスが利益を押し上げたもの。全部足すと上の「差」になります。</p>
      {bridge.parts.map((x) => (
        <div key={x.id} className="lrow">
          <div className="g"><div className="t">{x.label}</div>{x.note && <div className="s">{x.note}</div>}</div>
          <div className="a num" style={{ color: x.diff >= 0 ? "var(--good)" : "var(--crit)" }}>
            {x.diff >= 0 ? "+" : "−"}{yen(Math.abs(x.diff))}
          </div>
        </div>
      ))}

      {exps.length > 0 && (
        <>
          <div className="sechead" style={{ marginTop: 14 }}><div className="t">経費の中身</div><div className="l" /></div>
          {exps.map((e) => (
            <div key={e.name} className="lrow">
              <div className="g"><div className="t">{e.name}</div><div className="s">{yen(e.prev)} → {yen(e.now)}</div></div>
              <div className="a num" style={{ color: e.diff > 0 ? "var(--crit)" : "var(--good)" }}>
                {e.diff > 0 ? "+" : "−"}{yen(Math.abs(e.diff))}
              </div>
            </div>
          ))}
        </>
      )}

      {wd.length >= 2 && (
        <>
          <div className="sechead" style={{ marginTop: 14 }}><div className="t">曜日ごとの人件費率</div><div className="l" /></div>
          {[...wd].sort((a, b) => b.rate - a.rate).map((x) => (
            <div key={x.dow} className="lrow">
              <div className="g"><div className="t">{WD[x.dow]}曜</div>
                <div className="s">{x.days}日 ・ 売上 {yenShort(x.sales)} ・ 人件費 {yenShort(x.labor)}</div></div>
              <div className="a num" style={{ color: x.rate >= 60 ? "var(--crit)" : x.rate >= 50 ? "var(--warn)" : undefined }}>
                {x.rate.toFixed(0)}%
              </div>
            </div>
          ))}
          <div className="hint">売上に対して人件費が何％かです。高い曜日から人を削るのが一番効きます。</div>
        </>
      )}

      {([["profit", "利益の打ち手", "この額ぶん、利益が増えうるもの"],
         ["cash", "現金の手当て", "利益は動きませんが、渡す日に現金が要ります"]] as const).map(([kind, title, sub]) => {
        const rows = list.filter((x) => x.kind === kind);
        if (!rows.length) return null;
        return (
          <div key={kind}>
            <div className="sechead" style={{ marginTop: 14 }}><div className="t">{title}</div><div className="l" /><div className="n">{rows.length}件</div></div>
            <p className="hint" style={{ margin: "0 0 6px" }}>{sub}</p>
            {rows.map((x) => (
              <div key={x.id} className="lrow" style={{ alignItems: "flex-start" }}>
                <div className="g"><div className="t">{x.title}</div>
                  <div className="s jp" style={{ whiteSpace: "normal" }}>{x.body}</div></div>
                <div className="a num" style={{ color: kind === "profit" ? "var(--warn)" : "var(--ink-3)" }}>{yen(x.impact)}</div>
              </div>
            ))}
          </div>
        );
      })}
    </BottomSheet>
  );
}
