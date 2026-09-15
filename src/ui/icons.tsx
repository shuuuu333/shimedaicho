/** インライン SVG アイコン */
type P = { size?: number; className?: string };
const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });

export const ChevRight = ({ size = 16, className }: P) => <svg {...base(size)} className={className}><path d="M9 5l7 7-7 7" /></svg>;
export const ChevLeft = ({ size = 16, className }: P) => <svg {...base(size)} className={className}><path d="M15 5l-7 7 7 7" /></svg>;
export const ChevDown = ({ size = 16, className }: P) => <svg {...base(size)} className={className}><path d="M5 9l7 7 7-7" /></svg>;
export const Check = ({ size = 12 }: P) => <svg {...base(size)} strokeWidth={3.2}><path d="M4 12.5l5.5 5.5L20 6.5" /></svg>;
export const Trash = ({ size = 17 }: P) => <svg {...base(size)} strokeWidth={1.9}><path d="M4 7h16M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7M6.5 7l.8 12.1A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7M10.5 11v6M13.5 11v6" /></svg>;
export const Plus = ({ size = 18 }: P) => <svg {...base(size)} strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>;
export const Sun = ({ size = 15 }: P) => <svg {...base(size)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M22 12h-2M4 12H2m15.1-7.1-1.4 1.4M8.3 15.7l-1.4 1.4m10.2 0-1.4-1.4M8.3 8.3 6.9 6.9" /></svg>;
export const Moon = ({ size = 15 }: P) => <svg {...base(size)}><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" /></svg>;
export const Phone = ({ size = 15 }: P) => <svg {...base(size)}><rect x="5" y="2.5" width="14" height="19" rx="3" /><path d="M10.5 18.5h3" /></svg>;
export const Copy = ({ size = 15 }: P) => <svg {...base(size)}><rect x="8" y="8" width="12" height="12" rx="3" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
/* タブのアイコン。5 つ並ぶので、影の形だけで見分けがつくことを優先している。
   前は「日報」と「シフト」がどちらもカレンダーで、並ぶと区別がつかなかった。
   いまは お金 / 棒グラフ / 書類 / カレンダー / 人 と、輪郭が全部ちがう */

/** レジ … お札。この画面ですることは会計なので、帳票ではなくお金にした */
export const IcoReg = () => <svg {...base(21)} strokeWidth={1.8}><rect x="2.5" y="6" width="19" height="12" rx="2.6" /><circle cx="12" cy="12" r="2.5" /><path d="M6.2 10.3v3.4M17.8 10.3v3.4" /></svg>;

/** 今月 … 棒グラフ。伸び縮みを見る画面 */
export const IcoMonth = () => <svg {...base(21)} strokeWidth={1.8}><path d="M3 20.5h18" /><path d="M6 17.5v-6m4 6V6.5m4 11v-4m4 4V9.5" /></svg>;

/** 日報 … バインダー。1 日ぶんを書いて綴じるもの。カレンダーとは形を変えてある */
export const IcoDay = () => <svg {...base(21)} strokeWidth={1.8}><path d="M9.2 4.6H7.4a2 2 0 0 0-2 2v11.8a2 2 0 0 0 2 2h9.2a2 2 0 0 0 2-2V6.6a2 2 0 0 0-2-2h-1.8" /><rect x="9.2" y="2.9" width="5.6" height="3.4" rx="1.2" /><path d="M9 11.4h6M9 14.8h4" /></svg>;

/** シフト … カレンダー。入っている日を塗って「予定が埋まっている」形にする */
export const IcoShift = () => <svg {...base(21)} strokeWidth={1.8}><rect x="3" y="5" width="18" height="16" rx="3.2" /><path d="M3 10h18M8 2.9v3.4M16 2.9v3.4" /><rect x="6.6" y="12.6" width="4" height="2.6" rx=".9" fill="currentColor" stroke="none" /><rect x="13.4" y="16.2" width="4" height="2.6" rx=".9" fill="currentColor" stroke="none" /></svg>;

/** キャスト … 2 人。1 人だと「自分の情報」に見えるので、名簿とわかる形にした */
export const IcoCast = () => <svg {...base(21)} strokeWidth={1.8}><circle cx="9.4" cy="8.4" r="3.2" /><path d="M3.4 19.6c0-3.3 2.7-5.4 6-5.4s6 2.1 6 5.4" /><path d="M16.4 6.5a3 3 0 0 1 0 5.8M17.6 14.5c1.8.7 3 2.4 3 5.1" /></svg>;

/** 給料。紙幣に円。キャスト手帳の下のタブで「シフト」と並ぶので、
 *  カレンダーと見間違えない形にしてある */
export const IcoPay = () => <svg {...base(21)} strokeWidth={1.8}><rect x="2.4" y="5.6" width="19.2" height="12.8" rx="2.6" /><path d="M9.6 9.6l2.4 3 2.4-3M9.8 13h4.4M9.8 15h4.4M12 12.6V16" /></svg>;

export const IcoSet = () => <svg {...base(21)} strokeWidth={1.6} strokeLinejoin="round"><path d="M10.07 4.55 L10.03 1.89 L13.97 1.89 L13.93 4.55 A7.7 7.7 0 0 1 15.91 5.37 L17.76 3.46 L20.54 6.24 L18.63 8.09 A7.7 7.7 0 0 1 19.45 10.07 L22.11 10.03 L22.11 13.97 L19.45 13.93 A7.7 7.7 0 0 1 18.63 15.91 L20.54 17.76 L17.76 20.54 L15.91 18.63 A7.7 7.7 0 0 1 13.93 19.45 L13.97 22.11 L10.03 22.11 L10.07 19.45 A7.7 7.7 0 0 1 8.09 18.63 L6.24 20.54 L3.46 17.76 L5.37 15.91 A7.7 7.7 0 0 1 4.55 13.93 L1.89 13.97 L1.89 10.03 L4.55 10.07 A7.7 7.7 0 0 1 5.37 8.09 L3.46 6.24 L6.24 3.46 L8.09 5.37 A7.7 7.7 0 0 1 10.07 4.55 Z" /><circle cx="12" cy="12" r="3.1" /></svg>;
