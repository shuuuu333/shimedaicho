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
import { useMemo, useState } from "react";
import { useApp } from "../../state/store";
import { useCloud } from "../../state/cloud";
import { castBacks, castDays, castStats } from "../../domain/castStats";
import { myDayState, planTimes } from "../../domain/plans";
import { wishesOn } from "../../domain/wishes";
import { payOf } from "../../domain/calc";
import { WD, dayLabel, daysInMonth, jp, monthLabel, shiftMonth, todayISO, untilLabel, yen } from "../../domain/format";
import { MonthBar } from "../components/MonthBar";
import { CastCumChart } from "../charts";
import { WishCard } from "../components/WishCard";
import { useSwipe } from "../useSwipe";
import { useMonthSlide } from "../useMonthSlide";
import { TimeStep } from "../components/TimeStep";
import type { Cast, Ledger } from "../../domain/types";

export function CastPay({ me }: { me: Cast }) {
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

/** キャスト手帳の「シフト」。いつ入るかと、希望を出す所。
 *
 *  給料と分けてある。見に来る理由が違うから。
 *  給料は「いくらになったか」、シフトは「次はいつ行くのか」。
 *  1 枚にすると、次の出勤を見るたびに金額まで開くことになる。 */
export function CastShift({ me }: { me: Cast }) {
  const L = useApp((s) => s.ledger);
  const ui = useApp((s) => s.ui);
  const setUI = useApp((s) => s.setUI);
  const m = ui.month;
  const today = todayISO();
  const s = useMemo(() => castStats(L, me.id, m, today), [L, me.id, m, today]);

  /** 開いている日。はじめは今日（今月を見ているとき） */
  const [sel, setSel] = useState<string | null>(null);
  const open = sel && sel.startsWith(m) ? sel : (m === today.slice(0, 7) ? today : null);

  const dim = daysInMonth(m);
  const lead = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1).getDay();
  const swipe = useSwipe({ stop: true, onCommit: (dir) => { setUI({ month: shiftMonth(m, dir), calDay: null }); setSel(null); } });
  const slide = useMonthSlide(m);

  return (
    <>
      <MonthBar month={m} onChange={(mm) => { setUI({ month: mm, calDay: null }); setSel(null); }}
        right={<>予定<b>{s.ahead.length}日</b></>} />

      <div className="card">
        <div className="cardhead">
          <h2>{monthLabel(m)} のシフト</h2>
          <span className="pill">{s.row?.days ?? 0}日</span>
        </div>
        <div className="cal-head">{WD.map((w) => <span key={w}>{w}</span>)}</div>
        {/* 払って前後の月へ。上の月送りまで指を伸ばさなくていい */}
        <div className={`cal-grid mycal ${slide.className}`} key={slide.key} {...swipe.bind}>
          {Array.from({ length: lead }, (_, i) => <div key={"b" + i} className="cal-cell blank" aria-hidden="true" />)}
          {Array.from({ length: dim }, (_, i) => i + 1).map((d) => {
            const k = `${m}-${String(d).padStart(2, "0")}`;
            const st = myDayState(L, me.id, k, today);
            const dow = (lead + d - 1) % 7;
            return (
              <button key={k} type="button" onClick={() => setSel(open === k ? null : k)}
                className={`cal-cell shiftcell ${dow === 0 || dow === 6 ? "wk" : ""} ${st.kind} ${k === today ? "today" : ""} ${open === k ? "sel" : ""}`}
                aria-pressed={open === k}
                aria-label={`${Number(m.slice(5, 7))}月${d}日 ${st.kind === "done" ? "入りました" : st.kind === "next" ? `入ります ${st.from}から` : st.kind === "wish" ? `入れると出している ${st.from}から` : "予定なし"}`}>
                <span className="cd">{d}</span>
                {/* 何時からかは、開かなくても読めるようにしておく。
                    タップして初めて分かるのでは、月を見渡せない */}
                {st.from ? <span className="cwho" aria-hidden="true">{st.from}</span> : null}
                {k === today ? <span className="cn" aria-hidden="true">今日</span> : null}
              </button>
            );
          })}
        </div>
        <div className="legend" style={{ marginTop: 10 }}>
          <span><i style={{ background: "var(--accent)" }} />入りました</span>
          <span><i style={{ background: "var(--accent-soft)" }} />入ります</span>
          <span><i style={{ background: "var(--surface-3)" }} />出しています</span>
        </div>
      </div>

      {open && <DayCard L={L} me={me} date={open} today={today} />}

      {/* 次のシフト。何時に行けばいいかが一番知りたいこと。
          いちばん近い 1 日だけを大きく出す。行が並んでいるだけだと、
          「次はいつか」を自分で読み取ることになる */}
      <div className="card">
        <h2>次のシフト</h2>
        {s.ahead.length ? (
          <>
            <button type="button" className="nextshift" onClick={() => setSel(s.ahead[0].date)}>
              <span className="when">{untilLabel(s.ahead[0].date, today) || "つぎ"}</span>
              <span className="d">{dayLabel(s.ahead[0].date)}</span>
              <span className="t num">{s.ahead[0].planIn}<i> から</i></span>
            </button>
            {s.ahead.slice(1, 4).map((d) => (
              <button key={d.date} type="button" className="lrow" onClick={() => setSel(d.date)}>
                <div className="g"><div className="t">{dayLabel(d.date)}</div>
                  <div className="s">{untilLabel(d.date, today)}</div></div>
                <div className="a num">{d.planIn}-{d.planOut}</div>
              </button>
            ))}
          </>
        ) : <div className="empty">これからの予定はまだ入っていません</div>}
      </div>

      {/* 希望はいちばん下。上の 2 つ（いつ入るか）を見てから出す順になる */}
      <WishCard me={me} month={m} onMonth={(mm) => setUI({ month: mm, calDay: null })} />
    </>
  );
}

