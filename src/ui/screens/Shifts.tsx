/** シフト。予定（オーナーが入れる）と実績（日報の出勤）を同じカレンダーで見せる。
 *  キャストとしてログインしている人には、自分のぶんだけ出す。 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../state/store";
import { useCloud } from "../../state/cloud";
import { payOf } from "../../domain/calc";
import type { Ledger } from "../../domain/types";
import { commonShifts, lateLabel, lateMinutes, planFor, planTimes, plannedIds, spanLabel, spanMinutes, whoOn } from "../../domain/plans";
import { applyWishes, diffTotal, pendingCasts, planDiff, toggleWish, wishRows, wishesOn } from "../../domain/wishes";
import { Seg } from "../components/Seg";
import { WD, addMinutes, dayLabel, daysInMonth, jp, monthLabel, shiftDay, todayISO, uid, yen } from "../../domain/format";
import { MonthBar } from "../components/MonthBar";
import { TimeField } from "../components/TimeField";
import { ChevDown, ChevRight } from "../icons";
import { CastHome, CastNotLinked } from "./CastHome";

export function Shifts() {
  const L = useApp((s) => s.ledger);
  const ui = useApp((s) => s.ui);
  const setUI = useApp((s) => s.setUI);
  const update = useApp((s) => s.update);
  const openDay = useApp((s) => s.openDay);
  const showToast = useApp((s) => s.showToast);
  const role = useCloud((s) => s.role());
  const myCastId = useCloud((s) => s.myCastId());
  const m = ui.month;
  /** 予定の時刻を直しているキャスト */
  const [editing, setEditing] = useState<string | null>(null);
  /** 日を押したあと、その日のカードまで画面を送るための目印。
   *  カレンダーが画面いっぱいなので、押しても下のカードが見えないままだった */
  const [jump, setJump] = useState<string | null>(null);
  /** 新しい子を入れている最中か */
  const [adding, setAdding] = useState(false);
  /** 日のカードで、予定を組んでいるのか希望を書き留めているのか。
   *  いまは希望が LINE で来るので、店が代わりに記録する形も要る */
  const [mode, setMode] = useState<"plan" | "wish">("plan");
  const dayCard = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!jump || !dayCard.current) return;
    dayCard.current.scrollIntoView({ block: "start", behavior: "smooth" });
    setJump(null);
  }, [jump]);

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

  const toggleWishOn = (k: string, castId: string) => update((LL) => toggleWish(LL, k, castId));

  /** 希望をまとめて予定にする。足すだけで、店が入れた予定は消さない */
  const applyMonth = () => {
    const n = diffTotal(planDiff(L, m));
    if (!n) { showToast("入れるものはありません"); return; }
    update((LL) => { applyWishes(LL, m); });
    showToast(`${n}人ぶんを予定に入れました`);
  };

  /** シフトを組んでいる途中で新しい子を足す。
   *
   *  キャスト画面へ行って登録し、戻ってきて選び直す、をやらせない。
   *  入れたその日の予定にもそのまま入れる（足したい理由がそれだから）。
   *
   *  同じ名前がもう居たら作らずにその子を使う。書き間違いではなく
   *  「一覧で見落とした」のがふつうなので、同姓同名を 2 人作る方が事故になる。
   *  辞めた子と同じ名前なら在籍に戻す（戻ってきた子は同じ人として数えたい）。 */
  const addCast = (raw: string, k: string) => {
    const name = raw.trim();
    if (!name) return;
    const hit = L.casts.find((c) => c.name.trim() === name);
    if (hit) {
      update((LL) => {
        const c = LL.casts.find((x) => x.id === hit.id);
        if (c && c.active === false) c.active = true;
        if (!LL.plans) LL.plans = {};
        const cur = LL.plans[k] ?? [];
        if (!cur.some((p) => p.castId === hit.id)) LL.plans[k] = [...cur, { castId: hit.id }];
      });
      showToast(hit.active === false ? `${name} を在籍に戻して予定に入れました` : `${name} はもう居るので、その子を予定に入れました`);
      setAdding(false);
      return;
    }
    const id = uid();
    update((LL) => {
      LL.casts.push({ id, name, wage: null, active: true });
      if (!LL.plans) LL.plans = {};
      LL.plans[k] = [...(LL.plans[k] ?? []), { castId: id }];
    });
    showToast(`${name} を登録して予定に入れました`);
    setAdding(false);
  };

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
  const selWish = sel ? wishesOn(L, sel).map((w) => w.castId) : [];
  /** その日の希望のうち、まだ予定に入っていないぶん */
  const dayLeft = sel ? (planDiff(L, m).find((d) => d.date === sel)?.adds ?? []) : [];
  const totalPlanned = Object.keys(L.plans ?? {}).filter((k) => k.startsWith(m)).length;

  /** 先週の同じ曜日をそのまま写す。月ぶんを組むときは同じ並びの繰り返しになるので、
   *  1 人ずつ選び直すのは写経になる。まだ誰も入れていない日にだけ出す（消さないため） */
  const copyLastWeek = (k: string) => {
    const src = L.plans?.[shiftDay(k, -7)];
    if (!src?.length) return;
    update((LL) => {
      if (!LL.plans) LL.plans = {};
      LL.plans[k] = src.map((p) => ({ ...p }));
    });
  };

  /** これから予定が入っている日。日をタップする前から「誰が入るのか」が見えるように */
  const upcoming = useMemo(() => {
    const keys = Object.keys(L.plans ?? {}).filter((k) => k >= today).sort().slice(0, 7);
    return keys.map((k) => ({ k, ...whoOn(L, k) })).filter((x) => x.total > 0);
  }, [L, today]);

  return (
    <>
      <MonthBar month={m} onChange={(mm) => setUI({ month: mm, calDay: null })} right={<>予定<b>{totalPlanned}日</b></>} />

      <div className="card">
        <h2>シフト</h2><p className="sub">日をタップして、その日に入る子を選びます。塗りつぶしが出勤した日です。</p>
        <CalGrid m={m} dim={dim} lead={lead} today={today} sel={sel}
          /* 日を変えたら開いていた時刻の欄は閉じる。前の日で開いていた子が
             そのまま開いた状態で出てくると、どの日を直しているのか分からなくなる */
          onPick={(k) => { setUI({ calDay: sel === k ? null : k }); setEditing(null); if (sel !== k) setJump(k); }}
          cell={(k) => ({ planned: planOf(k).length > 0, worked: workedOf(k).length > 0, ...whoOn(L, k) })} />
      </div>

      <WishSummary L={L} month={m} onApply={applyMonth} onPick={(k) => { setUI({ calDay: k }); setMode("wish"); setJump(k); }} />

      {sel ? (
        <div className="card" ref={dayCard}>
          <div className="cardhead">
            <h2>{dayLabel(sel)}</h2>
            <button type="button" className="btn sm" onClick={() => openDay(sel, 1)}>日報を開く<ChevRight size={14} /></button>
          </div>
          <Seg label="この日に入れるもの" value={mode} onChange={setMode} wide
            items={[{ id: "plan", label: "予定" }, { id: "wish", label: "希望" }] as const} />
          <p className="sub">
            {mode === "plan"
              ? "名前をタップで予定に入れる／外す。時刻は下の行を開いて直します。"
              : "「この日は入れます」と言ってきた子をタップします。予定にはまだ入りません。"}
          </p>
          <div className="chipgrid">
            {active.map((c) => {
              const planned = selPlan.includes(c.id);
              const wished = selWish.includes(c.id);
              const on = mode === "plan" ? planned : wished;
              const worked = selWorked.includes(c.id);
              return (
                <button key={c.id} type="button" className={`cchip ${on ? "on" : ""}`} aria-pressed={on}
                  onClick={() => (mode === "plan" ? togglePlan(sel, c.id) : toggleWishOn(sel, c.id))}>
                  {on ? "✓ " : ""}{c.name || "（名前なし）"}
                  {/* 予定を組んでいるときは「この子は入れると言っている」が見えた方が速い。
                      希望を書き留めているときは、もう予定に入っているかどうかを出す */}
                  {mode === "plan" && wished && !planned ? <span className="chiptime">入れると言っている</span> : null}
                  {mode === "wish" && planned ? <span className="chiptime">予定に入り済み</span> : null}
                  {mode === "plan" && worked ? <span className="chiptime">出勤済み</span> : null}
                </button>
              );
            })}
            <button type="button" className="cchip add" onClick={() => setAdding(true)}>＋ 新しい子</button>
          </div>

          {/* この日の希望のうち、まだ予定に入っていないぶん。1 タップで入れられる */}
          {dayLeft.length > 0 && (
            <button type="button" className="btn wide" style={{ marginTop: 4 }}
              onClick={() => update((LL) => {
                if (!LL.plans) LL.plans = {};
                LL.plans[sel] = [...(LL.plans[sel] ?? []), ...dayLeft.map((w) => ({ ...w }))];
                showToast(`${dayLeft.length}人を予定に入れました`);
              })}>
              入れると言っている {dayLeft.length}人を、この日の予定に入れる
            </button>
          )}
          {adding && <AddCast onAdd={(nm) => addCast(nm, sel)} onCancel={() => setAdding(false)} wage={L.shop.defaultWage} />}
          {!active.length && !adding && <div className="hint" style={{ marginTop: -6 }}>まだ誰も登録されていません。「＋ 新しい子」から足せます。</div>}

          {/* まだ誰も入れていない日だけ。押すと先週の同じ曜日がそのまま入る */}
          {selPlan.length === 0 && (L.plans?.[shiftDay(sel, -7)]?.length ?? 0) > 0 && (
            <button type="button" className="btn wide" style={{ marginTop: 4 }} onClick={() => copyLastWeek(sel)}>
              先週の{WD[new Date(sel + "T00:00:00").getDay()]}曜と同じにする（{L.plans![shiftDay(sel, -7)].length}人）
            </button>
          )}

          {selPlan.length > 0 && (
            <>
              <div className="sechead" style={{ marginTop: 4 }}><div className="t">この日の予定</div><div className="l" />
                <div className="n">{selPlan.length}人 ・ 計 {spanLabel(selPlan.reduce((s, cid) => s + spanMinutes(planTimes(L, sel, cid)!), 0))}</div></div>
              {selPlan.map((cid) => (
                <PlanRow key={cid} L={L} dk={sel} castId={cid}
                  open={editing === cid} onToggle={() => setEditing(editing === cid ? null : cid)}
                  onTime={(key, v) => setPlanTime(sel, cid, key, v)}
                  onRemove={() => { togglePlan(sel, cid); setEditing(null); }} />
              ))}
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
        /* 日を選ぶ前から「いつ誰が入るのか」が読めるようにする。
           前はここが「日をタップすると…」の空箱で、1 日ずつ開かないと分からなかった */
        <div className="card">
          <h2>これからの予定</h2><p className="sub">行をタップすると、その日のシフトを直せます。</p>
          {upcoming.length ? upcoming.map((u) => (
            <button key={u.k} type="button" className="lrow" onClick={() => setUI({ calDay: u.k })}>
              <div className="g">
                <div className="t">{dayLabel(u.k)}{u.k === today ? " ・ 今日" : ""}</div>
                <div className="s">{u.names.join("・")}</div>
              </div>
              <div className="a num">{u.total}人</div>
            </button>
          )) : <div className="empty">先の予定はまだありません。日をタップして決められます。</div>}
        </div>
      )}
    </>
  );
}

/** 新しい子の名前を入れる欄。聞くのは名前だけ。
 *
 *  時給はここでは聞かない。シフトを組んでいる手を止めないため。
 *  空欄なら店の基本時給になるので、決まっていなくても先に進める。 */
function AddCast({ onAdd, onCancel, wage }: { onAdd: (name: string) => void; onCancel: () => void; wage: number }) {
  const [name, setName] = useState("");
  const ok = !!name.trim();
  return (
    <div className="addcast">
      <input className="inp" value={name} autoFocus placeholder="源氏名" aria-label="新しい子の名前"
        enterKeyHint="done"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && ok) onAdd(name); if (e.key === "Escape") onCancel(); }} />
      <button type="button" className="btn primary" disabled={!ok} onClick={() => onAdd(name)}>入れる</button>
      <button type="button" className="btn" onClick={onCancel}>やめる</button>
      <div className="hint">
        時給は空のままなので、店の基本時給 {yen(wage)} で計算されます。
        変えるときはキャストの画面で。
      </div>
    </div>
  );
}

