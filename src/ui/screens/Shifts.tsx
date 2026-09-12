/** シフト。予定（オーナーが入れる）と実績（日報の出勤）を同じカレンダーで見せる。
 *  キャストとしてログインしている人には、自分のぶんだけ出す。 */
import { useMemo, useState } from "react";
import { useApp } from "../../state/store";
import { useCloud } from "../../state/cloud";
import { payOf } from "../../domain/calc";
import type { Ledger } from "../../domain/types";
import { lateLabel, lateMinutes, planFor, planTimes, plannedIds } from "../../domain/plans";
import { WD, addMinutes, dayLabel, daysInMonth, jp, todayISO } from "../../domain/format";
import { MonthBar } from "../components/MonthBar";
import { BottomSheet } from "../components/BottomSheet";
import { TimeField } from "../components/TimeField";
import { ChevRight } from "../icons";
import { CastHome, CastNotLinked } from "./CastHome";

export function Shifts() {
  const L = useApp((s) => s.ledger);
  const ui = useApp((s) => s.ui);
  const setUI = useApp((s) => s.setUI);
  const update = useApp((s) => s.update);
  const openDay = useApp((s) => s.openDay);
  const role = useCloud((s) => s.role());
  const myCastId = useCloud((s) => s.myCastId());
  const m = ui.month;
  /** 予定の時刻を直しているキャスト */
  const [editing, setEditing] = useState<string | null>(null);

  /** キャストとしてログインしているなら、その本人 */
  const me = useMemo(() => {
    if (role !== "cast" || !myCastId) return null;
    return L.casts.find((c) => c.id === myCastId) ?? null;
  }, [L.casts, myCastId, role]);

  const dim = daysInMonth(m);
  const lead = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).getDay();
  const today = todayISO();
  const sel = ui.calDay && ui.calDay.startsWith(m) ? ui.calDay : null;
  const active = L.casts.filter((c) => c.active !== false);

  const planOf = (k: string) => plannedIds(L, k);
  const workedOf = (k: string) => Object.keys(L.days[k]?.shifts ?? {}).filter((cid) => L.days[k].shifts[cid]?.on);

  const togglePlan = (k: string, castId: string) =>
    update((LL) => {
      if (!LL.plans) LL.plans = {};
      const cur = LL.plans[k] ?? [];
      LL.plans[k] = cur.some((p) => p.castId === castId) ? cur.filter((p) => p.castId !== castId) : [...cur, { castId }];
      if (!LL.plans[k].length) delete LL.plans[k];
      if (!Object.keys(LL.plans).length) delete LL.plans;
    });

  /** 予定の時刻を直す。空文字を渡すと店の既定に戻る */
  const setPlanTime = (k: string, castId: string, key: "in" | "out", v: string) =>
    update((LL) => {
      const row = LL.plans?.[k]?.find((p) => p.castId === castId);
      if (!row) return;
      if (v) row[key] = v; else delete row[key];
    });

  /* ---------- キャスト本人の画面 ---------- */
  // 本人向けは資産運用アプリの形にしてある（CastHome）。
  // ここはオーナー・スタッフ向けのシフト表なので、分岐して渡すだけ
  if (role === "cast") {
    if (!me) {
      return (
        <>
          <MonthBar month={m} onChange={(mm) => setUI({ month: mm, calDay: null })} />
          <CastNotLinked L={L} />
        </>
      );
    }
    return <CastHome me={me} />;
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
          <p className="sub">タップで予定に入れる／外す。入れたあと下の行をタップすると、何時から何時までかを決められます。</p>
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
          {selPlan.length > 0 && (
            <>
              <div className="sechead" style={{ marginTop: 4 }}><div className="t">この日の予定</div><div className="l" /><div className="n">{selPlan.length}人</div></div>
              {selPlan.map((cid) => {
                const c = L.casts.find((x) => x.id === cid);
                const row = planFor(L, sel, cid);
                const t = planTimes(L, sel, cid)!;
                const sh = L.days[sel]?.shifts?.[cid];
                const late = sh?.on ? lateLabel(lateMinutes(t.in, sh.in)) : "";
                return (
                  <button key={cid} type="button" className="lrow" onClick={() => setEditing(cid)}>
                    <div className="g"><div className="t">{c?.name || "（削除済み）"}</div>
                      <div className="s">
                        {row?.in || row?.out ? "" : "店の既定の時刻"}
                        {late ? <>{row?.in || row?.out ? "" : " ・ "}<span style={{ color: "var(--warn)" }}>{late}</span></> : null}
                      </div></div>
                    <div className="a num">{t.in}-{t.out}</div>
                  </button>
                );
              })}
            </>
          )}
          {selWorked.length > 0 && (
            <>
              <div className="sechead" style={{ marginTop: 4 }}><div className="t">この日の出勤</div><div className="l" /></div>
              {selWorked.map((cid) => {
                const c = L.casts.find((x) => x.id === cid);
                const sh = L.days[sel].shifts[cid];
                const p = payOf(L, cid, sh, sel);
                const late = lateLabel(lateMinutes(planTimes(L, sel, cid)?.in, sh.in));
                return (
                  <div key={cid} className="lrow">
                    <div className="g"><div className="t">{c?.name || "（削除済み）"}</div>
                      <div className="s">
                        {sh.in && sh.out ? `${sh.in}-${sh.out} ・ ` : ""}{p.hours.toFixed(1)}時間
                        {selPlan.includes(cid)
                          ? (late ? <> ・ <span style={{ color: "var(--warn)" }}>{late}</span></> : null)
                          : " ・ 予定になし"}
                      </div></div>
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

      {sel && editing && selPlan.includes(editing) && (
        <PlanSheet L={L} dk={sel} castId={editing}
          onTime={(key, v) => setPlanTime(sel, editing, key, v)}
          onRemove={() => { togglePlan(sel, editing); setEditing(null); }}
          onClose={() => setEditing(null)} />
      )}
    </>
  );
}

/** 予定の時刻を決めるシート。日報の出勤シートと同じ TimeField を使う */
function PlanSheet({ L, dk, castId, onTime, onRemove, onClose }: {
  L: Ledger; dk: string; castId: string;
  onTime: (key: "in" | "out", v: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const c = L.casts.find((x) => x.id === castId);
  const row = planFor(L, dk, castId);
  const t = planTimes(L, dk, castId);
  if (!t) return null;
  const isDefault = !row?.in && !row?.out;
  return (
    <BottomSheet open title={`${c?.name || "（名前なし）"} ・ ${dayLabel(dk)} の予定`} onClose={onClose}
      footer={<><span className="sum">予定 <b>{t.in}-{t.out}</b></span>
        <button type="button" className="btn sm danger" onClick={onRemove}>予定から外す</button></>}>
      <div className="row2">
        <label className="field" style={{ margin: 0 }}><span className="lbl">出勤</span>
          <TimeField value={t.in} ariaLabel="予定の出勤時刻" onChange={(v) => onTime("in", v)} /></label>
        <label className="field" style={{ margin: 0 }}><span className="lbl">退勤</span>
          <TimeField value={t.out} ariaLabel="予定の退勤時刻" onChange={(v) => onTime("out", v)} /></label>
      </div>
      <div className="quick" style={{ marginTop: 8 }}>
        <button type="button" className="btn" onClick={() => onTime("in", addMinutes(t.in, -60))}>出勤 −60分</button>
        <button type="button" className="btn" onClick={() => onTime("in", addMinutes(t.in, 60))}>+60分</button>
        <button type="button" className="btn" onClick={() => onTime("out", addMinutes(t.out, -60))}>退勤 −60分</button>
        <button type="button" className="btn" onClick={() => onTime("out", addMinutes(t.out, 60))}>+60分</button>
        {!isDefault && <button type="button" className="btn" onClick={() => { onTime("in", ""); onTime("out", ""); }}>店の既定に戻す</button>}
      </div>
      <div className="hint">
        {isDefault
          ? `いまは店の既定（${L.shop.openTime}-${L.shop.closeTime}）です。時刻を決めると、この日だけその時刻になります。`
          : "日報で出勤をONにすると、この時刻が最初に入ります。レジで打刻したときは、実際の時刻で上書きされます。"}
      </div>
    </BottomSheet>
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
