import { useMemo, useState, type ReactNode } from "react";
import { useApp } from "../../state/store";
import { useCloud } from "../../state/cloud";
import type { RankMetric } from "../../domain/types";
import { balances, castContribution, castRanking, dayTotals, missingDays, monthTotals, owedList, pct, weekdaySales, yearTotals } from "../../domain/calc";
import { WD, dayLabel, jp, shiftDay, shiftMonth, todayISO, yen, yenShort } from "../../domain/format";
import { C, Calendar, CompositionChart, DailyChart, PALETTE, PieChart, YearChart, type PiePart } from "../charts";
import { MonthBar } from "../components/MonthBar";
import { ChevLeft, ChevRight, Plus } from "../icons";
import { csvFilename, monthCSV, offerFile } from "../../data/backup";

type PieKind = "bar" | "use" | "cast" | "dow";

const METRICS: { id: RankMetric; label: string; unit: string; sub: string }[] = [
  { id: "target", label: "売上", unit: "円", sub: "ボトルなど「売上%」型バックの対象売上" },
  { id: "back", label: "バック", unit: "円", sub: "ドリンク・指名・同伴・ボトルの合計" },
  { id: "count", label: "本数", unit: "本", sub: "件数で付けるバックの本数の合計" },
];

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
        <h2>キャスト別のランキング</h2>
        <div className="seg" role="group" aria-label="ランキングの基準">
          {METRICS.map((x) => (
            <button key={x.id} type="button" aria-pressed={metric === x.id} onClick={() => setMetric(x.id)}>{x.label}</button>
          ))}
        </div>
      </div>
      <p className="sub">{info.sub}{hide ? "。金額はオーナーだけが見られます。" : ""}</p>
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
    { label: "人件費", value: a.laborAll, color: C.labor },
    { label: "経費・手数料", value: a.costAll, color: C.cost },
    { label: "営業利益", value: Math.max(0, a.profit), color: C.rest },
  ];
  const top = contrib.rows.slice(0, 7);
  const rest = contrib.rows.slice(7).reduce((s, r) => s + r.value, 0);
  const castParts: PiePart[] = [...top.map((r, i) => ({ label: r.name, value: r.value, color: PALETTE[i % PALETTE.length] })), ...(rest > 0 ? [{ label: "その他", value: rest, color: C.rest }] : [])];
  const dowColors = [C.card, C.muted, C.muted, C.muted, C.muted, C.labor, C.cash];
  const dowParts: PiePart[] = dow.map((v, i) => ({ label: WD[i] + "曜", value: v, color: dowColors[i] }));
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
      {kind === "use" && <PieChart parts={a.sales > 0 ? useParts : []} center={a.sales > 0 ? `${pct(a.profit, a.sales).toFixed(0)}%` : undefined} empty="売上が入ると内訳が出ます" />}
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
    { label: "人件費", value: y.laborAll, color: C.labor },
    { label: "経費・手数料", value: y.costAll, color: C.cost },
    { label: "営業利益", value: Math.max(0, y.profit), color: C.rest },
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
        <h2>月別の売上と利益</h2><p className="sub">棒が売上（下が現金、上がカード）、線が営業利益。棒をタップするとその月へ。</p>
        <YearChart months={y.months} onPick={pickMonth} />
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
        <PieChart parts={y.sales > 0 ? useParts : []} center={y.sales > 0 ? `${pct(y.profit, y.sales).toFixed(0)}%` : undefined} empty="売上が入ると内訳が出ます" />
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

  const today = todayISO(), isCur = m === today.slice(0, 7);
  const diff = b.lastCount != null ? b.lastCount - b.cash : null;
  const dProfit = a.profit - prev.profit;
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
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8, marginBottom: 5 }}>
          <button type="button" className="mb" aria-label="前の月" style={{ width: 34, height: 34 }} onClick={() => setMonth(shiftMonth(m, -1))}><ChevLeft size={15} /></button>
          <button type="button" className="mb" aria-label="次の月" style={{ width: 34, height: 34 }} onClick={() => setMonth(shiftMonth(m, 1))}><ChevRight size={15} /></button>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ marginBottom: 4 }}>{seg}</div>
      </div>

      {!L.casts.length && !a.days && (
        <div className="banner">まず<b>設定</b>でバック単価と時給を決めて、<b>キャスト</b>に在籍者を登録してください。あとは<b>日報</b>を毎日つけるだけで、ここが埋まります。</div>
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

      <div className="tiles">
        <button type="button" className="tile link" onClick={() => { setUI({ tab: "cast" }); window.scrollTo(0, 0); }}>
          <div className="k">未払いの給料<ChevRight size={13} className="chevt" /></div><div className="v">{yen(a.unpaid)}</div>
          <div className="n">{owedCount > 0 ? `${owedCount}名分` : "未払いなし"}</div>
        </button>
        <button type="button" className="tile link" onClick={() => goSet("cash")}>
          <div className="k">手元の現金<ChevRight size={13} className="chevt" /></div><div className="v">{yen(b.cash)}</div>
          <div className={`n ${diff === 0 ? "ok" : ""}`}>{diff == null ? "起点の現金を直す" : diff === 0 ? "実査と一致" : `${diff > 0 ? "過剰" : "不足"} ${yen(Math.abs(diff))}`}</div>
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
