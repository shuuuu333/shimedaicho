/** シフト希望を出す画面（キャスト本人）。
 *
 *  いまは「来月ここ入れます」を LINE で送って、店がメモ帳に写している。
 *  写し間違いが起きるし、誰がまだ出していないかも分からなくなる。
 *
 *  ここで出したものは店の「希望」に並ぶだけで、**予定にはならない**。
 *  決めるのは店。出した日が勝手に出勤日にならないことが、本人にも分かるように書く。
 *
 *  ■ 触りやすさを最優先にしてある
 *  キャストは毎日触るものではないし、急いでいる所で開く。
 *  ・日は押すだけ。時間は「よく使う時間」から選ぶだけ（数字は打たせない）
 *  ・時間はまとめて入る。5 日ぶんを 1 日ずつ決めさせない
 *  ・今日がどこかは、升を数えなくても分かるようにする */
import { useState } from "react";
import { useApp } from "../../state/store";
import { useCloud } from "../../state/cloud";
import { isWishDone, wishDays, wishesOn, wishOf } from "../../domain/wishes";
import { commonShifts, planFor } from "../../domain/plans";
import { WD, dayLabel, daysInMonth, monthLabel, todayISO } from "../../domain/format";
import { TimeField } from "./TimeField";
import type { Cast } from "../../domain/types";

