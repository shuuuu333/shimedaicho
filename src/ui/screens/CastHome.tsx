/** キャスト本人の画面。資産運用アプリの形を借りている。
 *
 *  狙いは「毎日開くものにする」こと。1 店に 10〜20 人いるので、その人たちの
 *  日課になれば店の文化になる。
 *
 *  守っていること
 *  - 一番大きいのは「今月かせいだ額」。次に今日の増減。その下に右肩上がりの累積
 *  - 比べるのは他人ではなく過去の自分（「先月の同じ日より +¥12,000」）。
 *    暇だった日も見えるので、これが無いと逆効果になる
 *  - ランキングは出さない。下位の子が見て辞める。夜職は入れ替わりが激しい
 *  - 「ドリンク 1本 ＋¥700」まで出す。1本いくらが見えると行動が変わる
 *
 *  数字はぜんぶ calc.ts と castStats.ts から。新しい計算は作っていない。 */
import { useMemo } from "react";
import { useApp } from "../../state/store";
import { useCloud } from "../../state/cloud";
import { castBacks, castDays, castStats } from "../../domain/castStats";
import { WD, dayLabel, jp, monthLabel, shiftMonth, todayISO, yen } from "../../domain/format";
import { MonthBar } from "../components/MonthBar";
import { CastCumChart } from "../charts";
import { WishCard } from "../components/WishCard";
import type { Cast, Ledger } from "../../domain/types";

