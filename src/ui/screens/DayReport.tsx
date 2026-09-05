/** 日報 = 5 ステップの締めウィザード：売上 → 出勤 → 派遣 → 経費 → 現金・締め */
import { useMemo, type ReactNode } from "react";
import { useApp } from "../../state/store";
import type { DayRecord, DispatchRow, Ledger, Shift } from "../../domain/types";
import { emptyDay } from "../../domain/migrate";
import { backRate, calcBacks, cashAsOf, castWageAt, dayTotals, dispatchNames, dispatchPay, num, payOf, unpaidFor, whoLabel } from "../../domain/calc";
import { WD, addMinutes, dayLabel, jp, shiftDay, shiftMonth, todayISO, uid, yen } from "../../domain/format";
import { NumberField } from "../components/NumberField";
import { TimeField } from "../components/TimeField";
import { Stepper } from "../components/Stepper";
import { BottomSheet } from "../components/BottomSheet";
import { ChevLeft, ChevRight, Copy, Trash } from "../icons";
import { Notice } from "../components/Notice";

const STEPS = ["売上", "出勤", "派遣", "経費", "締め"];

const newShift = (): Shift => ({ on: false, in: "", out: "", breakMin: null, backs: {}, deduct: null, paid: null });

export function DayReport() {
  const L = useApp((s) => s.ledger);
  const ui = useApp((s) => s.ui);
  const setUI = useApp((s) => s.setUI);
  const editDay = useApp((s) => s.editDay);
  const updateWithUndo = useApp((s) => s.updateWithUndo);
  const showToast = useApp((s) => s.showToast);
  const openDay = useApp((s) => s.openDay);

  const dk = ui.day;
  const d: DayRecord = L.days[dk] ?? emptyDay();
  const t = useMemo(() => dayTotals(L, dk), [L, dk]);
  const isToday = dk === todayISO();
  const step = Math.min(4, Math.max(0, ui.step));
  const go = (s: number) => { setUI({ step: s, sheet: null }); window.scrollTo(0, 0); };
  const edit = (mut: (dd: DayRecord, L: Ledger) => void) => editDay(dk, mut);

  return (
    <>
      <div className="datebar">
        <button type="button" className="mb" aria-label="前の日" onClick={() => openDay(shiftDay(dk, -1))}><ChevLeft size={17} /></button>
        <label className="mid pick">
          <span className="d">{Number(dk.slice(5, 7))}月{Number(dk.slice(8, 10))}日（{WD[new Date(dk + "T00:00:00").getDay()]}）</span>
          <span className="s">{isToday ? "今日" : dk}</span>
          <input type="date" value={dk} aria-label="日付" onChange={(e) => openDay(e.target.value || todayISO())} />
        </label>
        <button type="button" className="mb" aria-label="次の日" onClick={() => openDay(shiftDay(dk, 1))}><ChevRight size={17} /></button>
        {!isToday && <button type="button" className="mb today" onClick={() => openDay(todayISO())}>今日</button>}
      </div>

      <div className="steps" role="tablist" aria-label="締めの手順">
        {STEPS.map((s, i) => (
          <button key={s} type="button" role="tab" aria-current={i === step ? "step" : undefined} className={i < step ? "done" : ""} onClick={() => go(i)}>
            <i /><span>{i + 1} {s}</span>
          </button>
        ))}
      </div>

      <div className="daysum" aria-live="polite">
        <div><div className="k">売上</div><div className="v">{jp(t.sales)}</div></div>
        <div><div className="k">人件費</div><div className="v">{jp(t.labor)}</div></div>
        <div><div className="k">差引</div><div className={`v ${t.profit < 0 ? "neg" : ""}`} style={t.profit >= 0 ? { color: "var(--good)" } : undefined}>{jp(t.profit)}</div></div>
      </div>

      {step === 0 && <SalesStep d={d} edit={edit} t={t} />}
      {step === 1 && <AttendStep L={L} dk={dk} d={d} edit={edit} t={t} openSheet={(id) => setUI({ sheet: { kind: "cast", id } })} showToast={showToast} />}
      {step === 2 && <DispatchStep L={L} d={d} edit={edit} t={t} openSheet={(id) => setUI({ sheet: { kind: "disp", id } })} updateWithUndo={updateWithUndo} dk={dk} />}
      {step === 3 && <ExpenseStep d={d} edit={edit} t={t} updateWithUndo={updateWithUndo} dk={dk} />}
      {step === 4 && <CloseStep L={L} dk={dk} d={d} edit={edit} t={t} updateWithUndo={updateWithUndo} />}

      <div className="wizfoot">
        {step > 0 && <button type="button" className="btn" onClick={() => go(step - 1)}>戻る</button>}
        {step < 4
          ? <button type="button" className="btn primary" onClick={() => go(step + 1)}>次へ：{STEPS[step + 1]}</button>
          : <button type="button" className="btn primary" onClick={() => { setUI({ tab: "month", month: dk.slice(0, 7), sheet: null }); window.scrollTo(0, 0); }}>締め完了・今月を見る</button>}
      </div>

      {ui.sheet?.kind === "cast" && <CastSheet L={L} dk={dk} d={d} castId={ui.sheet.id} edit={edit} onClose={() => setUI({ sheet: null })} />}
      {ui.sheet?.kind === "disp" && <DispSheet L={L} d={d} rowId={ui.sheet.id} edit={edit} onClose={() => setUI({ sheet: null })} />}
    </>
  );
}

