import { useEffect, useState } from "react";

interface BIPEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

/** 設定の「ホーム画面に入れる」案内。すでにアプリとして開いていれば出さない。 */
export function InstallCard() {
  const [prompt, setPrompt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as BIPEvent); };
    const onInstalled = () => { setInstalled(true); setDone(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <div className="card" id="set-install">
        <h2>アプリとして使う</h2>
        <div className="lrow" style={{ borderBottom: 0 }}>
          <div className="g"><div className="t">ホーム画面から開いています</div>
            <div className="s">{done ? "追加できました。" : ""}アドレス欄のない全画面で動いています</div></div>
          <span className="pill ok">導入済み</span>
        </div>
      </div>
    );
  }

  return (
    <div className="card" id="set-install">
      <h2>アプリとして使う</h2>
      <p className="sub">ホーム画面に入れると、アイコンから全画面で開けます。電波がなくても入力できます。</p>
      {prompt ? (
        <button type="button" className="btn primary wide" style={{ minHeight: 50 }}
          onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }}>
          ホーム画面に追加する
        </button>
      ) : isIOS() ? (
        <>
          <div className="lrow"><div className="g"><div className="t">1. 画面の下にある共有ボタンを押す</div>
            <div className="s">四角から上向きの矢印が出ているマーク</div></div></div>
          <div className="lrow"><div className="g"><div className="t">2.「ホーム画面に追加」を選ぶ</div>
            <div className="s">一覧を下にスクロールすると出てきます</div></div></div>
          <div className="lrow" style={{ borderBottom: 0 }}><div className="g"><div className="t">3.「追加」を押す</div>
            <div className="s">ホーム画面に締め台帳のアイコンが並びます</div></div></div>
          <div className="hint">Safari で開いているときだけ追加できます。ほかのブラウザで見ている場合は Safari で開き直してください。</div>
        </>
      ) : (
        <>
          <div className="lrow"><div className="g"><div className="t">1. ブラウザのメニューを開く</div>
            <div className="s">右上か右下の点が3つ並んだマーク</div></div></div>
          <div className="lrow" style={{ borderBottom: 0 }}><div className="g"><div className="t">2.「アプリをインストール」または「ホーム画面に追加」を選ぶ</div>
            <div className="s">端末によって呼び方が変わります</div></div></div>
        </>
      )}
    </div>
  );
}
