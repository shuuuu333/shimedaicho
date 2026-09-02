import { useEffect, type ReactNode } from "react";

interface Props { open: boolean; title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }

/** 画面下から出るシート。背景タップ・Esc で閉じる */
export function BottomSheet({ open, title, onClose, children, footer }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", key); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheetwrap" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheethead"><b>{title}</b><button type="button" className="btn sm" onClick={onClose}>完了</button></div>
        <div className="sheetbody">{children}</div>
        {footer && <div className="sheetfoot">{footer}</div>}
      </div>
    </div>
  );
}