/** 予定 1 人ぶんの行。押すとその場で時刻を直せる。
 *
 *  前はシートを開いていたが、5 人ぶん直すのにシートを 5 回開け閉めすることになる。
 *  その場で開けば、上から順に見ながら直せる。 */
function PlanRow({ L, dk, castId, open, onToggle, onTime, onRemove }: {
  L: Ledger; dk: string; castId: string; open: boolean; onToggle: () => void;
  onTime: (key: "in" | "out", v: string) => void; onRemove: () => void;
}) {
  const c = L.casts.find((x) => x.id === castId);
  const row = planFor(L, dk, castId);
  const t = planTimes(L, dk, castId);
  if (!t) return null;
  const isDefault = !row?.in && !row?.out;
  const sh = L.days[dk]?.shifts?.[castId];
  const late = sh?.on ? lateLabel(lateMinutes(t.in, sh.in)) : "";
  const presets = commonShifts(L);
  const def = { in: L.shop.openTime, out: L.shop.closeTime };

  /** 店の既定と同じ時刻を選んだら、時刻を書かずに空にしておく。
   *  そうしておくと、店の開店時刻を変えたときにこの予定も一緒に動く */
  const pick = (p: { in: string; out: string }) => {
    const same = p.in === def.in && p.out === def.out;
    onTime("in", same ? "" : p.in);
    onTime("out", same ? "" : p.out);
  };

  return (
    <div className={`planrow ${open ? "open" : ""}`}>
      <button type="button" className="lrow" onClick={onToggle} aria-expanded={open}>
        <div className="g">
          <div className="t">{c?.name || "（削除済み）"}</div>
          <div className="s">
            {spanLabel(spanMinutes(t))}
            {isDefault ? " ・ 店の既定" : ""}
            {late ? <> ・ <span style={{ color: "var(--warn)" }}>{late}</span></> : null}
          </div>
        </div>
        <span className="timepill num">{t.in}-{t.out}</span>
        <ChevDown className={`chevi ${open ? "up" : ""}`} />
      </button>

      {open && (
        <div className="planedit">
          <div className="lbl">よく使う</div>
          <div className="quick">
            {presets.map((p) => (
              <button key={`${p.in}-${p.out}`} type="button" className="btn"
                aria-pressed={t.in === p.in && t.out === p.out} onClick={() => pick(p)}>
                {p.in}-{p.out}
              </button>
            ))}
          </div>
          {/* ＋−は直す時刻のすぐ隣に置く。離して並べると、どちらを動かす
              ボタンなのか押すまで分からない */}
          <TimeStep label="出勤" value={t.in} onChange={(v) => onTime("in", v)} />
          <TimeStep label="退勤" value={t.out} onChange={(v) => onTime("out", v)} />
          <div className="btnrow" style={{ marginTop: 10, alignItems: "center" }}>
            {!isDefault && <button type="button" className="btn sm" onClick={() => { onTime("in", ""); onTime("out", ""); }}>店の既定に戻す</button>}
            <button type="button" className="btn sm danger" onClick={onRemove}>予定から外す</button>
            <span className="hint" style={{ margin: "0 0 0 auto" }}>{spanLabel(spanMinutes(t))}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** 時刻 1 つぶん。「−30 ｜ 21:00 ｜ +30」。数字を押すと端末のピッカーが出る */
function TimeStep({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="tstep">
      <span className="k">{label}</span>
      <button type="button" className="sbtn" aria-label={`${label}を30分早める`} onClick={() => onChange(addMinutes(value, -30))}>−30分</button>
      <TimeField value={value} ariaLabel={`${label}の時刻`} onChange={onChange} />
      <button type="button" className="sbtn" aria-label={`${label}を30分遅らせる`} onClick={() => onChange(addMinutes(value, 30))}>+30分</button>
    </div>
  );
}

/** 予定と実績を出す月カレンダー。誰が入るのかを升の中に出す */
function CalGrid({ m, dim, lead, today, sel, onPick, cell }: {
  m: string; dim: number; lead: number; today: string; sel: string | null;
  onPick: (k: string) => void;
  cell: (k: string) => { planned: boolean; worked: boolean; names: string[]; total: number };
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
              aria-label={`${Number(m.slice(5, 7))}月${d}日 ${st.total ? `${st.total}人 ${st.names.join("、")}` : "なし"}`}>
              <span className="cd">{d}</span>
              {/* 名前の頭 1 文字を出す。数字だけだと「何人か」は分かっても
                  「誰か」が分からず、結局 1 日ずつ開くことになる。
                  3 人以上のときは頭 1 文字だけにする。2 文字＋「+3」は
                  升（約 40px）に入りきらず、折り返して 2 行になっていた */}
              {st.total > 0 && (
                <span className="cwho" aria-hidden="true">
                  {st.names.slice(0, st.total > 2 ? 1 : 2).map((n) => n[0]).join("")}
                  {st.total > 2 ? <i>+{st.total - 1}</i> : null}
                </span>
              )}
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

/** 月の希望のまとめ。
 *
 *  オーナーがこの画面を開く理由は 2 つ。**誰がまだ出していないか**と、
 *  **出そろったから予定に写したい**。その 2 つだけを出す。
 *
 *  並びは「まだの人が上」。催促する相手を探しに来ているので、
 *  出し終えた人を上に置くと毎回スクロールすることになる。 */
function WishSummary({ L, month, onApply, onPick }: {
  L: Ledger; month: string; onApply: () => void; onPick: (date: string) => void;
}) {
  const rows = wishRows(L, month);
  const left = diffTotal(planDiff(L, month));
  const pending = pendingCasts(L, month);
  const anyWish = rows.some((r) => r.days.length > 0 || r.done);

  if (!L.casts.some((c) => c.active !== false)) return null;

  return (
    <div className="card">
      <div className="cardhead">
        <h2>{monthLabel(month)} の希望</h2>
        {anyWish ? <span className={`pill ${pending.length ? "warn" : "ok"}`}>
          {pending.length ? `まだ ${pending.length}人` : "出そろい"}
        </span> : null}
      </div>

      {!anyWish ? (
        <div className="empty">
          まだ誰も出していません<br />
          <span className="hint">日をタップして「希望」に切り替えると、店が代わりに書き留められます</span>
        </div>
      ) : (
        <>
          {rows.map((r) => (
            <button key={r.castId} type="button" className="lrow"
              onClick={() => r.days.length && onPick(r.days[0])}>
              <div className="g">
                <div className="t">{r.name || "（名前なし）"}</div>
                <div className="s">
                  {r.days.length
                    ? `${r.days.slice(0, 6).map((d) => Number(d.slice(8))).join("・")}日${r.days.length > 6 ? ` ほか${r.days.length - 6}日` : ""}`
                    : r.done ? "この月は入れないと出しています" : "まだ出していません"}
                </div>
              </div>
              <div className="a num">{r.days.length ? `${r.days.length}日` : r.done ? "—" : ""}</div>
            </button>
          ))}

          {/* 予定に入っていないぶんだけを出す。押すたびに減って、0 になったら消える */}
          {left > 0 ? (
            <button type="button" className="btn primary wide" style={{ marginTop: 10 }} onClick={onApply}>
              {left}人ぶんを予定に入れる
            </button>
          ) : (
            <div className="hint" style={{ marginTop: 10 }}>出ている希望は、ぜんぶ予定に入っています</div>
          )}
          <div className="hint" style={{ marginTop: 6 }}>
            予定は<b>足すだけ</b>です。店が入れた予定は消えません。
          </div>
        </>
      )}
    </div>
  );
}