/** 開いた日の中身。何時から何時までと、入ったぶんの額 */
function DayCard({ L, me, date, today }: { L: Ledger; me: Cast; date: string; today: string }) {
  const sh = L.days[date]?.shifts?.[me.id];
  const worked = !!sh?.on;
  const plan = planTimes(L, date, me.id);
  const w = wishesOn(L, date).find((x) => x.castId === me.id);
  const wished = !!w && !w.kind;
  const wishTime = w ? `${w.in || L.shop.openTime}-${w.out || L.shop.closeTime}` : "";
  const past = date < today;
  const p = worked && sh ? payOf(L, me.id, sh, date) : null;
  /** 出している変更のお願い（あれば） */
  const req = w && (w.kind === "change" || w.kind === "off")
    ? { kind: w.kind, in: w.in, out: w.out } : null;

  return (
    <div className="card">
      <div className="cardhead">
        <h2>{dayLabel(date)}</h2>
        {date === today ? <span className="pill">今日</span> : null}
      </div>

      {worked && sh ? (
        <>
          <div className="lrow"><div className="g">
            <div className="t">{past ? "入りました" : "入っています"}</div>
            <div className="s">{sh.in && sh.out ? `${sh.in}-${sh.out}` : "時刻は記録されていません"}</div>
          </div><div className="a num">{p ? `${p.hours.toFixed(1)}時間` : ""}</div></div>
          {p && <div className="lrow total"><div className="g"><div className="t">この日のぶん</div></div>
            <div className="a num">{yen(p.gross)}</div></div>}
        </>
      ) : plan ? (
        <div className="lrow"><div className="g">
          <div className="t">{past ? "入る予定でした" : "入ります"}</div>
          <div className="s">{past ? "お店の記録がまだです" : "この時間で決まっています"}</div>
        </div><div className="a num">{plan.in}-{plan.out}</div></div>
      ) : wished ? (
        <div className="lrow"><div className="g">
          <div className="t">入れますと出しています</div>
          <div className="s">お店が決めるのを待っています</div>
        </div><div className="a num">{wishTime}</div></div>
      ) : (
        <div className="empty">この日は入っていません</div>
      )}

      {/* 決まった日を変えたいときの道。
          いままでは画面の中に無く、LINE に戻るしかなかった。
          過ぎた日には出さない（直すのは日報の仕事で、締めと食い違う）。
          決まっていない日にも出さない（そこは「希望」で足りる） */}
      {plan && !past && <RequestBox me={me} date={date} plan={plan} req={req} />}
    </div>
  );
}

/** 決まったシフトの変更をお願いする所。
 *
 *  決めるのは店のまま。ここから出るのは「お願い」で、予定は動かない。
 *  出したあとに何が起きるかまで書く。出して終わりだと、返事が来るのか
 *  分からないまま LINE でもう一度聞くことになる。 */
