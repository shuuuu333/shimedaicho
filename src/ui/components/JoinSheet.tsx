import { useState } from "react";
import { useCloud } from "../../state/cloud";
import { useApp } from "../../state/store";
import { BottomSheet } from "./BottomSheet";
import { LineButton } from "./LoginForm";

/** QR を読んで開いたときに出す。入り方を選んでもらう。
 *  「そのまま入る」は速いが、端末のデータを消すと入り直しになる（匿名のため）。
 *  LINE なら、機種を変えても同じ人として戻れる。 */
export function JoinSheet({ token, onClose }: { token: string | null; onClose: () => void }) {
  const joinByToken = useCloud((s) => s.joinByToken);
  const busy = useCloud((s) => s.busy);
  const showToast = useApp((s) => s.showToast);
  const [going, setGoing] = useState(false);

  if (!token) return null;

  const plain = async () => {
    setGoing(true);
    const r = await joinByToken(token);
    showToast(r.message);
    onClose();
  };

  return (
    <BottomSheet open title="お店に入る" onClose={onClose}>
      <div className="hint" style={{ marginBottom: 14 }}>
        招待を読み取りました。どちらかを選んでください。
      </div>

      <LineButton />

      <div className="ordiv"><span>または</span></div>

      <button type="button" className="btn wide" disabled={busy || going} onClick={() => void plain()}>
        このまま入る（いちばん速い）
      </button>
      <div className="hint" style={{ marginTop: 6 }}>
        この端末だけの入り方です。<b>ブラウザのデータを消したり、機種を変えたりすると入り直し</b>になり、
        オーナーに QR を出し直してもらうことになります。
      </div>
    </BottomSheet>
  );
}
