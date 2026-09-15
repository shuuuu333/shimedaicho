/** シフト希望を出す画面（キャスト本人）。
 *
 *  いまは「来月ここ入れます」を LINE で送って、店がメモ帳に写している。
 *  写し間違いが起きるし、誰がまだ出していないかも分からなくなる。
 *
 *  ここで出したものは店の「希望」に並ぶだけで、**予定にはならない**。
 *  決めるのは店。出した日が勝手に出勤日にならないことが、本人にも分かるように書く。 */
import { useState } from "react";
import { useApp } from "../../state/store";
import { useCloud } from "../../state/cloud";
import { isWishDone, wishDays, wishesOn } from "../../domain/wishes";
import { planFor } from "../../domain/plans";
import { WD, daysInMonth, monthLabel, shiftMonth, todayISO } from "../../domain/format";
import { Seg } from "./Seg";
import type { Cast } from "../../domain/types";

export function WishCard({ me }: { me: Cast }) {
  const L = useApp((s) => s.ledger);
  const showToast = useApp((s) => s.showToast);
  const wishSet = useCloud((s) => s.wishSet);
  const wishDoneSet = useCloud((s) => s.wishDoneSet);
  const shopId = useCloud((s) => s.shopId);

  const thisMonth = todayISO().slice(0, 7);
  const nextMonth = shiftMonth(thisMonth, 1);
  /** 出すのはたいてい来月ぶん。今月の追加もあるので選べるようにしておく */
  const [month, setMonth] = useState(nextMonth);

  const days = wishDays(L, month, me.id);
  const done = isWishDone(L, me.id, month);
  const dim = daysInMonth(month);
  const lead = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).getDay();
  const today = todayISO();

  const toggle = (k: string) => {
    const on = wishesOn(L, k).some((w) => w.castId === me.id);
    void wishSet(me.id, k, !on);
    // 出し終えたあとに直したなら、出し直しとして扱う。
    // 「出し終えた」のまま中身が変わると、店から見て何が最新か分からなくなる
    if (done) void wishDoneSet(me.id, month, false);
  };

  return (
    <div className="card">
      <div className="cardhead">
        <h2>シフト希望</h2>
        {done ? <span className="pill ok">出しました</span> : days.length ? <span className="pill warn">下書き</span> : null}
      </div>

      <Seg label="いつのぶん" value={month} onChange={setMonth} wide
        items={[{ id: thisMonth, label: `${monthLabel(thisMonth)}` }, { id: nextMonth, label: `${monthLabel(nextMonth)}` }]} />

      <p className="sub">入れる日をタップしてください。押しても<b>予定にはなりません</b>。決めるのはお店です。</p>

      <div className="cal-head">{WD.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="cal-grid">
        {Array.from({ length: lead }, (_, i) => <div key={"b" + i} className="cal-cell blank" aria-hidden="true" />)}
        {Array.from({ length: dim }, (_, i) => i + 1).map((d) => {
          const k = `${month}-${String(d).padStart(2, "0")}`;
          const wished = wishesOn(L, k).some((w) => w.castId === me.id);
          const fixed = !!planFor(L, k, me.id);
          const dow = (lead + d - 1) % 7;
          return (
            <button key={k} type="button" onClick={() => toggle(k)}
              className={`cal-cell shiftcell ${dow === 0 || dow === 6 ? "wk" : ""} ${fixed ? "worked" : wished ? "planned" : ""} ${k === today ? "today" : ""}`}
              aria-pressed={wished}
              aria-label={`${Number(month.slice(5, 7))}月${d}日 ${fixed ? "お店が決めた出勤日" : wished ? "入れると出している" : "出していない"}`}>
              <span className="cd">{d}</span>
              {fixed ? <span className="cwho" aria-hidden="true">決</span> : null}
            </button>
          );
        })}
      </div>

      <div className="legend" style={{ marginTop: 10 }}>
        <span><i style={{ background: "transparent", boxShadow: "inset 0 0 0 1.5px var(--accent)" }} />入れると出した日</span>
        <span><i style={{ background: "var(--accent)" }} />お店が決めた日</span>
      </div>

      {/* 出し終えたかどうかは、店から見て「催促する相手」を決めるのに要る。
          1 日も入れない月でも、押してもらえれば「入れない」とはっきりする */}
      {done ? (
        <>
          <div className="hint" style={{ marginTop: 10 }}>
            {days.length ? `${days.length}日ぶん` : "「入れない」と"}お店に出しています。直したいときは日をタップしてください。
          </div>
          <button type="button" className="btn sm wide" style={{ marginTop: 8 }}
            onClick={() => { void wishDoneSet(me.id, month, false); showToast("下書きに戻しました"); }}>
            出し直す
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn primary wide" style={{ marginTop: 10 }}
            onClick={() => { void wishDoneSet(me.id, month, true); showToast(days.length ? `${days.length}日ぶんを出しました` : "「入れない」と出しました"); }}>
            {days.length ? `${days.length}日ぶんを出す` : "この月は入れないと出す"}
          </button>
          <div className="hint" style={{ marginTop: 6 }}>
            押すまで、お店の一覧では「まだ出していない」ままです。
          </div>
        </>
      )}

      {!shopId && (
        <div className="hint" style={{ marginTop: 8 }}>
          いまはこの端末の中だけに残っています。お店とつながると届きます。
        </div>
      )}
    </div>
  );
}