export function WishCard({ me, month }: { me: Cast; month: string }) {
  const L = useApp((s) => s.ledger);
  const showToast = useApp((s) => s.showToast);
  const wishSet = useCloud((s) => s.wishSet);
  const wishTimes = useCloud((s) => s.wishTimes);
  const wishDoneSet = useCloud((s) => s.wishDoneSet);
  const shopId = useCloud((s) => s.shopId);

  /** 時間を直している日。"*" なら「ぜんぶまとめて」 */
  const [timeFor, setTimeFor] = useState<string | null>(null);

  const days = wishDays(L, month, me.id);
  const done = isWishDone(L, me.id, month);
  const dim = daysInMonth(month);
  const lead = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).getDay();
  const today = todayISO();
  /** その店がよく使っている時間帯。決め打ちの候補は店によって当たらない */
  const patterns = commonShifts(L, 4);

  const toggle = (k: string) => {
    const on = wishesOn(L, k).some((w) => w.castId === me.id);
    void wishSet(me.id, k, !on);
    // 出し終えたあとに直したなら、出し直しとして扱う。
    // 「出し終えた」のまま中身が変わると、店から見て何が最新か分からなくなる
    if (done) void wishDoneSet(me.id, month, false);
  };

  const setTime = (dates: readonly string[], t: { in?: string; out?: string }) => {
    if (!dates.length) return;
    void wishTimes(me.id, dates, t);
    if (done) void wishDoneSet(me.id, month, false);
    setTimeFor(null);
    showToast(dates.length > 1 ? `${dates.length}日ぶんの時間を決めました` : "時間を決めました");
  };

  /** その日の表示用の時間。空なら店の時間 */
  const timeOf = (k: string) => {
    const w = wishOf(L, k, me.id);
    return { in: w?.in || L.shop.openTime, out: w?.out || L.shop.closeTime, own: !!(w?.in || w?.out) };
  };

  return (
    <div className="card">
      <div className="cardhead">
        <h2>{monthLabel(month)} の希望</h2>
        {done ? <span className="pill ok">出しました</span> : days.length ? <span className="pill warn">下書き</span> : null}
      </div>

      <p className="sub">
        入れる日をタップしてください。押しても<b>予定にはなりません</b>。決めるのはお店です。
        {month <= today.slice(0, 7) ? <><br />来月ぶんを出すときは、<b>上の月送り</b>で月を変えてください。</> : null}
      </p>

      <div className="cal-head">{WD.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="cal-grid mycal">
        {Array.from({ length: lead }, (_, i) => <div key={"b" + i} className="cal-cell blank" aria-hidden="true" />)}
        {Array.from({ length: dim }, (_, i) => i + 1).map((d) => {
          const k = `${month}-${String(d).padStart(2, "0")}`;
          const wished = wishesOn(L, k).some((w) => w.castId === me.id);
          const fixed = !!planFor(L, k, me.id);
          const dow = (lead + d - 1) % 7;
          return (
            <button key={k} type="button" onClick={() => toggle(k)}
              className={`cal-cell shiftcell ${dow === 0 || dow === 6 ? "wk" : ""} ${fixed ? "done" : wished ? "next" : ""} ${k === today ? "today" : ""}`}
              aria-pressed={wished}
              aria-label={`${Number(month.slice(5, 7))}月${d}日 ${fixed ? "お店が決めた出勤日" : wished ? "入れると出している" : "出していない"}`}>
              <span className="cd">{d}</span>
              {fixed ? <span className="cwho" aria-hidden="true">決まり</span>
                : wished ? <span className="cwho" aria-hidden="true">{timeOf(k).in}</span> : null}
              {k === today ? <span className="cn" aria-hidden="true">今日</span> : null}
            </button>
          );
        })}
      </div>

      <div className="legend" style={{ marginTop: 10 }}>
        <span><i style={{ background: "var(--accent-soft)" }} />入れると出した日</span>
        <span><i style={{ background: "var(--accent)" }} />お店が決めた日</span>
      </div>

      {/* 出している日と、その時間。
          1 日ずつ決めさせない。ふつうは全部同じ時間なので、まとめてを先に出す */}
      {days.length > 0 && (
        <>
          <div className="sechead" style={{ marginTop: 14 }}>
            <div className="t">出している日</div><div className="l" /><div className="n">{days.length}日</div>
          </div>

          <button type="button" className="btn sm wide" onClick={() => setTimeFor(timeFor === "*" ? null : "*")}>
            {timeFor === "*" ? "閉じる" : "ぜんぶ同じ時間にする"}
          </button>
          {timeFor === "*" && <Times patterns={patterns} now={timeOf(days[0])} onPick={(t) => setTime(days, t)} />}

          {days.map((k) => {
            const t = timeOf(k);
            return (
              <div key={k}>
                <button type="button" className="lrow" onClick={() => setTimeFor(timeFor === k ? null : k)}>
                  <div className="g"><div className="t">{dayLabel(k)}</div>
                    <div className="s">{t.own ? "自分で決めた時間" : "お店の時間でいい"}</div></div>
                  <div className="a num">{t.in}-{t.out}</div>
                </button>
                {timeFor === k && <Times patterns={patterns} now={t} onPick={(tt) => setTime([k], tt)} />}
              </div>
            );
          })}
        </>
      )}

      {/* 出し終えたかどうかは、店から見て「催促する相手」を決めるのに要る。
          1 日も入れない月でも、押してもらえれば「入れない」とはっきりする */}
      {done ? (
        <>
          <div className="hint" style={{ marginTop: 12 }}>
            {days.length ? `${days.length}日ぶん` : "「入れない」と"}お店に出しています。直したいときは日をタップしてください。
          </div>
          <button type="button" className="btn sm wide" style={{ marginTop: 8 }}
            onClick={() => { void wishDoneSet(me.id, month, false); showToast("下書きに戻しました"); }}>
            出し直す
          </button>
        </>
      ) : (
        <>
          <button type="button" className="btn primary wide" style={{ marginTop: 12, minHeight: 50 }}
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

/** 時間の選び方。
 *
 *  まず押すだけで決まる候補を出す。並ぶのは、その店でよく使われている時間帯
 *  （commonShifts）。決め打ちの候補では、店によって時間帯が違うので当たらない。
 *
 *  そのうえで「何時から何時まで」を自分で決められる。
 *  「21時に上がりたい」「今日は 23 時から」は候補に無い。
 *  ここが無いと、希望を出すという言葉に中身がなくなる。 */
function Times({ patterns, now, onPick }: {
  patterns: readonly { in: string; out: string }[];
  now: { in: string; out: string };
  onPick: (t: { in?: string; out?: string }) => void;
}) {
  const [free, setFree] = useState(false);
  const [from, setFrom] = useState(now.in);
  const [to, setTo] = useState(now.out);

  if (free) {
    return (
      <div style={{ marginTop: 8, marginBottom: 8, padding: 12, borderRadius: 14, background: "var(--surface-2)" }}>
        {/* 折り返させない。「から」「まで」が行になって落ちると、何の欄か分からなくなる */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap" }}>
          <TimeField value={from} onChange={setFrom} ariaLabel="何時から" style={{ flex: 1, minWidth: 0 }} />
          <span className="muted" style={{ flex: "none" }}>から</span>
          <TimeField value={to} onChange={setTo} ariaLabel="何時まで" style={{ flex: 1, minWidth: 0 }} />
          <span className="muted" style={{ flex: "none" }}>まで</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" className="btn primary" style={{ flex: 1 }} disabled={!from || !to}
            onClick={() => onPick({ in: from, out: to })}>この時間にする</button>
          <button type="button" className="btn ghost" onClick={() => setFree(false)}>やめる</button>
        </div>
      </div>
    );
  }

  return (
    <div className="chipgrid" style={{ marginTop: 8, marginBottom: 8 }}>
      {patterns.map((p) => (
        <button key={`${p.in}-${p.out}`} type="button" className="cchip" onClick={() => onPick({ in: p.in, out: p.out })}>
          {p.in}-{p.out}
        </button>
      ))}
      <button type="button" className="cchip" onClick={() => onPick({})}>お店の時間でいい</button>
      <button type="button" className="cchip add" onClick={() => setFree(true)}>じぶんで決める</button>
    </div>
  );
}
