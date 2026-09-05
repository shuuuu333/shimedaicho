/** シフト。予定（オーナーが入れる）と実績（日報の出勤）を同じカレンダーで見せる。
 *  キャストとしてログインしている人には、自分のぶんだけ出す。 */
import { useMemo } from "react";
import { useApp } from "../../state/store";
import { useCloud } from "../../state/cloud";
import { castMonth, castShiftDays, payOf } from "../../domain/calc";
import { WD, dayLabel, daysInMonth, jp, monthLabel, todayISO, yen } from "../../domain/format";
import { MonthBar } from "../components/MonthBar";
import { ChevRight } from "../icons";

export function Shifts() {
  const L = useApp((s) => s.ledger);
  const ui = useApp((s) => s.ui);
  const setUI = useApp((s) => s.setUI);
  const update = useApp((s) => s.update);
  const openDay = useApp((s) => s.openDay);
  const role = useCloud((s) => s.role());
  const myEmail = useCloud((s) => s.email);
  const m = ui.month;

  /** キャストとしてログインしているなら、その本人 */
  const me = useMemo(() => {
    if (role !== "cast" || !myEmail) return null;
    const e = myEmail.toLowerCase();
    return L.casts.find((c) => (c.email ?? "").toLowerCase() === e) ?? null;
  }, [L.casts, myEmail, role]);

  const dim = daysInMonth(m);
  const lead = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).getDay();
  const today = todayISO();
  const sel = ui.calDay && ui.calDay.startsWith(m) ? ui.calDay : null;
  const active = L.casts.filter((c) => c.active !== false);

  const planOf = (k: string) => L.plans?.[k] ?? [];
  const workedOf = (k: string) => Object.keys(L.days[k]?.shifts ?? {}).filter((cid) => L.days[k].shifts[cid]?.on);

  const togglePlan = (k: string, castId: string) =>
    update((LL) => {
      if (!LL.plans) LL.plans = {};
      const cur = LL.plans[k] ?? [];
      LL.plans[k] = cur.includes(castId) ? cur.filter((x) => x !== castId) : [...cur, castId];
      if (!LL.plans[k].length) delete LL.plans[k];
      if (!Object.keys(LL.plans).length) delete LL.plans;
    });

  /* ---------- キャスト本人の画面 ---------- */
  if (role === "cast") {
    if (!me) {
      return (
        <>
          <MonthBar month={m} onChange={(mm) => setUI({ month: mm, calDay: null })} />
          <div className="card"><div className="empty">まだあなたのアカウントがキャストに結び付いていません。<br />オーナーに、設定のメンバー欄で結び付けてもらってください。</div></div>
        </>
      );
    }
    const mine = castShiftDays(L, me.id, m);
    const row = castMonth(L, m).find((r) => r.cast.id === me.id) ?? null;
    const plannedAhead = mine.filter((d) => !d.worked && d.date >= today);
    return (
      <>
        <MonthBar month={m} onChange={(mm) => setUI({ month: mm, calDay: null })} right={<>出勤<b>{row?.days ?? 0}日</b></>} />

        <div className="hero">
          <div className="label"><span>{me.name} さんの{monthLabel(m)}</span></div>
          <div className="heroSplit cols3" style={{ marginTop: 8, paddingTop: 0, borderTop: 0 }}>
            <div><div className="k">出勤</div><div className="v">{row?.days ?? 0}<span style={{ fontSize: 13 }}>日</span></div></div>
            <div><div className="k">時間</div><div className="v">{(row?.hours ?? 0).toFixed(1)}<span style={{ fontSize: 13 }}>h</span></div></div>
            <div><div className="k">これから</div><div className="v">{plannedAhead.length}<span style={{ fontSize: 13 }}>日</span></div></div>
          </div>
          <div className="heroSplit">
            <div><div className="k">支給</div><div className="v">{yen(row?.gross ?? 0)}</div></div>
            <div><div className="k">未払い</div><div className="v" style={{ color: (row?.unpaid ?? 0) > 0 ? "var(--warn)" : undefined }}>{yen(row?.unpaid ?? 0)}</div></div>
          </div>
        </div>

        <div className="card">
          <h2>カレンダー</h2><p className="sub">濃い色が出勤した日、枠だけの日がこれからの予定です。</p>
          <CalGrid m={m} dim={dim} lead={lead} today={today} sel={null} onPick={() => {}}
            cell={(k) => ({ planned: planOf(k).includes(me.id), worked: !!L.days[k]?.shifts?.[me.id]?.on })} />
        </div>

        <div className="sechead"><div className="t">日ごとの記録</div><div className="l" /><div className="n">{mine.length}日</div></div>
        {mine.map((d) => (
          <div key={d.date} className="wrow" style={{ cursor: "default" }}>
            <span className="avatar">{Number(d.date.slice(8, 10))}</span>
            <span className="g">
              <span className="t">{dayLabel(d.date)}</span>
              <span className="s jp">{d.worked ? `${d.hours.toFixed(1)}時間 はたらきました` : d.date >= today ? "これからの予定" : "予定でしたが記録がありません"}</span>
            </span>
            <span className="r">{d.worked ? <span className="a">{jp(d.gross)}</span> : <span className="n">—</span>}</span>
          </div>
        ))}
        {!mine.length && <div className="card"><div className="empty">この月はまだ予定も記録もありません</div></div>}
      </>
    );
  }

  /* ---------- オーナー・スタッフの画面 ---------- */
  const selPlan = sel ? planOf(sel) : [];
  const selWorked = sel ? workedOf(sel) : [];
  const totalPlanned = Object.keys(L.plans ?? {}).filter((k) => k.startsWith(m)).length;

  return (
    <>
      <MonthBar month={m} onChange={(mm) => setUI({ month: mm, calDay: null })} right={<>予定<b>{totalPlanned}日</b></>} />

      <div className="card">
        <h2>シフト</h2><p className="sub">日をタップして、その日に入る子を選びます。塗りつぶしが出勤した日です。</p>
        <CalGrid m={m} dim={dim} lead={lead} today={today} sel={sel}
          onPick={(k) => setUI({ calDay: sel === k ? null : k })}
          cell={(k) => ({ planned: planOf(k).length > 0, worked: workedOf(k).length > 0, n: workedOf(k).length || planOf(k).length })} />
      </div>

      {sel ? (
        <div className="card">
          <div className="cardhead">
            <h2>{dayLabel(sel)}</h2>
            <button type="button" className="btn sm" onClick={() => openDay(sel, 1)}>日報を開く<ChevRight size={14} /></button>
          </div>
          <p className="sub">タップで予定に入れる／外す。すでに出勤の記録がある子には「出勤済み」と出ます。</p>
          <div className="chipgrid">
            {active.map((c) => {
              const on = selPlan.includes(c.id);
              const worked = selWorked.includes(c.id);
              return (
                <button key={c.id} type="button" className={`cchip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => togglePlan(sel, c.id)}>
                  {on ? "✓ " : ""}{c.name || "（名前なし）"}{worked ? <span style={{ fontSize: 10, opacity: 0.75, marginLeft: 4 }}>出勤済み</span> : null}
                </button>
              );
            })}
          </div>
          {!active.length && <div className="empty" style={{ padding: 14 }}>キャストが登録されていません</div>}
          {selWorked.length > 0 && (
            <>
              <div className="sechead" style={{ marginTop: 4 }}><div className="t">この日の出勤</div><div className="l" /></div>
              {selWorked.map((cid) => {
                const c = L.casts.find((x) => x.id === cid);
                const p = payOf(L, cid, L.days[sel].shifts[cid], sel);
                return (
                  <div key={cid} className="lrow">
                    <div className="g"><div className="t">{c?.name || "（削除済み）"}</div>
                      <div className="s">{p.hours.toFixed(1)}時間{selPlan.includes(cid) ? " ・ 予定どおり" : " ・ 予定になし"}</div></div>
                    <div className="a num">{jp(p.gross)}</div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      ) : (
        <div className="card"><div className="empty">日をタップすると、その日のシフトを決められます</div></div>
      )}
    </>
  );
}

/** 予定と実績を出す月カレンダー */
function CalGrid({ m, dim, lead, today, sel, onPick, cell }: {
  m: string; dim: number; lead: number; today: string; sel: string | null;
  onPick: (k: string) => void;
  cell: (k: string) => { planned: boolean; worked: boolean; n?: number };
}) {
  return (
    <>
      <div className="cal-head">{WD.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="cal-grid">
        {Array.from({ length: lead }, (_, i) => <div key={"b" + i} className="cal-cell blank" aria-hidden="true" />)}
        {Array.from({ length: dim }, (_, i) => i + 1).map((d) => {
          const k = `${m}-${String(d).padStart(2, "0")}`;
          const st = cell(k);
          const dow = (lead + d - 1) % 7;
          const cls = st.worked ? "worked" : st.planned ? "planned" : "";
          return (
            <button key={k} type="button" onClick={() => onPick(k)}
              className={`cal-cell shiftcell ${dow === 0 || dow === 6 ? "wk" : ""} ${cls} ${sel === k ? "sel" : ""} ${k === today ? "today" : ""}`}
              aria-pressed={sel === k}
              aria-label={`${Number(m.slice(5, 7))}月${d}日 ${st.worked ? "出勤" : st.planned ? "予定あり" : "なし"}`}>
              <span className="cd">{d}</span>
              {st.n ? <span className="cn num">{st.n}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="legend" style={{ marginTop: 10 }}>
        <span><i style={{ background: "var(--accent)" }} />出勤した日</span>
        <span><i style={{ background: "transparent", boxShadow: "inset 0 0 0 1.5px var(--accent)" }} />これからの予定</span>
      </div>
    </>
  );
}
