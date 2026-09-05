import { useMemo, useState } from "react";
import { useApp } from "../../state/store";
import { castMonth, castWageAt, dispatchMonth, monthTotals, owedList, payOf, settleRowsFor, wageTimeline, whoLabel } from "../../domain/calc";
import { dayLabel, jp, monthLabel, shiftMonth, todayISO, uid, yen } from "../../domain/format";
import { emptyDay } from "../../domain/migrate";
import { MonthBar } from "../components/MonthBar";
import { NumberField } from "../components/NumberField";
import { Notice } from "../components/Notice";
import { BottomSheet } from "../components/BottomSheet";
import type { Cast } from "../../domain/types";
import { ChevRight, Trash } from "../icons";

export function Casts() {
  const L = useApp((s) => s.ledger);
  const ui = useApp((s) => s.ui);
  const setUI = useApp((s) => s.setUI);
  const update = useApp((s) => s.update);
  const updateWithUndo = useApp((s) => s.updateWithUndo);
  const showToast = useApp((s) => s.showToast);
  const openDay = useApp((s) => s.openDay);
  const m = ui.month;

  const rows = useMemo(() => castMonth(L, m), [L, m]);
  const drows = useMemo(() => dispatchMonth(L, m), [L, m]);
  const mt = useMemo(() => monthTotals(L, m), [L, m]);
  const owed = useMemo(() => owedList(L, m), [L, m]);
  const det = ui.castDetail ? rows.find((r) => r.cast.id === ui.castDetail) : null;
  const [wageFor, setWageFor] = useState<string | null>(null);
  const wageCast = wageFor ? L.casts.find((c) => c.id === wageFor) ?? null : null;

  const settle = (list: { who: string; unpaid: number }[]) => {
    const dk = todayISO();
    const added = list.filter((x) => x.unpaid > 0).map((x) => ({ id: uid(), who: x.who, forMonth: m, amount: Math.round(x.unpaid) }));
    if (!added.length) { showToast("精算する未払いはありません"); return; }
    const sum = added.reduce((s, r) => s + r.amount, 0);
    updateWithUndo(`${added.length === 1 ? whoLabel(L, added[0].who) : added.length + "名"} に ${yen(sum)} を精算（今日の日報に記録）`, (LL) => {
      if (!LL.days[dk]) LL.days[dk] = emptyDay();
      LL.days[dk].settle.push(...added);
    });
  };
  const toggleDetail = (id: string) => {
    setUI({ castDetail: ui.castDetail === id ? null : id });
    requestAnimationFrame(() => document.getElementById("castDetail")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };

  return (
    <>
      <MonthBar month={m} onChange={(mm) => setUI({ month: mm, castDetail: null })} right={<>未払い計<b>{yen(mt.unpaid)}</b></>} />
      {mt.paidLump > 0 && (
        <Notice title={`まとめて払った日払い ${yen(mt.paidLump)}`}>
          人件費には入っていますが、誰にいくら渡したかを記録していないので、下の表には出てきません。
        </Notice>
      )}

      <div className="sechead" style={{ marginTop: 0 }}>
        <div className="t">キャスト別の給料</div><div className="l" />
        <div className="n">{rows.length}名 · {rows.reduce((s, r) => s + r.days, 0)}日</div>
      </div>
      {rows.map((r) => (
        <button key={r.cast.id} type="button" className="wrow" aria-expanded={ui.castDetail === r.cast.id} onClick={() => toggleDetail(r.cast.id)}>
          <span className="avatar">{(r.cast.name || "?").slice(0, 1)}</span>
          <span className="g">
            <span className="t">{r.cast.name || "（名前なし）"}</span>
            <span className="s">{r.days}日 · {r.hours.toFixed(1)}時間</span>
          </span>
          <span className="r">
            <span className="a">{jp(r.gross)}</span>
            <span className={`n ${r.unpaid > 0 ? "due" : "ok"}`}>{r.unpaid > 0 ? `未払い ${jp(r.unpaid)}` : "支払い済み"}</span>
          </span>
          <ChevRight size={15} className="chevi" />
        </button>
      ))}
      {!rows.length && <div className="card"><div className="empty">この月の出勤記録がまだありません</div></div>}

      <div className="card" style={{ display: "none" }}>
        <h2>在籍キャストの給料</h2><p className="sub">支給額 ＝ 時給分 ＋ バック − 控除</p>
        {rows.length ? (
          <div className="tw"><table>
            <thead><tr><th>キャスト</th><th>日数</th><th>時間</th><th>時給分</th><th>バック</th><th>支給</th><th>日払い</th><th>精算</th><th>未払い</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.cast.id} className="tr-link" tabIndex={0} aria-expanded={ui.castDetail === r.cast.id} onClick={() => toggleDetail(r.cast.id)} onKeyDown={(e) => { if (e.key === "Enter") toggleDetail(r.cast.id); }}>
                <td>{r.cast.name} <span className="muted">›</span></td><td className="n">{r.days}</td><td className="n">{r.hours.toFixed(1)}</td>
                <td className="n">{jp(r.wage)}</td><td className="n">{jp(r.backTotal)}</td>
                <td className="n"><b>{jp(r.gross)}</b></td><td className="n">{r.paid ? jp(r.paid) : "—"}</td><td className="n">{r.settled ? jp(r.settled) : "—"}</td>
                <td className="n" style={r.unpaid > 0 ? { fontWeight: 700 } : undefined}>{jp(r.unpaid)}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td>合計</td><td className="n">{rows.reduce((s, r) => s + r.days, 0)}</td><td className="n">{rows.reduce((s, r) => s + r.hours, 0).toFixed(1)}</td>
              <td className="n">{jp(rows.reduce((s, r) => s + r.wage, 0))}</td><td className="n">{jp(rows.reduce((s, r) => s + r.backTotal, 0))}</td>
              <td className="n">{jp(rows.reduce((s, r) => s + r.gross, 0))}</td><td className="n">{jp(rows.reduce((s, r) => s + r.paid, 0))}</td><td className="n">{jp(rows.reduce((s, r) => s + r.settled, 0))}</td><td className="n">{jp(rows.reduce((s, r) => s + r.unpaid, 0))}</td></tr></tfoot>
          </table></div>
        ) : <div className="empty">この月の出勤記録がまだありません</div>}
      </div>

      {det && (
        <div className="card" id="castDetail">
          <div className="cardhead"><h2>{det.cast.name} の明細（{monthLabel(m)}）</h2><button type="button" className="btn sm ghost" onClick={() => setUI({ castDetail: null })}>閉じる</button></div>
          <p className="sub" style={{ margin: "0 0 10px" }}>行をタップするとその日の日報が開きます</p>
          <div className="tw"><table>
            <thead><tr><th>日</th><th>時間</th><th>時給分</th><th>バック</th><th>控除</th><th>支給</th><th>日払い</th></tr></thead>
            <tbody>{Object.keys(L.days).sort().filter((k) => k.startsWith(m)).map((k) => {
              const sh = L.days[k].shifts?.[det.cast.id];
              if (!sh?.on) return null;
              const p = payOf(L, det.cast.id, sh, k);
              return (
                <tr key={k} className="tr-link" tabIndex={0} onClick={() => openDay(k, 1)}>
                  <td>{dayLabel(k)}</td><td className="n">{p.hours.toFixed(1)}</td><td className="n">{jp(p.wage)}</td><td className="n">{p.backTotal ? jp(p.backTotal) : "—"}</td><td className="n">{p.deduct ? jp(p.deduct) : "—"}</td><td className="n"><b>{jp(p.gross)}</b></td><td className="n">{p.paid ? jp(p.paid) : "—"}</td>
                </tr>
              );
            })}</tbody>
            <tfoot><tr><td>合計</td><td className="n">{det.hours.toFixed(1)}</td><td className="n">{jp(det.wage)}</td><td className="n">{jp(det.backTotal)}</td><td className="n">{jp(det.deduct)}</td><td className="n">{jp(det.gross)}</td><td className="n">{jp(det.paid)}</td></tr></tfoot>
          </table></div>
          {settleRowsFor(L, m, "c:" + det.cast.id).map((x) => (
            <div key={x.id} className="lrow"><div className="g"><div className="t">精算</div><div className="s">{dayLabel(x.date)} に支払い</div></div><div className="a num">−{yen(x.amount ?? 0)}</div></div>
          ))}
          <div className="lrow total"><div className="g"><div className="t">未払い残</div><div className="s">支給 {jp(det.gross)} − 日払い {jp(det.paid)} − 精算 {jp(det.settled)}</div></div><div className="a num">{yen(det.unpaid)}</div></div>
        </div>
      )}

      <div className="card">
        <h2>未払いの精算</h2><p className="sub">{monthLabel(m)}分。渡したら「今日精算」を押すと今日の日報に記録され、手元の現金からも引かれます。</p>
        {owed.length ? owed.map((x) => (
          <div key={x.who} className="owe"><div className="g"><div className="t">{x.name}</div></div><span className="a">{yen(x.unpaid)}</span>
            <button type="button" className="btn sm primary" onClick={() => settle([x])}>渡した</button></div>
        )) : <div className="empty" style={{ padding: 14 }}>{monthLabel(m)}分の未払いはありません</div>}
        {owed.length > 1 && (
          <div className="btnrow" style={{ marginTop: 10, alignItems: "center" }}>
            <button type="button" className="btn sm" onClick={() => settle(owed)}>全員分をまとめて渡した</button>
            <span className="hint" style={{ margin: "0 0 0 auto" }}>合計 <b className="num">{yen(owed.reduce((s, x) => s + x.unpaid, 0))}</b></span>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="card"><h2>バックの内訳</h2><p className="sub">どの項目で稼いでいるか</p>
          <div className="tw"><table>
            <thead><tr><th>キャスト</th>{L.backItems.map((b) => <th key={b.id}>{b.name.replace("バック", "")}</th>)}</tr></thead>
            <tbody>{rows.map((r) => <tr key={r.cast.id}><td>{r.cast.name}</td>{L.backItems.map((b) => <td key={b.id} className="n">{r.backs[b.id] ? jp(r.backs[b.id]) : "—"}</td>)}</tr>)}</tbody>
          </table></div>
        </div>
      )}

      <div className="card">
        <h2>派遣の給料</h2><p className="sub">支給額 ＝ 日給（保証額）＋ 派遣単価のバック − 控除</p>
        {drows.length ? (
          <div className="tw"><table>
            <thead><tr><th>名前</th><th>日数</th><th>日給計</th><th>バック</th><th>支給</th><th>日払い</th><th>精算</th><th>未払い</th></tr></thead>
            <tbody>{drows.map((r) => (
              <tr key={r.name}><td>{r.name}</td><td className="n">{r.days}</td><td className="n">{jp(r.guarantee)}</td><td className="n">{jp(r.backTotal)}</td><td className="n"><b>{jp(r.gross)}</b></td><td className="n">{r.paid ? jp(r.paid) : "—"}</td><td className="n">{r.settled ? jp(r.settled) : "—"}</td><td className="n" style={r.unpaid > 0 ? { fontWeight: 700 } : undefined}>{jp(r.unpaid)}</td></tr>
            ))}</tbody>
            <tfoot><tr><td>合計</td><td className="n">{drows.reduce((s, r) => s + r.days, 0)}</td><td className="n">{jp(drows.reduce((s, r) => s + r.guarantee, 0))}</td><td className="n">{jp(drows.reduce((s, r) => s + r.backTotal, 0))}</td><td className="n">{jp(drows.reduce((s, r) => s + r.gross, 0))}</td><td className="n">{jp(drows.reduce((s, r) => s + r.paid, 0))}</td><td className="n">{jp(drows.reduce((s, r) => s + r.settled, 0))}</td><td className="n">{jp(drows.reduce((s, r) => s + r.unpaid, 0))}</td></tr></tfoot>
          </table></div>
        ) : <div className="empty">この月の派遣の記録はまだありません</div>}
        <div className="hint" style={{ marginTop: 10 }}>派遣は日報の「派遣」ステップで名前を入れて記録します。同じ名前は自動でまとまります。</div>
      </div>

      <div className="card" id="castList">
        <h2>在籍キャストの登録</h2><p className="sub">時給が空欄なら店の基本時給 {yen(L.shop.defaultWage)} を使います。時給をタップすると月ごとに変えられます。</p>
        {L.casts.length ? L.casts.map((c, i) => (
          <div key={c.id} className="backrow" style={{ gap: 8 }}>
            <input className="inp" style={{ flex: 1, minWidth: 0, padding: "8px 9px" }} placeholder="源氏名" value={c.name} autoFocus={!c.name} onChange={(e) => update((LL) => { LL.casts[i].name = e.target.value; })} />
            <button type="button" className="btn sm" style={{ minWidth: 104, justifyContent: "space-between" }}
              aria-label={`${c.name || "キャスト"}の時給を変える`} onClick={() => setWageFor(c.id)}>
              <span className="num" style={{ fontWeight: 600, color: "var(--ink)" }}>{jp(castWageAt(c, L.shop, m))}</span>
              <span style={{ fontSize: 10.5, color: "var(--ink-3)" }}>
                {(() => {
                  const w = [...(c.wages ?? [])].sort((a, b) => a.from.localeCompare(b.from));
                  const cur = [...w].reverse().find((x) => x.from <= m);
                  return cur ? `${Number(cur.from.slice(5, 7))}月〜` : "時給";
                })()}
              </span>
            </button>
            <button type="button" className={`btn sm ${c.active === false ? "ghost" : ""}`} onClick={() => update((LL) => { LL.casts[i].active = LL.casts[i].active === false; })}>{c.active === false ? "退店" : "在籍"}</button>
            <button type="button" className="iconbtn" aria-label={`${c.name || "キャスト"}を削除`} onClick={() => updateWithUndo(`${c.name.trim() || "キャスト"} を一覧から消しました`, (LL) => { LL.casts.splice(i, 1); })}><Trash /></button>
          </div>
        )) : <div className="empty" style={{ padding: 16 }}>まだ登録がありません</div>}
        <div className="btnrow" style={{ marginTop: 10 }}><button type="button" className="btn sm" onClick={() => update((LL) => { LL.casts.push({ id: uid(), name: "", wage: null, active: true }); })}>＋ キャストを追加</button></div>
        <div className="hint" style={{ marginTop: 10 }}>時給をタップすると、いつから いくらに変えるかを決められます。過去の月は当時の時給のまま計算されます。</div>
      </div>

      {wageCast && <WageSheet cast={wageCast} month={m} onClose={() => setWageFor(null)} />}
    </>
  );
}