type Edit = (mut: (dd: DayRecord, L: Ledger) => void) => void;
type T = ReturnType<typeof dayTotals>;

function StepHead({ title, note }: { title: string; note?: ReactNode }) {
  return <div className="stephead"><h1>{title}</h1>{note && <span className="n">{note}</span>}</div>;
}

/* ---------- 1. 売上 ---------- */
function SalesStep({ d, edit, t }: { d: DayRecord; edit: Edit; t: T }) {
  return (
    <div className="card">
      <StepHead title="売上" note="閉店後の合計を入れます" />
      <label className="field"><span className="lbl">現金売上</span><NumberField big value={d.cashSales} onChange={(v) => edit((dd) => { dd.cashSales = v; })} /></label>
      <label className="field"><span className="lbl">カード売上</span><NumberField big value={d.cardSales} onChange={(v) => edit((dd) => { dd.cardSales = v; })} /></label>
      <label className="field"><span className="lbl">組数・客数（客単価の計算用・任意）</span><NumberField value={d.guests} onChange={(v) => edit((dd) => { dd.guests = v; })} /></label>
      <div className="hint">売上合計 <b className="num">{yen(t.sales)}</b>{t.card ? ` ／ カード手数料 ${yen(t.fee)}` : ""}</div>
    </div>
  );
}

