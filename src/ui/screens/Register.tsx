import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../state/store";
import { usePos } from "../../state/pos";
import { checkTotals, clock, endsAt, remainingMin, seatState, setPriceChoices } from "../../domain/pos";
import { summarize } from "../../domain/close";
import { yen } from "../../domain/format";
import { defaultPosRule } from "../../domain/migrate";
import { BottomSheet } from "../components/BottomSheet";
import { NumberField } from "../components/NumberField";
import { CheckView } from "./CheckView";

/** 分を「1:05」の形に。マイナスは超過 */
export function hhmm(min: number): string {
  const a = Math.abs(min);
  return `${min < 0 ? "＋" : ""}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}

export function Register() {
  const L = useApp((s) => s.ledger);
  const rule = L.posRule ?? defaultPosRule();
  const seats = useMemo(() => [...(L.seats ?? [])].sort((a, b) => a.sort - b.sort), [L.seats]);

  const init = usePos((s) => s.init);
  const reload = usePos((s) => s.reload);
  const checks = usePos((s) => s.checks);
  const date = usePos((s) => s.date);
  const activeId = usePos((s) => s.activeId);
  const setActive = usePos((s) => s.setActive);
  const openSeat = usePos((s) => s.openSeat);
  const reopen = usePos((s) => s.reopen);

  const [now, setNow] = useState(() => Date.now());
  const [entry, setEntry] = useState<{ seatId: string | null; name: string } | null>(null);
  const [price, setPrice] = useState(rule.setPrice);
  const openEntry = (seatId: string | null, name: string) => { setPrice(rule.setPrice); setEntry({ seatId, name }); };

  useEffect(() => { void init(); }, [init]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  // 開店・閉店の設定を変えたら営業日の判定が変わるので読み直す
  useEffect(() => { void reload(); }, [L.shop.openTime, L.shop.closeTime, reload]);

  const open = checks.filter((c) => c.status === "open");
  const closed = checks.filter((c) => c.status === "closed" && c.date === date);
  const bySeat = new Map(open.filter((c) => c.seatId).map((c) => [c.seatId as string, c]));
  const noSeat = open.filter((c) => !c.seatId);
  const sum = summarize(checks.filter((c) => c.date === date), L);

  if (activeId) return <CheckView id={activeId} />;

  return (
    <>
      <div className="tiles">
        <div className="tile"><div className="k">今日の現金</div><div className="v">{yen(sum.cash)}</div></div>
        <div className="tile"><div className="k">今日のカード</div><div className="v">{yen(sum.card)}</div></div>
        <div className="tile"><div className="k">組数 / 人数</div><div className="v">{sum.closed} / {sum.guests}</div></div>
        <div className="tile"><div className="k">取消 / 値引き</div><div className="v">{sum.voided} / {yen(sum.discount)}</div>
          <div className="n">{date}</div></div>
      </div>

      <div className="card">
        <div className="cardhead"><h2>席</h2><span className="muted">タップで入店</span></div>
        <div className="seatgrid">
          {seats.map((s) => {
            const c = bySeat.get(s.id);
            if (!c) {
              return (
                <button key={s.id} type="button" className="seat empty" onClick={() => openEntry(s.id, s.name)}>
                  <div className="seatL"><b>{s.name}</b><span>空き</span></div>
                </button>
              );
            }
            const st = seatState(c, rule, now);
            const left = remainingMin(c, rule, now);
            return (
              <button key={s.id} type="button" className={`seat busy ${st}`} onClick={() => setActive(c.id)}>
                <div className="seatL">
                  <b>{s.name}</b>
                  <span>{c.guests}名</span>
                  <em>{yen(checkTotals(c, rule).total)}</em>
                </div>
                <div className="seatR">
                  <strong>{hhmm(left)}</strong>
                  <span>{st === "over" ? "超過" : "のこり"}</span>
                  <span className="till">{clock(endsAt(c, rule))} まで</span>
                </div>
              </button>
            );
          })}
          <button type="button" className="seat empty dashed" onClick={() => openEntry(null, "席なし")}>
            <div className="seatL"><b>席なし</b><span>＋ 伝票</span></div>
          </button>
        </div>
        {seats.length === 0 && <div className="hint">設定 → 席 で席を作ってください。</div>}
      </div>

      {noSeat.length > 0 && (
        <div className="card">
          <div className="cardhead"><h2>席なしの伝票</h2></div>
          {noSeat.map((c) => (
            <button key={c.id} type="button" className="lrow" onClick={() => setActive(c.id)}>
              <div className="g"><div className="t">{c.guests}名</div><div className="s">のこり {hhmm(remainingMin(c, rule, now))}</div></div>
              <div className="a">{yen(checkTotals(c, rule).total)}</div>
            </button>
          ))}
        </div>
      )}

      <div className="card">
        <div className="cardhead"><h2>会計済み</h2><span className="muted">{closed.length} 組</span></div>
        {closed.length === 0 ? (
          <div className="empty">まだ会計はありません</div>
        ) : closed.map((c) => {
          const seat = seats.find((s) => s.id === c.seatId);
          const p = c.payments[0];
          return (
            <div key={c.id} className="lrow">
              <div className="g">
                <div className="t">{seat?.name ?? "席なし"} ・ {c.guests}名</div>
                <div className="s">{p?.method === "card" ? "カード" : "現金"}{c.received ? ` ／ お預かり ${yen(c.received)}` : ""}</div>
              </div>
              <div className="a">{yen(p?.amount ?? 0)}</div>
              <button type="button" className="btn sm" onClick={() => void reopen(c.id)}>戻す</button>
            </div>
          );
        })}
      </div>

      <BottomSheet open={!!entry} title={`${entry?.name ?? ""} に入店`} onClose={() => setEntry(null)}>
        <div className="lbl">セット料金（1名あたり）</div>
        <div className="pricerow">
          {setPriceChoices(rule).map((p) => (
            <button key={p} type="button" className="btn" aria-pressed={price === p} onClick={() => setPrice(p)}>{yen(p)}</button>
          ))}
        </div>
        <label className="field"><span className="lbl">ほかの金額</span>
          <NumberField value={price} onChange={(v) => setPrice(v ?? 0)} aria-label="セット料金" />
        </label>
        <div className="hint">
          {price > 0 ? `2名なら ${yen(price * 2)}、3名なら ${yen(price * 3)}。` : "金額を入れてください。"}
          人数を押すと入店します。
        </div>
        <div className="guestgrid">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <button key={n} type="button" className="btn" disabled={price <= 0} onClick={() => {
              const e = entry; setEntry(null); if (e) void openSeat(e.seatId, n, price);
            }}>{n}名</button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
