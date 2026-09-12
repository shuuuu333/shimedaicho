import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../state/store";
import type { Check, DayRecord, MenuItem, PosRule, SetPlan, Shift } from "../../domain/types";
import { usePos } from "../../state/pos";
import { checkTotals, clock, endsAt, lineAmount, lineFromMenu, planLabel, remainingMin, seatState, setPlanChoices, setUnitPrice } from "../../domain/pos";
import { summarize } from "../../domain/close";
import { detectMisses } from "../../domain/diagnose";
import { yen } from "../../domain/format";
import { defaultPosRule } from "../../domain/migrate";
import { BottomSheet } from "../components/BottomSheet";
import { NumberField } from "../components/NumberField";
import { TimeField } from "../components/TimeField";
import { CheckView } from "./CheckView";
import { LateEntrySheet } from "./LateEntry";
import { useWakeLock } from "../useWakeLock";
import { useCloud } from "../../state/cloud";

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
  const removeCheck = usePos((s) => s.removeCheck);

  const [now, setNow] = useState(() => Date.now());
  const [entry, setEntry] = useState<{ seatId: string | null; name: string } | null>(null);
  // レジを開いているあいだは画面を消させない（伝票画面も Register の中で描いている）
  useWakeLock(true);
  const [detail, setDetail] = useState<string | null>(null);
  const [paper, setPaper] = useState(false);
  const [plan, setPlan] = useState<SetPlan>({ min: rule.setMinutes, price: rule.setPrice });
  const openEntry = (seatId: string | null, name: string) => {
    setPlan({ min: rule.setMinutes, price: rule.setPrice });
    setEntry({ seatId, name });
  };

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
  // 営業中に言って意味のある打ち忘れだけ（＝会計を打ち忘れて入店中のままの席）
  const misses = useMemo(() => detectMisses(L, date, checks, now).filter((m) => m.live), [L, date, checks, now]);

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

      <SyncRow />

      {misses.length > 0 && (
        <div className="card">
          <ul className="hintlist" style={{ margin: 0 }}>
            {misses.map((m) => <li key={m.id} className={m.strong ? "strong" : ""}>{m.text}</li>)}
          </ul>
        </div>
      )}

      <Attendance date={date} />

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
        <div className="cardhead">
          <h2>会計済み</h2>
          <span className="muted">{closed.length} 組</span>
        </div>
        <div className="btnrow" style={{ marginBottom: 10 }}>
          <button type="button" className="btn sm" onClick={() => setPaper(true)}>＋ 紙の伝票から入れる</button>
        </div>
        <div className="hint" style={{ margin: "-4px 0 10px" }}>
          閉店後に紙から写すときはこちら。1 枚ずつ、入店時刻から順に入れられます。
        </div>
        {closed.length === 0 ? (
          <div className="empty">まだ会計はありません</div>
        ) : closed.map((c) => {
          const seat = seats.find((s) => s.id === c.seatId);
          const p = c.payments[0];
          const voided = c.lines.filter((l) => l.voided).length;
          return (
            <button key={c.id} type="button" className="lrow" onClick={() => setDetail(c.id)}>
              <div className="g">
                <div className="t">{seat?.name ?? "席なし"} ・ {c.guests}名</div>
                <div className="s">
                  {c.closedAt ? clock(new Date(c.closedAt)) + " ・ " : ""}
                  {p?.method === "card" ? "カード" : "現金"}
                  {voided > 0 ? ` ・ 取消 ${voided}件` : ""}
                  {c.discount ? ` ・ 値引き ${yen(c.discount.amount)}` : ""}
                </div>
              </div>
              <div className="a">{yen(p?.amount ?? 0)}</div>
            </button>
          );
        })}
      </div>

      <CheckDetail id={detail} onClose={() => setDetail(null)}
        onReopen={(id) => { setDetail(null); void reopen(id); }}
        onRemove={(id) => {
          const c = checks.find((x) => x.id === id);
          const seat = seats.find((s) => s.id === c?.seatId)?.name ?? "席なし";
          if (!window.confirm(`${seat}・${c?.guests ?? 0}名 の伝票を消します。\n履歴ごと無くなり、元に戻せません。よろしいですか？`)) return;
          setDetail(null);
          void removeCheck(id);
        }} />

      {paper && <LateEntrySheet onClose={() => setPaper(false)} />}

      <BottomSheet open={!!entry} title={`${entry?.name ?? ""} に入店`} onClose={() => setEntry(null)}>
        <div className="lbl">セット（1名あたり）</div>
        <div className="pricerow">
          {setPlanChoices(rule).map((p) => (
            <button key={`${p.min}:${p.price}`} type="button" className="btn"
              aria-pressed={plan.min === p.min && plan.price === p.price}
              onClick={() => setPlan(p)}>{planLabel(p)}</button>
          ))}
        </div>
        <div className="row2">
          <label className="field" style={{ margin: 0 }}><span className="lbl">ほかの時間（分）</span>
            <NumberField value={plan.min} onChange={(v) => setPlan({ ...plan, min: v ?? rule.setMinutes })} aria-label="セットの時間" />
          </label>
          <label className="field" style={{ margin: 0 }}><span className="lbl">ほかの金額</span>
            <NumberField value={plan.price} onChange={(v) => setPlan({ ...plan, price: v ?? 0 })} aria-label="セット料金" />
          </label>
        </div>
        <div className="hint">
          {plan.price > 0
            ? `${planLabel(plan)}。2名なら ${yen(plan.price * 2)}、3名なら ${yen(plan.price * 3)}。`
            : "金額を入れてください。"}
          人数を押すと入店します。
        </div>
        <div className="guestgrid">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <button key={n} type="button" className="btn" disabled={plan.price <= 0} onClick={() => {
              const e = entry; setEntry(null); if (e) void openSeat(e.seatId, n, plan);
            }}>{n}名</button>
          ))}
        </div>
      </BottomSheet>
    </>
  );
}