/* ---------- 2. 出勤 ---------- */
function AttendStep({ L, dk, d, edit, t, openSheet, showToast }: { L: Ledger; dk: string; d: DayRecord; edit: Edit; t: T; openSheet: (id: string) => void; showToast: (m: string) => void }) {
  const active = L.casts.filter((c) => c.active !== false);
  const onList = active.filter((c) => d.shifts[c.id]?.on);
  const toggle = (cid: string) => edit((dd, LL) => {
    const sh = dd.shifts[cid] ?? newShift();
    sh.on = !sh.on;
    if (sh.on) {
      if (!sh.in && LL.shop.openTime) sh.in = LL.shop.openTime;
      if (!sh.out && LL.shop.closeTime) sh.out = LL.shop.closeTime;
    }
    dd.shifts[cid] = sh;
  });
  const copyPrev = () => {
    const src = Object.keys(L.days).sort().filter((k) => k < dk && Object.values(L.days[k].shifts ?? {}).some((x) => x?.on)).pop();
    if (!src) { showToast("コピーできる出勤記録がありません"); return; }
    let cnt = 0;
    edit((dd) => {
      for (const cid of Object.keys(L.days[src].shifts)) {
        const x = L.days[src].shifts[cid];
        if (!x?.on) continue;
        const c = L.casts.find((c) => c.id === cid);
        if (!c || c.active === false) continue;
        if (dd.shifts[cid]?.on) continue;
        dd.shifts[cid] = { on: true, in: x.in, out: x.out, breakMin: x.breakMin, backs: {}, deduct: null, paid: null };
        cnt++;
      }
    });
    showToast(cnt ? `${dayLabel(src)} の出勤 ${cnt}名をコピーしました` : `${dayLabel(src)} の出勤は全員チェック済みです`);
  };
  if (!active.length) {
    return <div className="card"><StepHead title="出勤" /><div className="empty">キャストが登録されていません<br /><span className="hint">「キャスト」タブから登録できます</span></div></div>;
  }
  return (
    <div className="card">
      <StepHead title="出勤" note="出た子をタップ。行を開いて本数を入れます" />
      <div className="chipgrid">
        {active.map((c) => {
          const on = !!d.shifts[c.id]?.on;
          return <button key={c.id} type="button" className={`cchip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => toggle(c.id)}>{on ? "✓ " : ""}{c.name || "（名前なし）"}</button>;
        })}
      </div>
      {onList.map((c) => {
        const sh = d.shifts[c.id];
        const p = payOf(L, c.id, sh, dk);
        const hasBacks = Object.values(sh.backs).some((v) => num(v) > 0);
        return (
          <button key={c.id} type="button" className={`wrow ${hasBacks ? "" : "alert"}`} onClick={() => openSheet(c.id)}>
            <span className="avatar">{(c.name || "?").slice(0, 1)}</span>
            <span className="g">
              <span className="t">{c.name || "（名前なし）"}</span>
              {hasBacks
                ? <span className="s">{sh.in || "?"}-{sh.out || "?"} · {p.hours.toFixed(1)}時間{p.paid ? ` · 日払い ${jp(p.paid)}` : ""}</span>
                : <span className="s warn">本数がまだ入っていません</span>}
            </span>
            <span className="r"><span className="a">{jp(p.gross)}</span></span>
            <ChevRight size={15} className="chevi" />
          </button>
        );
      })}
      {!onList.length && <div className="empty" style={{ padding: 14 }}>まだ誰も出勤になっていません</div>}
      <div className="btnrow" style={{ marginTop: 10, alignItems: "center" }}>
        <button type="button" className="btn sm" onClick={copyPrev}><Copy size={14} />前回の出勤をコピー</button>
        <span className="hint" style={{ margin: "0 0 0 auto" }}>在籍 {t.workersR}名 ／ 給料計 <b>{yen(t.laborR)}</b></span>
      </div>
    </div>
  );
}

/* ---------- バック入力（在籍・派遣 共通） ---------- */
function BackRows({ L, backs, isDispatch, onChange }: { L: Ledger; backs: Record<string, number | null>; isDispatch: boolean; onChange: (id: string, v: number | null) => void }) {
  const calc = calcBacks(L.backItems, backs, isDispatch);
  return (
    <>
      {L.backItems.map((b) => {
        const r = backRate(b, isDispatch), amt = calc.backs[b.id].amount;
        return (
          <div key={b.id} className="backrow">
            <div><div className="bn">{b.name || "（項目名なし）"}</div><div className="br">{b.type === "amount" ? `売上の ${r}%` : `${yen(r)} / 件`}{isDispatch ? " ・派遣" : ""}</div></div>
            <div className="ctl">
              {b.type === "amount"
                ? <NumberField style={{ width: 118 }} value={backs[b.id] ?? null} placeholder="対象売上" onChange={(v) => onChange(b.id, v)} aria-label={b.name} />
                : <Stepper value={backs[b.id] ?? null} onChange={(v) => onChange(b.id, v)} label={b.name} />}
              <span className="sum">{amt ? yen(amt) : "—"}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}

function CastSheet({ L, dk, d, castId, edit, onClose }: { L: Ledger; dk: string; d: DayRecord; castId: string; edit: Edit; onClose: () => void }) {
  const c = L.casts.find((x) => x.id === castId);
  const sh = d.shifts[castId];
  if (!c || !sh) return null;
  const p = payOf(L, castId, sh, dk);
  const set = (mut: (s: Shift) => void) => edit((dd) => { mut(dd.shifts[castId]); });
  return (
    <BottomSheet open title={`${c.name || "（名前なし）"} ・ ${dayLabel(dk)}`} onClose={onClose}
      footer={<><span className="sum">支給額 <b>{yen(p.gross)}</b><br />未払い残 {yen(p.unpaid)}</span>
        <button type="button" className="btn sm danger" onClick={() => { set((s) => { s.on = false; }); onClose(); }}>出勤を外す</button></>}>
      <div className="row2">
        <label className="field" style={{ margin: 0 }}><span className="lbl">出勤</span><TimeField value={sh.in} ariaLabel="出勤時刻" onChange={(v) => set((s) => { s.in = v; })} /></label>
        <label className="field" style={{ margin: 0 }}><span className="lbl">退勤</span><TimeField value={sh.out} ariaLabel="退勤時刻" onChange={(v) => set((s) => { s.out = v; })} /></label>
      </div>
      <div className="quick" style={{ marginTop: 8 }}>
        <button type="button" className="btn" onClick={() => set((s) => { s.in = addMinutes(s.in || L.shop.openTime, 30); })}>遅刻 +30分</button>
        <button type="button" className="btn" onClick={() => set((s) => { s.in = addMinutes(s.in || L.shop.openTime, 60); })}>+60分</button>
        <button type="button" className="btn" onClick={() => set((s) => { s.out = addMinutes(s.out || L.shop.closeTime, -30); })}>早退 −30分</button>
        <button type="button" className="btn" onClick={() => set((s) => { s.out = addMinutes(s.out || L.shop.closeTime, -60); })}>−60分</button>
        <button type="button" className="btn" onClick={() => set((s) => { s.in = L.shop.openTime; s.out = L.shop.closeTime; })}>定時に戻す</button>
      </div>
      <div className="hint" style={{ margin: "0 0 10px" }}>時給 {yen(castWageAt(c, L.shop, dk))} × {p.hours.toFixed(2)}h ＝ <b>{yen(p.wage)}</b>（{L.shop.roundMinutes}分単位で切り捨て）</div>
      <BackRows L={L} backs={sh.backs} isDispatch={false} onChange={(id, v) => set((s) => { s.backs[id] = v; })} />
      <div className="row3" style={{ marginTop: 11 }}>
        <label className="field" style={{ margin: 0 }}><span className="lbl">休憩 分</span><NumberField value={sh.breakMin} onChange={(v) => set((s) => { s.breakMin = v; })} /></label>
        <label className="field" style={{ margin: 0 }}><span className="lbl">控除</span><NumberField value={sh.deduct} onChange={(v) => set((s) => { s.deduct = v; })} /></label>
        <label className="field" style={{ margin: 0 }}><span className="lbl">日払い</span><NumberField value={sh.paid} onChange={(v) => set((s) => { s.paid = v; })} /></label>
      </div>
      <div className="hint">日払いは「その場で渡した額」。残りは未払いとして溜まり、キャスト画面から精算できます。</div>
    </BottomSheet>
  );
}

/* ---------- 3. 派遣 ---------- */
function DispatchStep({ L, d, dk, edit, t, openSheet, updateWithUndo }: { L: Ledger; d: DayRecord; dk: string; edit: Edit; t: T; openSheet: (id: string) => void; updateWithUndo: (m: string, mut: (L: Ledger) => void) => void }) {
  const add = () => {
    const row: DispatchRow = { id: uid(), name: "", guarantee: null, in: "", out: "", breakMin: null, backs: {}, deduct: null, paid: null };
    edit((dd) => { dd.dispatch.push(row); });
    openSheet(row.id);
  };
  const del = (i: number) => {
    const r = d.dispatch[i];
    updateWithUndo(`${(r.name || "").trim() || "派遣の行"} を消しました`, (LL) => { LL.days[dk]?.dispatch.splice(i, 1); });
  };
  return (
    <div className="card">
      <StepHead title="派遣" note="来た子の名前と日給・バックを記録" />
      {d.dispatch.map((row, i) => {
        const p = dispatchPay(L, row);
        return (
          <div key={row.id}>
          <div className="wrow" style={{ padding: "6px 6px 6px 12px", marginBottom: 6 }}>
            <button type="button" className="g" style={{ all: "unset", flex: 1, minWidth: 0, cursor: "pointer", display: "block" }} onClick={() => openSheet(row.id)}>
              <span className="t" style={{ display: "block" }}><span className="tag" style={{ fontSize: 10, color: "var(--accent)", marginRight: 6 }}>派遣</span>{(row.name || "").trim() || <span className="warn">名前を入れる</span>}</span>
              <span className="s" style={{ display: "block" }}>日給 {jp(p.guarantee)}{p.backTotal ? ` ・ バック ${jp(p.backTotal)}` : ""}{p.paid ? ` ・ 日払い ${jp(p.paid)}` : ""}</span>
            </button>
            <span className="a num" onClick={() => openSheet(row.id)}>{yen(p.gross)}</span>
            <button type="button" className="iconbtn" aria-label={`${row.name || "派遣の行"}を削除`} onClick={() => del(i)}><Trash /></button>
          </div>
          <div className="payrow">
            <span className="lbl">支払い</span>
            <NumberField value={row.paid} placeholder="渡した額" aria-label={`${row.name || "派遣"}への支払い`} onChange={(v) => edit((dd) => { const r = dd.dispatch.find((x) => x.id === row.id); if (r) r.paid = v; })} />
            {p.unpaid <= 0 && p.paid > 0
              ? <span className="pill ok">全額払い済み</span>
              : <button type="button" className="btn sm primary" onClick={() => edit((dd) => { const r = dd.dispatch.find((x) => x.id === row.id); if (r) r.paid = p.gross; })}>全額払う</button>}
            {p.unpaid > 0 && p.paid > 0 && <span className="pill bad">未払い {yen(p.unpaid)}</span>}
          </div>
          </div>
        );
      })}
      {!d.dispatch.length && <div className="empty" style={{ padding: 14 }}>この日は派遣なし</div>}
      <div className="btnrow" style={{ marginTop: 10, alignItems: "center" }}>
        <button type="button" className="btn sm" onClick={add}>＋ 派遣を足す</button>
      </div>
      {d.dispatch.length > 0 && (() => {
        const paidD = d.dispatch.reduce((s, r) => s + dispatchPay(L, r).paid, 0);
        return <div className="hint" style={{ marginTop: 8 }}>派遣 {t.workersD}名 ／ 支給計 <b>{yen(t.laborD)}</b> ／ 今日払った額 <b>{yen(paidD)}</b>{t.laborD - paidD > 0 ? <> ／ 未払い <b className="neg">{yen(t.laborD - paidD)}</b></> : ""}</div>;
      })()}
    </div>
  );
}

function DispSheet({ L, d, rowId, edit, onClose }: { L: Ledger; d: DayRecord; rowId: string; edit: Edit; onClose: () => void }) {
  const idx = d.dispatch.findIndex((r) => r.id === rowId);
  const row = d.dispatch[idx];
  if (!row) return null;
  const p = dispatchPay(L, row);
  const set = (mut: (r: DispatchRow) => void) => edit((dd) => { const r = dd.dispatch.find((x) => x.id === rowId); if (r) mut(r); });
  const names = dispatchNames(L);
  return (
    <BottomSheet open title={`派遣 ・ ${(row.name || "").trim() || "名前を入れる"}`} onClose={onClose}
      footer={<span className="sum">支給額 <b>{yen(p.gross)}</b><br />未払い残 {yen(p.unpaid)}</span>}>
      <div className="row2">
        <label className="field" style={{ margin: 0 }}><span className="lbl">名前</span><input className="inp" list="dispNames" value={row.name} placeholder="源氏名" autoFocus={!row.name} onChange={(e) => set((r) => { r.name = e.target.value; })} /></label>
        <label className="field" style={{ margin: 0 }}><span className="lbl">日給（保証額）</span><NumberField value={row.guarantee} placeholder={String(num(L.shop.dispatchGuarantee))} onChange={(v) => set((r) => { r.guarantee = v; })} /></label>
      </div>
      <datalist id="dispNames">{names.map((x) => <option key={x} value={x} />)}</datalist>
      <div className="hint" style={{ margin: "4px 0 10px" }}>日給 <b>{yen(p.guarantee)}</b>{row.guarantee == null ? "（設定の基本日給）" : ""}</div>
      <BackRows L={L} backs={row.backs} isDispatch onChange={(id, v) => set((r) => { r.backs[id] = v; })} />
      <div className="row2" style={{ marginTop: 11 }}>
        <label className="field" style={{ margin: 0 }}><span className="lbl">控除</span><NumberField value={row.deduct} onChange={(v) => set((r) => { r.deduct = v; })} /></label>
        <label className="field" style={{ margin: 0 }}><span className="lbl">日払い</span><NumberField value={row.paid} onChange={(v) => set((r) => { r.paid = v; })} /></label>
      </div>
    </BottomSheet>
  );
}

/* ---------- 4. 経費 ---------- */
function ExpenseStep({ d, dk, edit, t, updateWithUndo }: { d: DayRecord; dk: string; edit: Edit; t: T; updateWithUndo: (m: string, mut: (L: Ledger) => void) => void }) {
  return (
    <div className="card">
      <StepHead title="経費" note="おしぼり、酒仕入れ、送り、雑費など" />
      {d.expenses.map((e, i) => (
        <div key={e.id} className="backrow" style={{ gap: 8 }}>
          <input className="inp" style={{ flex: 1, minWidth: 0, padding: "8px 9px" }} placeholder="項目名" value={e.name} autoFocus={!e.name && !e.amount}
            onChange={(ev) => edit((dd) => { dd.expenses[i].name = ev.target.value; })} />
          <NumberField style={{ width: 104 }} value={e.amount} placeholder="金額" onChange={(v) => edit((dd) => { dd.expenses[i].amount = v; })} aria-label="金額" />
          <select className="inp" style={{ width: 76, padding: "8px 6px", fontSize: 13 }} value={e.method} aria-label="支払い方法" onChange={(ev) => edit((dd) => { dd.expenses[i].method = ev.target.value as "cash" | "card" | "bank"; })}>
            <option value="cash">現金</option><option value="card">カード</option><option value="bank">口座</option>
          </select>
          <button type="button" className="iconbtn" aria-label={`${e.name || "経費"}を削除`} onClick={() => updateWithUndo(`${e.name.trim() || "経費"} を消しました`, (LL) => { LL.days[dk]?.expenses.splice(i, 1); })}><Trash /></button>
        </div>
      ))}
      {!d.expenses.length && <div className="empty" style={{ padding: 14 }}>まだありません</div>}
      <div className="btnrow" style={{ marginTop: 10 }}><button type="button" className="btn sm" onClick={() => edit((dd) => { dd.expenses.push({ id: uid(), name: "", amount: null, method: "cash" }); })}>＋ 経費を足す</button></div>
      <div className="hint" style={{ marginTop: 8 }}>経費計 <b className="num">{yen(t.exp)}</b>（うち現金 {yen(t.expCash)}）</div>
    </div>
  );
}

/* ---------- 5. 現金・締め ---------- */
function CloseStep({ L, dk, d, edit, t, updateWithUndo }: { L: Ledger; dk: string; d: DayRecord; edit: Edit; t: T; updateWithUndo: (m: string, mut: (L: Ledger) => void) => void }) {
  const expected = cashAsOf(L, dk);
  const before = cashAsOf(L, shiftDay(dk, -1));
  const diff = d.cashCounted == null ? null : d.cashCounted - expected;
  const monthOpts = (mm: string) => { const list = [0, -1, -2].map((k) => shiftMonth(dk.slice(0, 7), k)); if (mm && !list.includes(mm)) list.push(mm); return list; };
  const names = dispatchNames(L);
  const autoAmount = (i: number) => edit((dd, LL) => {
    const row = dd.settle[i];
    if (row && row.amount == null) { const u = unpaidFor(LL, row.who, row.forMonth); if (u > 0) row.amount = Math.round(u); }
  });
  return (
    <>
      <div className="card">
        <StepHead title="現金とカードの動き" note="銀行やカード会社とのやりとり" />
        <div className="row2">
          <label className="field"><span className="lbl">銀行へ入金した額</span><NumberField value={d.bankDeposit} onChange={(v) => edit((dd) => { dd.bankDeposit = v; })} /></label>
          <label className="field"><span className="lbl">カード会社からの入金</span><NumberField value={d.cardReceived} onChange={(v) => edit((dd) => { dd.cardReceived = v; })} /></label>
        </div>
      </div>

      <div className="card">
        <h2>この日の人件費</h2><p className="sub">ここの合計がそのまま店の費用として引かれます</p>
        <div className="lrow"><div className="g"><div className="t">在籍キャスト</div><div className="s">{t.workersR}名の支給額</div></div><div className="a num">{yen(t.laborR)}</div></div>
        <div className="lrow"><div className="g"><div className="t">派遣</div><div className="s">{t.workersD}名の支給額</div></div><div className="a num">{yen(t.laborD)}</div></div>
        <label className="field" style={{ margin: "12px 0 0" }}><span className="lbl">日払い（まとめて払った分）</span><NumberField value={d.payout} onChange={(v) => edit((dd) => { dd.payout = v; })} /></label>
        <div className="hint">キャスト欄に入れていない支払いをここに。人件費に加算され、手元の現金から引かれます。</div>
        <div className="lrow total"><div className="g"><div className="t">人件費 合計</div></div><div className="a num">{yen(t.labor)}</div></div>
        <div className="lrow" style={{ borderBottom: 0 }}><div className="g"><div className="t muted" style={{ fontWeight: 400, fontSize: 13 }}>うち今日払った額</div><div className="s">キャスト欄 {jp(t.paidDetail)} ＋ まとめ {jp(t.paidLump)}{t.settled ? ` ＋ 精算 ${jp(t.settled)}` : ""}</div></div><div className="a num" style={{ fontWeight: 500 }}>{yen(t.paidCash)}</div></div>
        <div className="lrow" style={{ borderBottom: 0, paddingTop: 0 }}><div className="g"><div className="t muted" style={{ fontWeight: 400, fontSize: 13 }}>未払いとして残る額</div></div><div className="a num" style={{ fontWeight: 500 }}>{yen(t.unpaid)}</div></div>
      </div>

      <div className="card">
        <h2>給料の精算</h2><p className="sub">溜まっていた未払い給料をこの日に渡したら記録します。人件費は変わらず、手元の現金だけ減ります。</p>
        {d.settle.map((x, i) => (
          <div key={x.id} className="itemcard">
            <div className="backrow" style={{ gap: 8, border: 0, padding: 0 }}>
              <select className="inp" style={{ flex: 1, minWidth: 0, padding: "8px 6px" }} value={x.who} aria-label="誰に" onChange={(e) => { edit((dd) => { dd.settle[i].who = e.target.value; }); autoAmount(i); }}>
                <option value="">誰に</option>
                {L.casts.map((c) => <option key={c.id} value={"c:" + c.id}>{c.name || "（名前なし）"}{c.active === false ? "（退店）" : ""}</option>)}
                {names.map((nm) => <option key={"d:" + nm} value={"d:" + nm}>{nm}（派遣）</option>)}
              </select>
              <select className="inp" style={{ width: 86, flex: "none", padding: "8px 6px" }} value={x.forMonth} aria-label="何月分" onChange={(e) => { edit((dd) => { dd.settle[i].forMonth = e.target.value; }); autoAmount(i); }}>
                {monthOpts(x.forMonth).map((v) => <option key={v} value={v}>{Number(v.slice(5, 7))}月分</option>)}
              </select>
              <button type="button" className="iconbtn" aria-label="精算を削除" onClick={() => updateWithUndo(`${whoLabel(L, x.who) || "精算"} の精算を消しました`, (LL) => { LL.days[dk]?.settle.splice(i, 1); })}><Trash /></button>
            </div>
            <div className="backrow" style={{ gap: 8, border: 0, padding: "8px 0 0" }}>
              <NumberField style={{ flex: 1, minWidth: 0 }} value={x.amount} placeholder="渡した額" onChange={(v) => edit((dd) => { dd.settle[i].amount = v; })} aria-label="渡した額" />
              <span className="hint" style={{ margin: 0, flex: "none" }}>{x.who && x.forMonth ? <>残り <b className="num">{yen(unpaidFor(L, x.who, x.forMonth))}</b></> : "相手を選ぶと残額が入ります"}</span>
            </div>
          </div>
        ))}
        {!d.settle.length && <div className="empty" style={{ padding: 14 }}>この日の精算はありません</div>}
        <div className="btnrow" style={{ marginTop: 10, alignItems: "center" }}>
          <button type="button" className="btn sm" onClick={() => edit((dd) => { const dom = Number(dk.slice(8, 10)); dd.settle.push({ id: uid(), who: "", forMonth: shiftMonth(dk.slice(0, 7), dom <= 10 ? -1 : 0), amount: null }); })}>＋ 精算を足す</button>
          {t.settled > 0 && <span className="hint" style={{ margin: "0 0 0 auto" }}>精算計 <b className="num">{yen(t.settled)}</b></span>}
        </div>
      </div>

      <div className="card" id="cashcheck">
        <h2>現金の照合</h2><p className="sub">すべて入れ終えたら、金庫とレジのお金を数えて入れてください。</p>
        <div className="lrow"><div className="g"><div className="t">前の日までの残り</div></div><div className="a num">{jp(before)}</div></div>
        <div className="lrow"><div className="g"><div className="t">現金売上</div></div><div className="a num" style={{ color: "var(--good)" }}>＋{jp(t.cash)}</div></div>
        <div className="lrow"><div className="g"><div className="t">現金で払った経費</div></div><div className="a num">−{jp(t.expCash)}</div></div>
        <div className="lrow"><div className="g"><div className="t">給料で払った額</div><div className="s">キャスト欄 {jp(t.paidDetail)} ＋ まとめ {jp(t.paidLump)}{t.settled ? ` ＋ 精算 ${jp(t.settled)}` : ""}</div></div><div className="a num">−{jp(t.paidCash)}</div></div>
        <div className="lrow"><div className="g"><div className="t">銀行へ入金</div></div><div className="a num">−{jp(t.bankDeposit)}</div></div>
        <div className="lrow total"><div className="g"><div className="t">計算上の残り</div></div><div className="a num">{yen(expected)}</div></div>

        <label className="field" style={{ marginTop: 14 }}><span className="lbl">実際に数えた現金</span>
          <NumberField big value={d.cashCounted} placeholder="金庫＋レジの合計" onChange={(v) => edit((dd) => { dd.cashCounted = v; })} /></label>
        {diff == null
          ? <div className="hint">数えた額を入れると、計算と合っているか出ます。</div>
          : diff === 0
            ? <Notice title="ぴったり合っています">計算上の残りと、数えた現金が同じでした。</Notice>
            : <Notice bad={Math.abs(diff) >= 5000} title={`${diff > 0 ? "多い" : "足りない"} ${yen(Math.abs(diff))}`}>
                数えた {yen(d.cashCounted ?? 0)} と、計算上の {yen(expected)} の差です。
                {diff < 0 ? "払った額の入れ忘れがないか確かめてください。" : "売上の入れ忘れがないか確かめてください。"}
              </Notice>}
      </div>

      <div className="card">
        <h2>この日の差引</h2>
        <div className="lrow"><div className="g"><div className="t">売上</div></div><div className="a num">{yen(t.sales)}</div></div>
        <div className="lrow"><div className="g"><div className="t">人件費</div><div className="s">在籍 {t.workersR}名 ・ 派遣 {t.workersD}名{t.paidLump ? ` ・ まとめ日払い ${jp(t.paidLump)}` : ""}</div></div><div className="a num">−{yen(t.labor)}</div></div>
        <div className="lrow"><div className="g"><div className="t">経費</div></div><div className="a num">−{yen(t.exp)}</div></div>
        <div className="lrow"><div className="g"><div className="t">カード手数料</div><div className="s">{L.shop.cardFeeRate}%</div></div><div className="a num">−{yen(t.fee)}</div></div>
        <div className="lrow total"><div className="g"><div className="t">残り</div></div><div className={`a num ${t.profit < 0 ? "neg" : ""}`}>{yen(t.profit)}</div></div>
        {L.days[dk] && <div className="btnrow" style={{ marginTop: 12 }}><button type="button" className="btn sm danger" onClick={() => updateWithUndo(`${dayLabel(dk)} の記録を消しました`, (LL) => { delete LL.days[dk]; })}>この日の記録をまるごと消す</button></div>}
      </div>
    </>
  );
}
