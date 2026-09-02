import { useMemo } from "react";
import { useApp } from "../../state/store";
import { castMonth, dispatchMonth, monthTotals, owedList, payOf, settleRowsFor, whoLabel } from "../../domain/calc";
import { dayLabel, jp, monthLabel, todayISO, uid, yen } from "../../domain/format";
import { emptyDay } from "../../domain/migrate";
import { MonthBar } from "../components/MonthBar";
import { NumberField } from "../components/NumberField";
import { Trash } from "../icons";

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
      <MonthBar month={m} onChange={(mm) => setUI({ month: mm, castDetail: null })} right={<>未払い計 <b className="num">{yen(mt.unpaid)}</b></>} />
      {mt.paidLump > 0 && <div className="banner">今月は「まとめて払った日払い」が <b>{yen(mt.paidLump)}</b> あります。人件費には入っていますが、誰にいくらかは記録していないので下の表には出てきません。</div>}

      <div className="card">
        <h2>在籍キャストの給料</h2><p className="sub">支給額 ＝ 時給分 ＋ バック − 控除。名前をタップすると日別の明細が出ます。</p>
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
              const p = payOf(L, det.cast.id, sh);
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
            <button type="button" className="btn sm primary" onClick={() => settle([x])}>今日精算</button></div>
        )) : <div className="empty" style={{ padding: 14 }}>{monthLabel(m)}分の未払いはありません</div>}
        {owed.length > 1 && (
          <div className="btnrow" style={{ marginTop: 10, alignItems: "center" }}>
            <button type="button" className="btn sm" onClick={() => settle(owed)}>全員まとめて今日精算</button>
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
        <h2>在籍キャストの登録</h2><p className="sub">時給が空欄なら店の基本時給 {yen(L.shop.defaultWage)} を使います</p>
        {L.casts.length ? L.casts.map((c, i) => (
          <div key={c.id} className="backrow" style={{ gap: 8 }}>
            <input className="inp" style={{ flex: 1, minWidth: 0, padding: "8px 9px" }} placeholder="源氏名" value={c.name} autoFocus={!c.name} onChange={(e) => update((LL) => { LL.casts[i].name = e.target.value; })} />
            <NumberField style={{ width: 96 }} value={c.wage} placeholder="時給" onChange={(v) => update((LL) => { LL.casts[i].wage = v; })} aria-label="時給" />
            <button type="button" className={`btn sm ${c.active === false ? "ghost" : ""}`} onClick={() => update((LL) => { LL.casts[i].active = LL.casts[i].active === false; })}>{c.active === false ? "退店" : "在籍"}</button>
            <button type="button" className="iconbtn" aria-label={`${c.name || "キャスト"}を削除`} onClick={() => updateWithUndo(`${c.name.trim() || "キャスト"} を一覧から消しました`, (LL) => { LL.casts.splice(i, 1); })}><Trash /></button>
          </div>
        )) : <div className="empty" style={{ padding: 16 }}>まだ登録がありません</div>}
        <div className="btnrow" style={{ marginTop: 10 }}><button type="button" className="btn sm" onClick={() => update((LL) => { LL.casts.push({ id: uid(), name: "", wage: null, active: true }); })}>＋ キャストを追加</button></div>
      </div>
    </>
  );
}
