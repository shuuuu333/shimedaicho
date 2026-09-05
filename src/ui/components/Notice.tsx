import type { ReactNode } from "react";

/** 注意書き。左に丸いアイコン、右に本文。金色の縦線はやめて、まとまりのある形にする */
export function Notice({ title, children, bad }: { title?: string; children: ReactNode; bad?: boolean }) {
  return (
    <div className={`notice ${bad ? "bad" : ""}`} role="note">
      <span className="ic" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9.2" /><path d="M12 11.2v5" /><path d="M12 7.9v.1" />
        </svg>
      </span>
      <span className="g">
        {title && <span className="t">{title}</span>}
        {children}
      </span>
    </div>
  );
}
