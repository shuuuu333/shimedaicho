/** 端末のロック。レジはカウンターに置かれてキャストも触るので、
 *  給料と利益が見える画面（設定・キャスト・今月）だけを 4 桁の暗証番号で隠す。
 *
 *  これは「うっかり見えてしまう」を防ぐためのもので、本気の攻撃には耐えない
 *  （端末のデータベースを直接開けば中身は読める）。役割による本当の制限は
 *  サーバー側（Supabase の RLS）が受け持つ。
 *
 *  番号そのものは保存せず、ハッシュだけを置く。解錠は sessionStorage なので、
 *  アプリを開き直すとまた聞かれる（同じ画面での再読み込みでは聞かれない）。 */

const LS_PIN = "shimedaicho.pin";
const SS_OPEN = "shimedaicho.unlocked";
/** 総当たりを少しでも遅くするための繰り返し */
const ROUNDS = 5000;

const enc = new TextEncoder();

async function hash(pin: string): Promise<string> {
  let buf = enc.encode("shimedaicho:" + pin).buffer as ArrayBuffer;
  for (let i = 0; i < ROUNDS; i++) buf = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const read = (k: string, store: Storage): string | null => {
  try { return store.getItem(k); } catch { return null; }
};
const write = (k: string, v: string | null, store: Storage): void => {
  try { if (v == null) store.removeItem(k); else store.setItem(k, v); } catch { /* ignore */ }
};

/** この端末に暗証番号が設定されているか */
export function hasPin(): boolean {
  return !!read(LS_PIN, localStorage);
}

/** 今このセッションで解錠済みか。設定していなければ常に解錠 */
export function isUnlocked(): boolean {
  if (!hasPin()) return true;
  return read(SS_OPEN, sessionStorage) === read(LS_PIN, localStorage);
}

/** 番号を設定する（4 桁以上の数字） */
export async function setPin(pin: string): Promise<void> {
  const h = await hash(pin);
  write(LS_PIN, h, localStorage);
  write(SS_OPEN, h, sessionStorage);
}

/** 解除する。今の番号が合っていることが要る */
export async function clearPin(current: string): Promise<boolean> {
  if (!(await verify(current))) return false;
  write(LS_PIN, null, localStorage);
  write(SS_OPEN, null, sessionStorage);
  return true;
}

/** 合っていれば解錠する */
export async function verify(pin: string): Promise<boolean> {
  const saved = read(LS_PIN, localStorage);
  if (!saved) return true;
  const ok = (await hash(pin)) === saved;
  if (ok) write(SS_OPEN, saved, sessionStorage);
  return ok;
}

/** 手動で閉じる（席を外すとき） */
export function lock(): void {
  write(SS_OPEN, null, sessionStorage);
}

/** 番号として使える形か */
export const validPin = (pin: string): boolean => /^\d{4,8}$/.test(pin);