export function CastHome({ me }: { me: Cast }) {
  const L = useApp((s) => s.ledger);
  const ui = useApp((s) => s.ui);
  const setUI = useApp((s) => s.setUI);
  const m = ui.month;
  const today = todayISO();

  const s = useMemo(() => castStats(L, me.id, m, today), [L, me.id, m, today]);
  const prev = useMemo(() => castDays(L, me.id, shiftMonth(m, -1)), [L, me.id, m]);
  const backs = useMemo(() => castBacks(L, me.id, m, s.row), [L, me.id, m, s.row]);

  const gross = s.row?.gross ?? 0;
  const paid = (s.row?.paid ?? 0) + (s.row?.settled ?? 0);
  const unpaid = s.row?.unpaid ?? 0;
  const wage = s.row?.wage ?? 0;
  const backTotal = s.row?.backTotal ?? 0;

  return (
    <>
      <MonthBar month={m} onChange={(mm) => setUI({ month: mm, calDay: null })}
        right={<>出勤<b>{s.row?.days ?? 0}日</b></>} />

      {/* 一番大きく出すのは「今月かせいだ額」。次に今日の増減 */}
      <div className="hero">
        <div className="label"><span>{me.name || "あなた"} さんが {monthLabel(m)} かせいだ</span></div>
        <div className="big num">{yen(gross)}</div>
        {s.today && (
          <div className="pill ok" style={{ marginTop: 6 }}>
            ▲ +<span className="num">{jp(s.today.gross)}</span> 今日
          </div>
        )}

        <CastCumChart month={m} days={s.days} prevDays={prev} />

        {/* 暇だった日も見えるので、過去の自分と比べられるようにしておく */}
        {prev.length > 0 && (
          <div className="hint" style={{ margin: "2px 0 0" }}>
            先月の同じ日より{" "}
            <b style={{ color: s.vsPrev >= 0 ? "var(--good)" : "var(--warn)" }}>
              {s.vsPrev >= 0 ? "+" : "−"}{jp(Math.abs(s.vsPrev))}
            </b>
            <span className="muted">（点線が先月）</span>
          </div>
        )}

        <div className="heroSplit">
          <div><div className="k">受け取り済み</div><div className="v">{yen(paid)}</div></div>
          <div><div className="k">これから入る</div>
            <div className="v" style={{ color: unpaid > 0 ? "var(--good)" : undefined }}>{yen(unpaid)}</div></div>
        </div>
        <div className="heroSplit cols3" style={{ marginTop: 10 }}>
          <div><div className="k">出勤</div><div className="v">{s.row?.days ?? 0}<span style={{ fontSize: 13 }}>日</span></div></div>
          <div><div className="k">時間</div><div className="v">{(s.row?.hours ?? 0).toFixed(1)}<span style={{ fontSize: 13 }}>h</span></div></div>
          <div><div className="k">これからの予定</div><div className="v">{s.ahead.length}<span style={{ fontSize: 13 }}>日</span></div></div>
        </div>
      </div>

      {/* 希望を出す。次のシフトのすぐ上に置く。
          「次はいつ入るか」を見に来たときが、出し忘れに気づく所でもある */}
      <WishCard me={me} />

      {/* 次のシフト。何時に行けばいいかが一番知りたいこと */}
      <div className="card">
        <h2>次のシフト</h2>
        {s.ahead.length ? s.ahead.slice(0, 4).map((d) => (
          <div key={d.date} className="lrow">
            <div className="g"><div className="t">{dayLabel(d.date)}</div>
              <div className="s">{d.date === today ? "今日" : ""}</div></div>
            <div className="a num">{d.planIn}-{d.planOut}</div>
          </div>
        )) : <div className="empty">これからの予定はまだ入っていません</div>}
      </div>

      {/* 内訳。「1本いくら」が見えると行動が変わる */}
      <div className="card">
        <h2>内訳</h2>
        <div className="lrow"><div className="g"><div className="t">時給ぶん</div>
          <div className="s">{(s.row?.hours ?? 0).toFixed(1)}時間</div></div>
          <div className="a num">{yen(wage)}</div></div>
        {backs.map((b) => (
          <div key={b.id} className="lrow">
            <div className="g"><div className="t">{b.name}</div>
              <div className="s">
                {b.isCount
                  ? `${jp(b.qty)}本${b.unit ? ` ・ 1本 +${jp(b.unit)}` : ""}`
                  : `対象 ${jp(b.qty)}`}
              </div></div>
            <div className="a num">{yen(b.amount)}</div>
          </div>
        ))}
        {s.row && s.row.deduct > 0 && (
          <div className="lrow"><div className="g"><div className="t">控除</div></div>
            <div className="a num neg">−{yen(s.row.deduct)}</div></div>
        )}
        <div className="lrow total"><div className="g"><div className="t">支給</div>
          <div className="s">時給 {jp(wage)} ＋ バック {jp(backTotal)}</div></div>
          <div className="a num">{yen(gross)}</div></div>
      </div>

      {/* 日ごとの明細。何時から何時までと、その日の額 */}
      <div className="sechead"><div className="t">日ごとの記録</div><div className="l" /><div className="n">{s.days.length}日</div></div>
      {s.days.length ? [...s.days].reverse().map((d) => (
        <div key={d.date} className="wrow" style={{ cursor: "default" }}>
          <span className="avatar">{d.day}</span>
          <span className="g">
            <span className="t">{WD[new Date(d.date + "T00:00:00").getDay()]}曜</span>
            <span className="s jp">
              {d.worked
                ? `${d.in && d.out ? `${d.in}-${d.out} ・ ` : ""}${d.hours.toFixed(1)}時間`
                : `${d.planIn}-${d.planOut} の予定`}
            </span>
          </span>
          <span className="r">
            <span className="a">{d.worked ? jp(d.gross) : "—"}</span>
            <span className="n">{d.worked ? `累計 ${jp(d.cum)}` : ""}</span>
          </span>
        </div>
      )) : <div className="card"><div className="empty">この月はまだ記録がありません</div></div>}
    </>
  );
}

/** 本人に結び付いていないときの案内。ここで詰まると何も見えないので、
 *  何をすればいいかだけを書く */
export function CastNotLinked({ L }: { L: Ledger }) {
  const shopName = L.shop.name || "お店";
  const email = useCloud((s) => s.email);
  return (
    <div className="card">
      <h2>まだ結び付いていません</h2>
      <div className="empty">
        あなたのアカウントが、{shopName} のキャストに結び付いていません<br />
        <span className="hint">
          オーナーに「設定 → 共有と安全 → クラウド同期」のメンバー欄で、
          あなたをキャストに結び付けてもらってください。
          {email ? <><br />あなたのログイン: {email}</> : null}
        </span>
      </div>
    </div>
  );
}