/** 今の時刻 HH:MM */
const nowHM = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const newShift = (): Shift => ({ on: false, in: "", out: "", breakMin: null, backs: {}, deduct: null, paid: null });

/** 打刻。ドリンクを売っていない子も、ここでタップすれば出勤になる。
 *  レジからの反映は in / out が空のときだけ店の初期値を入れるので、打った時刻は消えない。
 *
 *  キャストが自分の携帯でレジを開く運用では、ここに全員を並べると他人の遅刻を消したり
 *  自分の出勤時刻を早めたりできてしまう。だからキャストには自分のぶんだけ出す。
 *  本人がどのキャストか分からないときは、何も出さない（開けてしまうより閉じる方に寄せる）。 */
function Attendance({ date }: { date: string }) {
  const casts = useApp((s) => s.ledger.casts);
  const day = useApp((s) => s.ledger.days[date]) as DayRecord | undefined;
  const editDay = useApp((s) => s.editDay);
  const showToast = useApp((s) => s.showToast);
  const role = useCloud((s) => s.role());
  const myCastId = useCloud((s) => s.myCastId());
  const [sheet, setSheet] = useState<string | null>(null);

  const isCast = role === "cast";
  const all = casts.filter((c) => c.active !== false);
  const active = isCast ? all.filter((c) => c.id === myCastId) : all;
  const shifts = day?.shifts ?? {};
  const onCount = active.filter((c) => shifts[c.id]?.on).length;

  if (isCast && !active.length) {
    return (
      <div className="card">
        <div className="cardhead"><h2>出勤</h2></div>
        <div className="empty">
          あなたのアカウントがキャストに結び付いていません<br />
          <span className="hint">オーナーに、設定のメンバー欄で結び付けてもらってください</span>
        </div>
      </div>
    );
  }

  const punchIn = (id: string, name: string) => {
    const at = nowHM();
    editDay(date, (d) => {
      const sh = (d.shifts[id] ??= newShift());
      sh.on = true;
      sh.in = at;
      sh.out = "";
    });
    showToast(`${name} 出勤 ${at}`);
  };

  if (!active.length) {
    return (
      <div className="card">
        <div className="cardhead"><h2>出勤</h2></div>
        <div className="empty">キャストが登録されていません<br /><span className="hint">「キャスト」タブから登録できます</span></div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="cardhead"><h2>出勤</h2><span className="muted">{onCount} 名</span></div>
      <div className="chipgrid" style={{ marginBottom: 0 }}>
        {active.map((c) => {
          const sh = shifts[c.id];
          const on = !!sh?.on;
          return (
            <button key={c.id} type="button" className={`cchip ${on ? "on" : ""}`} aria-pressed={on}
              onClick={() => (on ? setSheet(c.id) : punchIn(c.id, c.name || "この子"))}>
              {c.name || "（名前なし）"}
              {on && sh?.in && <span className="chiptime">{sh.in}{sh.out ? `-${sh.out}` : "-"}</span>}
            </button>
          );
        })}
      </div>
      <div className="hint">
        タップで出勤。もう一度タップすると退勤や時刻直しができます。
        {isCast && "あなたのぶんだけ出しています。"}
      </div>
      <PunchSheet date={date} castId={sheet} onClose={() => setSheet(null)} />
    </div>
  );
}

function PunchSheet({ date, castId, onClose }: { date: string; castId: string | null; onClose: () => void }) {
  const casts = useApp((s) => s.ledger.casts);
  const day = useApp((s) => s.ledger.days[date]) as DayRecord | undefined;
  const editDay = useApp((s) => s.editDay);
  const showToast = useApp((s) => s.showToast);
  if (!castId) return null;
  const c = casts.find((x) => x.id === castId);
  const sh = day?.shifts[castId];
  if (!c || !sh) return null;
  const set = (mut: (s: Shift) => void) => editDay(date, (d) => { mut(d.shifts[castId]); });

  return (
    <BottomSheet open title={c.name || "（名前なし）"} onClose={onClose}>
      <div className="row2">
        <label className="field" style={{ margin: 0 }}><span className="lbl">出勤</span>
          <TimeField value={sh.in} ariaLabel="出勤時刻" onChange={(v) => set((x) => { x.in = v; })} /></label>
        <label className="field" style={{ margin: 0 }}><span className="lbl">退勤</span>
          <TimeField value={sh.out} ariaLabel="退勤時刻" onChange={(v) => set((x) => { x.out = v; })} /></label>
      </div>
      <button type="button" className="btn primary wide" style={{ marginTop: 12 }}
        onClick={() => { const at = nowHM(); set((x) => { x.out = at; }); showToast(`${c.name || "この子"} 退勤 ${at}`); onClose(); }}>
        今 退勤にする（{nowHM()}）
      </button>
      <button type="button" className="btn wide" style={{ marginTop: 8 }}
        onClick={() => { set((x) => { x.out = ""; }); onClose(); }}>退勤を取り消す</button>
      <button type="button" className="btn danger wide" style={{ marginTop: 8 }}
        onClick={() => { set((x) => { x.on = false; }); showToast(`${c.name || "この子"} の出勤を外しました`); onClose(); }}>
        出勤そのものを外す
      </button>
      <div className="hint">時間も本数も日報に入ります。細かい直しは日報の「出勤」でできます。</div>
    </BottomSheet>
  );
}

/** 会計済みの伝票をひらいて、明細と「誰が・いつ・何をしたか」を見る。
 *  取り消した行も理由つきで残っている（レジを人に任せるときの備え） */
function CheckDetail({ id, onClose, onReopen, onRemove }: { id: string | null; onClose: () => void; onReopen: (id: string) => void; onRemove: (id: string) => void }) {
  const L = useApp((s) => s.ledger);
  const rule = L.posRule ?? defaultPosRule();
  const check = usePos((s) => s.checks.find((c) => c.id === id)) as Check | undefined;
  const [late, setLate] = useState(false);
  if (!id || !check) return null;

  const seat = (L.seats ?? []).find((s) => s.id === check.seatId);
  const t = checkTotals(check, rule);
  const castName = (cid?: string) => L.casts.find((c) => c.id === cid)?.name ?? "";
  const hhmm = (iso: string) => (Number.isFinite(Date.parse(iso)) ? clock(new Date(iso)) : "");

  return (
    <BottomSheet open title={`${seat?.name ?? "席なし"} ・ ${check.guests}名`} onClose={onClose}>
      <div className="hint" style={{ marginBottom: 10 }}>
        入店 {hhmm(check.enteredAt)}{check.closedAt ? ` ／ 会計 ${hhmm(check.closedAt)}` : ""}
      </div>

      <div className="card flat">
        <div className="lrow">
          <div className="g"><div className="t">セット{check.extends.length > 0 ? "・延長" : ""}</div>
            <div className="s">1名 {yen(setUnitPrice(check))} × {check.guests}名</div></div>
          <div className="a">{yen(t.setAmount)}</div>
        </div>
        {check.lines.map((l) => (
          <div key={l.id} className={`lrow ${l.voided ? "voided" : ""}`}>
            <div className="g">
              <div className="t">{l.name}{l.qty > 1 ? ` ×${l.qty}` : ""}</div>
              <div className="s">
                {l.castId ? castName(l.castId) : ""}
                {l.voided ? `${l.castId ? " ・ " : ""}取消（${l.voided.reason}）` : ""}
              </div>
            </div>
            <div className="a">{yen(lineAmount(l))}</div>
          </div>
        ))}
        {t.tableCharge > 0 && (
          <div className="lrow"><div className="g"><div className="t">テーブルチャージ</div></div><div className="a">{yen(t.tableCharge)}</div></div>
        )}
        {t.discount > 0 && (
          <div className="lrow"><div className="g"><div className="t">値引き</div><div className="s">{check.discount?.name}</div></div><div className="a neg">−{yen(t.discount)}</div></div>
        )}
        <div className="lrow total">
          <div className="g"><div className="t">合計</div>
            <div className="s">{check.payments[0]?.method === "card" ? "カード" : "現金"}{check.received ? ` ／ お預かり ${yen(check.received)}` : ""}</div></div>
          <div className="a">{yen(t.total)}</div>
        </div>
      </div>

      <div className="cardhead" style={{ marginTop: 14 }}><h2>この伝票にしたこと</h2></div>
      <ol className="checklog">
        {check.log.map((g, i) => (
          <li key={i}>
            <span className="at">{hhmm(g.at)}</span>
            <span className="act">{g.act}</span>
            {g.detail && <span className="detail">{g.detail}</span>}
            <span className="by">{g.by}</span>
          </li>
        ))}
      </ol>
      <div className="hint">取り消した行も消さずに残しています。あとから何があったか追えます。</div>

      <button type="button" className="btn primary wide" style={{ marginTop: 12 }} onClick={() => setLate(true)}>
        注文をあとから足す
      </button>
      <div className="hint">「戻す → 追加 → 会計」をしなくても、ここから足せます。</div>

      <button type="button" className="btn wide" style={{ marginTop: 4 }} onClick={() => onReopen(check.id)}>
        会計を取り消してやり直す
      </button>
      <button type="button" className="btn danger wide" style={{ marginTop: 8 }} onClick={() => onRemove(check.id)}>
        この伝票を消す
      </button>
      <div className="hint">
        消すと履歴ごと無くなり、日報の売上と本数からも引かれます。<b>元に戻せません。</b>
        打ち間違いを直すだけなら「会計を取り消してやり直す」の方を使ってください。
      </div>

      {late && <LateAddSheet check={check} rule={rule} onClose={() => setLate(false)} onDone={onClose} />}
    </BottomSheet>
  );
}

/** 会計済みの伝票に、あとから注文を足す。
 *
 *  足したぶんは確定するまで書き込まない（ここで閉じても伝票は動かない）。
 *  合計が変わるので、最後に「実際にいくら受け取ったのか」を正直に聞く。
 *  黙って売上を増やすと、そのぶん現金が合わなくなる。 */
function LateAddSheet({ check, rule, onClose, onDone }: { check: Check; rule: PosRule; onClose: () => void; onDone: () => void }) {
  const L = useApp((s) => s.ledger);
  const addLate = usePos((s) => s.addLate);
  const showToast = useApp((s) => s.showToast);

  const menu = useMemo(() => (L.menu ?? []).filter((m) => m.active).sort((a, b) => a.sort - b.sort), [L.menu]);
  const cats = useMemo(() => [...new Set(menu.map((m) => m.category))], [menu]);
  const [cat, setCat] = useState<string | null>(null);
  const shown = menu.filter((m) => m.category === (cat ?? cats[0]));
  const casts = (L.casts ?? []).filter((c) => c.active !== false);
  const [picking, setPicking] = useState<MenuItem | null>(null);
  /** まだ書き込んでいない追加ぶん */
  const [staged, setStaged] = useState<{ item: MenuItem; castId?: string }[]>([]);

  const before = checkTotals(check, rule).total;
  const paid = check.payments[0]?.amount ?? before;
  // 足したあとの合計。伝票そのものは触らずに、行だけ足した姿で計算する
  const after = checkTotals(
    { ...check, lines: [...check.lines, ...staged.map(({ item, castId }) => lineFromMenu(item, check.enteredAt, castId))] },
    rule,
  ).total;

  const tap = (m: MenuItem) => {
    if (m.kind === "castLinked") setPicking(m);
    else setStaged((s) => [...s, { item: m }]);
  };
  const finish = (collect: boolean) => {
    void addLate(check.id, staged, collect);
    showToast(collect ? `追加ぶんを受け取りました（${yen(after)}）` : `追加ぶんは受け取っていません（${yen(after - paid)}）`);
    onClose();
    onDone();
  };

  return (
    <BottomSheet open title="注文をあとから足す" onClose={onClose}
      footer={staged.length > 0
        ? <span className="sum">合計 {yen(paid)} → <b>{yen(after)}</b><br />実際に受け取った額はどちら？</span>
        : <span className="sum">商品をタップして足してください</span>}>
      <div className="seg menuseg">
        {cats.map((c) => (
          <button key={c} type="button" aria-pressed={(cat ?? cats[0]) === c} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <div className="menugrid">
        {shown.map((m) => (
          <button key={m.id} type="button" className={`menubtn ${m.kind === "castLinked" ? "cast" : ""}`} onClick={() => tap(m)}>
            <b>{m.name}</b><span>{yen(m.price)}</span>
          </button>
        ))}
        {shown.length === 0 && <div className="empty">このカテゴリに商品がありません</div>}
      </div>

      {staged.length > 0 && (
        <>
          <div className="cardhead" style={{ marginTop: 12 }}><h2>足したもの</h2></div>
          {staged.map((x, i) => (
            <div key={i} className="lrow">
              <div className="g"><div className="t">{x.item.name}</div>
                <div className="s">{x.castId ? (L.casts.find((c) => c.id === x.castId)?.name ?? "") : ""}</div></div>
              <div className="a">{yen(x.item.price)}</div>
              <button type="button" className="btn sm" style={{ marginLeft: 8 }}
                onClick={() => setStaged((s) => s.filter((_, j) => j !== i))}>やめる</button>
            </div>
          ))}
          <button type="button" className="btn primary wide" style={{ marginTop: 12 }} onClick={() => finish(true)}>
            {yen(after)} 受け取った
          </button>
          <button type="button" className="btn wide" style={{ marginTop: 8 }} onClick={() => finish(false)}>
            {yen(paid)} のままだった
          </button>
          <div className="hint">
            「{yen(paid)} のままだった」を選ぶと、売上は増えません（{yen(after - paid)} は取り損ねたぶんとして記録に残ります）。
            キャストの本数は、実際に出しているのでどちらでも付きます。
          </div>
        </>
      )}

      <BottomSheet open={!!picking} title={`${picking?.name ?? ""} は誰の分？`} onClose={() => setPicking(null)}>
        <div className="chipgrid">
          {casts.map((c) => (
            <button key={c.id} type="button" className="btn chip"
              onClick={() => { const m = picking; setPicking(null); if (m) setStaged((s) => [...s, { item: m, castId: c.id }]); }}>
              {c.name || "（名前なし）"}
            </button>
          ))}
          {casts.length === 0 && <div className="empty">先にキャストを登録してください</div>}
        </div>
        <button type="button" className="btn wide" style={{ marginTop: 12 }}
          onClick={() => { const m = picking; setPicking(null); if (m) setStaged((s) => [...s, { item: m }]); }}>
          キャストを付けずに入れる
        </button>
      </BottomSheet>
    </BottomSheet>
  );
}

/** 伝票がクラウドへ送れているか。
 *  黙って遅れているのが一番怖いので、未送信が残っているときだけ出す。
 *  端末内だけで使っているときは何も出さない（その状態が正常なので）。 */
function SyncRow() {
  const pending = usePos((s) => s.pending);
  const syncError = usePos((s) => s.syncError);
  const shopId = useCloud((s) => s.shopId);
  if (!shopId) return null;
  if (pending === 0 && !syncError) return null;

  return (
    <div className="card">
      <ul className="hintlist" style={{ margin: 0 }}>
        {pending > 0 && (
          <li className="strong">
            まだ送れていない操作が {pending}件 あります。
            この端末には残っているので、つながれば自動で追いつきます。
          </li>
        )}
        {syncError && <li>{syncError}</li>}
      </ul>
    </div>
  );
}
