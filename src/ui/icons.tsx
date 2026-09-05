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
export const IcoMonth = () => <svg {...base(21)} strokeWidth={1.8}><path d="M4 19V9m5 10V5m5 14v-7m5 7V8" /></svg>;
export const IcoDay = () => <svg {...base(21)} strokeWidth={1.8}><rect x="3.5" y="4.5" width="17" height="16" rx="2.5" /><path d="M3.5 9.5h17M8 3v3m8-3v3M9 14h6" /></svg>;
export const IcoShift = () => <svg {...base(21)} strokeWidth={1.8}><rect x="3" y="4.5" width="18" height="16" rx="3.5" /><path d="M3 9.5h18M8 3v3m8-3v3" /><circle cx="8.5" cy="14" r="1.3" fill="currentColor" stroke="none" /><circle cx="12" cy="14" r="1.3" fill="currentColor" stroke="none" /><circle cx="15.5" cy="17" r="1.3" fill="currentColor" stroke="none" /></svg>;
export const IcoCast = () => <svg {...base(21)} strokeWidth={1.8}><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" /></svg>;
export const IcoSet = () => <svg {...base(21)} strokeWidth={1.8}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3m13.4-6.4-1.6 1.6M9.2 14.8l-1.6 1.6m10.8 0-1.6-1.6M9.2 9.2 7.6 7.6" /></svg>;
