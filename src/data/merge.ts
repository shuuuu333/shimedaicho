/** クラウドと端末のマージ（日単位）。
 *  remote を土台に、この端末で変えた日（dirtyDays）と設定・キャスト・バック（dirtyMeta）だけを local から重ねる。 */
import type { Ledger } from "../domain/types";

export interface Dirty { days: Set<string>; meta: boolean }

export function emptyDirty(): Dirty { return { days: new Set(), meta: false }; }

/** immer の構造共有を利用して、変わった日と設定を検出する */
export function diffDirty(prev: Ledger, next: Ledger, into: Dirty): Dirty {
  if (prev === next) return into;
  if (prev.shop !== next.shop || prev.casts !== next.casts || prev.backItems !== next.backItems) into.meta = true;
  if (prev.days !== next.days) {
    for (const k of Object.keys(next.days)) if (prev.days[k] !== next.days[k]) into.days.add(k);
    for (const k of Object.keys(prev.days)) if (!(k in next.days)) into.days.add(k);
  }
  return into;
}

export function mergeLedger(remote: Ledger, local: Ledger, dirty: Dirty): Ledger {
  const out: Ledger = {
    v: 3,
    shop: dirty.meta ? local.shop : remote.shop,
    casts: dirty.meta ? local.casts : remote.casts,
    backItems: dirty.meta ? local.backItems : remote.backItems,
    days: { ...remote.days },
  };
  for (const k of dirty.days) {
    if (k in local.days) out.days[k] = local.days[k];
    else delete out.days[k];
  }
  return out;
}

export function serializeDirty(d: Dirty): string { return JSON.stringify({ days: [...d.days], meta: d.meta }); }
export function parseDirty(s: string | null): Dirty {
  if (!s) return emptyDirty();
  try {
    const j = JSON.parse(s) as { days?: unknown; meta?: unknown };
    return { days: new Set(Array.isArray(j.days) ? j.days.filter((x): x is string => typeof x === "string") : []), meta: !!j.meta };
  } catch { return emptyDirty(); }
}
