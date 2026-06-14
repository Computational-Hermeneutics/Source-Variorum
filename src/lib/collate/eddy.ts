/**
 * Per-version Eddy (a ShakerVis distinctiveness measure).
 *
 * Eddy(W) = the average distance between witness W and every other witness — a
 * version's *relative distinctiveness*. High Eddy marks an outlier whose wording
 * diverges most from the rest. VVV computes this on document vectors; we use the
 * same engine's Sørensen–Dice over character bigrams (1 − similarity) on the
 * normalised whole text, which is cheap (build each profile once, then compare
 * pairwise) and captures overall lexical distance.
 */

import type { Collation } from "@/types/collation";
import { normalize, type NormalizeOptions } from "./similarity";

export interface EddyRow {
  id: string;
  siglum: string;
  title: string;
  /** Mean distance (0–1) from all other witnesses; higher = more distinctive. */
  eddy: number;
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

function dice(a: Map<string, number>, sizeA: number, b: Map<string, number>, sizeB: number): number {
  if (sizeA === 0 && sizeB === 0) return 1;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  small.forEach((c, g) => {
    inter += Math.min(c, large.get(g) ?? 0);
  });
  const denom = sizeA + sizeB;
  return denom > 0 ? (2 * inter) / denom : 0;
}

export function computeEddy(c: Collation, normOpts: NormalizeOptions): EddyRow[] {
  const ws = c.witnesses;
  if (ws.length < 2) return [];
  const profiles = ws.map((w) => {
    const bg = bigrams(normalize(w.text, normOpts));
    let size = 0;
    bg.forEach((n) => (size += n));
    return { bg, size };
  });
  const rows: EddyRow[] = ws.map((w, i) => {
    let sum = 0;
    let n = 0;
    for (let j = 0; j < ws.length; j++) {
      if (i === j) continue;
      sum += 1 - dice(profiles[i].bg, profiles[i].size, profiles[j].bg, profiles[j].size);
      n++;
    }
    return { id: w.id, siglum: w.siglum, title: w.title, eddy: n ? sum / n : 0 };
  });
  rows.sort((a, b) => b.eddy - a.eddy);
  return rows;
}