/** 時給の履歴を編集するシート */
function WageSheet({ cast, month, onClose }: { cast: Cast; month: string; onClose: () => void }) {
  const L = useApp((s) => s.ledger);
  const update = useApp((s) => s.update);
  const idx = L.casts.findIndex((c) => c.id === cast.id);
  const timeline = wageTimeline(cast, L.shop);
  const list = [...(cast.wages ?? [])].sort((a, b) => a.from.localeCompare(b.from));
  const monthOpts = (() => {
    const set = new Set<string>(list.map((w) => w.from));
    for (let i = -11; i <= 3; i++) set.add(shiftMonth(month, i));
    return [...set].sort();
  })();
  const addFrom = list.some((w) => w.from === month) ? shiftMonth(month, 1) : month;

  return (
    <BottomSheet open title={`${cast.name || "（名前なし）"} の時給`} onClose={onClose}
      footer={<span className="sum">{monthLabel(month)}の時給<b>{yen(castWageAt(cast, L.shop, month))}</b></span>}>
      <p className="hint" style={{ margin: "0 0 12px" }}>変更した月から、次の変更までその時給になります。過去の月の給料は動きません。</p>

      <div className="backrow">
        <div><div className="bn">最初から</div><div className="br">変更するまでずっとこの時給</div></div>
        <div className="ctl">
          <NumberField style={{ width: 116 }} value={cast.wage} placeholder={String(L.shop.defaultWage)}
            aria-label="最初の時給" onChange={(v) => update((LL) => { LL.casts[idx].wage = v; })} />
        </div>
      </div>

      {list.map((w, i) => (
        <div key={w.from + i} className="backrow">
          <div>
            <div className="bn">
              <select className="inp" style={{ width: 108, padding: "8px 6px", fontSize: 13, minHeight: 38 }} value={w.from} aria-label="いつから"
                onChange={(e) => update((LL) => {
                  const ws = LL.casts[idx].wages;
                  if (ws) { ws[i] = { ...ws[i], from: e.target.value }; ws.sort((a, b) => a.from.localeCompare(b.from)); }
                })}>
                {monthOpts.map((v) => <option key={v} value={v}>{v.slice(0, 4)}年{Number(v.slice(5, 7))}月</option>)}
              </select>
            </div>
            <div className="br">から</div>
          </div>
          <div className="ctl">
            <NumberField style={{ width: 116 }} value={w.wage} placeholder={String(L.shop.defaultWage)} aria-label="時給"
              onChange={(v) => update((LL) => { const ws = LL.casts[idx].wages; if (ws) ws[i].wage = v; })} />
            <button type="button" className="iconbtn" aria-label="この変更を消す"
              onClick={() => update((LL) => {
                const ws = LL.casts[idx].wages;
                if (!ws) return;
                ws.splice(i, 1);
                if (!ws.length) delete LL.casts[idx].wages;
              })}><Trash /></button>
          </div>
        </div>
      ))}

      <div className="btnrow" style={{ marginTop: 12 }}>
        <button type="button" className="btn sm" onClick={() => update((LL) => {
          const c = LL.casts[idx];
          if (!c.wages) c.wages = [];
          c.wages.push({ from: addFrom, wage: castWageAt(cast, LL.shop, addFrom) });
          c.wages.sort((a, b) => a.from.localeCompare(b.from));
        })}>＋ 時給の変更を足す</button>
      </div>

      <div className="sec">
        <div className="sechead" style={{ marginTop: 4 }}><div className="t">いまの決まり</div><div className="l" /></div>
        {timeline.map((t, i) => (
          <div key={i} className="lrow">
            <div className="g"><div className="t">{t.label}</div>
              <div className="s">{i + 1 < timeline.length ? `${timeline[i + 1].label.replace("から", "")}の前まで` : "いまも"}</div></div>
            <div className="a num">{yen(t.wage)}</div>
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}