function RequestBox({ me, date, plan, req }: {
  me: Cast; date: string; plan: { in: string; out: string };
  req: { kind: "change" | "off"; in?: string; out?: string } | null;
}) {
  const requestChange = useCloud((s) => s.requestChange);
  const showToast = useApp((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(plan.in);
  const [to, setTo] = useState(plan.out);

  if (req) {
    return (
      <>
        <div className="lrow"><div className="g">
          <div className="t">{req.kind === "off" ? "「休みたい」と出しています" : "「時間を変えたい」と出しています"}</div>
          <div className="s">お店の返事を待っています</div>
        </div><div className="a num">{req.kind === "off" ? "休み" : `${req.in || plan.in}-${req.out || plan.out}`}</div></div>
        <button type="button" className="btn sm wide" style={{ marginTop: 8 }}
          onClick={() => { void requestChange(me.id, date, null); showToast("お願いを取り下げました"); }}>
          お願いを取り下げる
        </button>
      </>
    );
  }

  if (open) {
    return (
      <div className="timebox">
        <TimeStep label="入り" value={from} onChange={setFrom} />
        <TimeStep label="上がり" value={to} onChange={setTo} />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button type="button" className="btn primary" style={{ flex: 1 }}
            disabled={from === plan.in && to === plan.out}
            onClick={() => { void requestChange(me.id, date, "change", { in: from, out: to }); setOpen(false); showToast("お願いを出しました"); }}>
            {from}-{to} でお願いする
          </button>
          <button type="button" className="btn ghost" onClick={() => setOpen(false)}>やめる</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <button type="button" className="btn" style={{ flex: 1 }} onClick={() => setOpen(true)}>時間を変えたい</button>
      <button type="button" className="btn" style={{ flex: 1 }}
        onClick={() => { void requestChange(me.id, date, "off"); showToast("「休みたい」と出しました"); }}>
        この日は休みたい
      </button>
    </div>
  );
}

/** 本人を決める。
 *
 *  ふつうは「ログインしている人に結び付いているキャスト」。
 *  それが無いときに 2 つだけ助ける。
 *
 *  ・お店とつながっていないとき（お試しデータを入れた直後）… 端末の最初の子
 *  ・店の人がキャスト手帳を開いたとき … どの子として見るかを選べる
 *
 *  2 つめが要るのは、**同じ端末・同じアカウントでは役割を 2 つ持てない**から。
 *  1 台でためすには、店の人が「この子として見る」しかない。 */
export function useCastMe(): Cast | null {
  const L = useApp((s) => s.ledger);
  const asCast = useApp((s) => s.ui.asCast);
  const myCastId = useCloud((s) => s.myCastId());
  const shopId = useCloud((s) => s.shopId);
  return useMemo(() => {
    const find = (id: string | null) => (id ? L.casts.find((c) => c.id === id) ?? null : null);
    return find(myCastId) ?? find(asCast) ?? (!shopId && L.casts.length ? L.casts[0] : null);
  }, [L.casts, myCastId, asCast, shopId]);
}

/** 本人が決まっていないときの画面。店の人には選ばせる */
function CastGate() {
  const L = useApp((s) => s.ledger);
  const setUI = useApp((s) => s.setUI);
  const canPick = useCloud((s) => s.isOwner()) || useCloud((s) => s.me?.role) === "staff";
  const active = L.casts.filter((c) => c.active !== false);

  if (!canPick || !active.length) return <CastNotLinked L={L} />;
  return (
    <div className="card">
      <h2>どの子として見ますか</h2>
      <p className="sub">
        あなたは<b>お店の人</b>としてログインしています。
        1 台でためすために、キャストの画面をそのまま見られます。
      </p>
      <div className="chipgrid">
        {active.map((c) => (
          <button key={c.id} type="button" className="cchip" onClick={() => setUI({ asCast: c.id })}>
            {c.name || "（名前なし）"}
          </button>
        ))}
      </div>
      <div className="hint" style={{ marginTop: 10 }}>
        ここで出した希望は、その子が出したものとして店の一覧に並びます。
      </div>
    </div>
  );
}

/** 店の人が「この子として」見ているときの帯。
 *  本人の画面と見分けが付かないと、自分の給料だと思い込む */
function AsCastBar({ me }: { me: Cast }) {
  const asCast = useApp((s) => s.ui.asCast);
  const setUI = useApp((s) => s.setUI);
  if (!asCast) return null;
  return (
    <div className="card" style={{ paddingTop: 12, paddingBottom: 12 }}>
      <div className="lrow" style={{ padding: 0 }}>
        <div className="g"><div className="t">{me.name} さんとして見ています</div>
          <div className="s">お店の人としてログインしています</div></div>
        <button type="button" className="btn sm" onClick={() => setUI({ asCast: null })}>やめる</button>
      </div>
    </div>
  );
}

/** タブの「給料」 */
export function CastPayScreen() {
  const me = useCastMe();
  const m = useApp((s) => s.ui.month);
  const setUI = useApp((s) => s.setUI);
  if (!me) return (<><MonthBar month={m} onChange={(mm) => setUI({ month: mm, calDay: null })} /><CastGate /></>);
  return (<><AsCastBar me={me} /><CastPay me={me} /></>);
}

/** タブの「シフト」 */
export function CastShiftScreen() {
  const me = useCastMe();
  const m = useApp((s) => s.ui.month);
  const setUI = useApp((s) => s.setUI);
  if (!me) return (<><MonthBar month={m} onChange={(mm) => setUI({ month: mm, calDay: null })} /><CastGate /></>);
  return (<><AsCastBar me={me} /><CastShift me={me} /></>);
}
