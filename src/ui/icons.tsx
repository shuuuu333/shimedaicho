/** インライン SVG アイコン */
type P = { size?: number; className?: string };
const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true });

export const ChevRight = ({ size = 16, className }: P) => <svg {...base(size)} className={className}><path d="M9 5l7 7-7 7" /></svg>;
export const ChevLeft = ({ size = 16, className }: P) => <svg {...base(size)} className={className}><path d="M15 5l-7 7 7 7" /></svg>;
export const ChevDown = ({ size = 16, className }: P) => <svg {...base(size)} className={className}><path d="M5 9l7 7 7-7" /></svg>;
export const Check = ({ size = 12 }: P) => <svg {...base(size)} strokeWidth={3.2}><path d="M4 12.5l5.5 5.5L20 6.5" /></svg>;
export const Trash = ({ size = 17 }: P) => <svg {...base(size)} strokeWidth={1.9}><path d="M4 7h16M9.5 7V5.2A1.2 1.2 0 0 1 10.7 4h2.6a1.2 1.2 0 0 1 1.2 1.2V7M6.5 7l.8 12.1A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7M10.5 11v6M13.5 11v6" /></svg>;
export const IcoMonth = () => <svg {...base(21)} strokeWidth={1.8}><path d="M4 19V9m5 10V5m5 14v-7m5 7V8" /></svg>;
export const IcoDay = () => <svg {...base(21)} strokeWidth={1.8}><rect x="3.5" y="4.5" width="17" height="16" rx="2.5" /><path d="M3.5 9.5h17M8 3v3m8-3v3M9 14h6" /></svg>;
export const IcoCast = () => <svg {...base(21)} strokeWidth={1.8}><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" /></svg>;
export const IcoSet = () => <svg {...base(21)} strokeWidth={1.8}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3m13.4-6.4-1.6 1.6M9.2 14.8l-1.6 1.6m10.8 0-1.6-1.6M9.2 9.2 7.6 7.6" /></svg>;
