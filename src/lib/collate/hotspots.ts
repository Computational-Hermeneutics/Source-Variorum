/**
 * Version hotspots (a ShakerVis / Eddy-Viv style aggregate).
 *
 * For a project with N witnesses and a chosen base (the left / copy-text), this
 * collates the base against **each** other witness and counts, for every
 * character of the base text, how many witnesses diverge there. The result is a
 * per-base-position frequency — high where many versions disagree (a "hotspot"),
 * low where they agree (stable text). This is Juxta's filter-set / histogram
 * model: pairwise-vs-base collations aggregated at read time, no N-way engine.
 */

import { collate } from "./collate";
import type { Collation } from "@/types/collation";
import { comparableWitnesses } from "@/types/collation";
import type { NormalizeOptions } from "./similarity";

export interface Hotspots {
  /** freq[i] = number of (non-base) witnesses that diverge at base character i. */
  freq: Float64Array;
  /** Number of other witnesses compared against the base. */
  others: number;
  baseLength: number;
}

export function computeHotspots(c: Collation, normalize: NormalizeOptions): Hotspots {
  const base = c.witnesses.find((w) => w.id === c.leftId) ?? c.witnesses[0];
  const baseLength = base?.text.length ?? 0;
  const freq = new Float64Array(baseLength);
  if (!base) return { freq, others: 0, baseLength };
  // All analysis works on the Witnesses (comparable) set; reference sources are
  // not part of the comparison and would otherwise diverge everywhere.
  const others = comparableWitnesses(c.witnesses).filter((w) => w.id !== base.id);
  for (const w of others) {
    const variants = collate(base, w, { mode: c.mode, normalize });
    for (const v of variants) {
      // Only loci that touch the base text contribute (additions exist only in
      // the other witness and have no base position).
      if (v.type === "match" || !v.a) continue;
      const end = Math.min(v.a.end, baseLength);
      for (let i = v.a.start; i < end; i++) freq[i] += 1;
    }
  }
  return { freq, others: others.length, baseLength };
}
