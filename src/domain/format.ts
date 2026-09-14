/** 表示用の整形と日付ユーティリティ */

export const uid = (): string => Math.random().toString(36).slice(2, 9);

export const todayISO = (): string => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

export const yen = (v: number): string => {
  const r = Math.round(v);
  return (r < 0 ? "−¥" : "¥") + Math.abs(r).toLocaleString("ja-JP");
};
export const yenShort = (v: number): string => {
  const a = Math.abs(v);
  if (a >= 10000) return (v < 0 ? "-" : "") + (a / 10000).toFixed(a >= 100000 ? 0 : 1).replace(/\.0$/, "") + "万";
  return Math.round(v).toLocaleString("ja-JP");
};
export const jp = (v: number): string => Math.round(v).toLocaleString("ja-JP");

export const WD = ["日", "月", "火", "水", "木", "金", "土"];
export const dayLabel = (dk: string): string =>
  `${Number(dk.slice(5, 7))}/${Number(dk.slice(8, 10))}（${WD[new Date(dk + "T00:00:00").getDay()]}）`;
export const monthLabel = (m: string): string => `${Number(m.slice(5, 7))}月 ${m.slice(0, 4)}`;

export function shiftMonth(m: string, delta: number): string {
  const y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)) - 1 + delta;
  const d = new Date(y, mo, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
export function shiftDay(dk: string, delta: number): string {
  const d = new Date(dk + "T00:00:00");
  d.setDate(d.getDate() + delta);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
export function daysInMonth(m: string): number {
  return new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
}

/** 時刻 "HH:MM" に分を足す（0〜24h で折り返し） */
export function addMinutes(t: string, delta: number): string {
  if (!/^\d{1,2}:\d{2}$/.test(t)) return t;
  const [h, mi] = t.split(":").map(Number);
  let x = ((h * 60 + mi + delta) % 1440 + 1440) % 1440;
  return String(Math.floor(x / 60)).padStart(2, "0") + ":" + String(x % 60).padStart(2, "0");
}

/** 入力文字列 → number | null。全角数字・カンマ・¥ を吸収する */
export function parseNum(s: string): number | null {
  const t = s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．]/g, ".")
    .replace(/[－ー−]/g, "-")
    .replace(/[^0-9.\-]/g, "");
  if (t === "" || t === "-" || t === ".") return null;
  const x = parseFloat(t);
  return Number.isFinite(x) ? x : null;
}

/** 桁区切りを入れ直したあとに、カーソルを戻す位置。
 *
 *  カンマを入れると文字数が変わるので、「何文字目」で覚えておくとずれる。
 *  「左から何桁目の数字の後ろか」で覚えておいて、整形後の文字列で
 *  その桁を数え直す。 */
export function caretAfterDigits(s: string, digits: number): number {
  if (digits <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] >= "0" && s[i] <= "9") {
      seen += 1;
      if (seen === digits) return i + 1;
    }
  }
  return s.length;
}

/** 文字列の先頭から n 文字目までに数字が何個あるか。カーソルの位置を桁で覚えるため */
export function digitsBefore(s: string, caret: number): number {
  return (s.slice(0, caret).match(/\d/g) ?? []).length;
}
