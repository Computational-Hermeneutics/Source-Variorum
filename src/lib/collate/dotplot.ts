/**
 * Dotplot / self-similarity matrix — the classic sequence-alignment view.
 *
 * Tokenises the two shown witnesses into ordered units (lines for code,
 * sentences for prose), then plots a point at (i, j) wherever unit i of A equals
 * unit j of B. A solid **diagonal** = a shared run in the same order; an
 * **off-diagonal** streak = a transposition (a block that moved) or an internal
 * repeat; **gaps** = insertions/deletions. Exact (normalised) unit equality, the
 * way a dotplot is meant to read. Ultra-common units (blank lines, `term`,
 * boilerplate) optionally filtered so the structure isn't drowned in noise.
 */

import type { CollationMode, Witness } from "@/types/collation";
import { normalize, type NormalizeOptions } from "./similarity";

export interface Dotplot {
  nA: number;
  nB: number;
  /** Flat match coordinates: [iA, jB, iA, jB, …]. */
  points: Int32Array;
  count: number;
  truncated: boolean;
  unitLabel: "lines" | "sentences";
}

const MAX_POINTS = 300_000;

function toUnits(text: string, mode: CollationMode, normOpts: NormalizeOptions): string[] {
  if (mode === "source") {
    return text.split("\n").map((l) => normalize(l, normOpts).trim());
  }
  const sents = text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [];
  return sents.map((s) => normalize(s, normOpts).trim());
}

export function computeDotplot(a: Witness, b: Witness, mode: CollationMode, normOpts: NormalizeOptions, hideCommon = true): Dotplot {
  const ua = toUnits(a.text, mode, normOpts);
  const ub = toUnits(b.text, mode, normOpts);
  const nA = ua.length, nB = ub.length;

  // Frequencies, to optionally suppress structural-noise units.
  const freqA = new Map<string, number>(), freqB = new Map<string, number>();
  for (const t of ua) if (t) freqA.set(t, (freqA.get(t) ?? 0) + 1);
  for (const t of ub) if (t) freqB.set(t, (freqB.get(t) ?? 0) + 1);
  const thrA = Math.max(6, Math.floor(nA * 0.01));
  const thrB = Math.max(6, Math.floor(nB * 0.01));
  const common = (t: string) => (freqA.get(t) ?? 0) > thrA || (freqB.get(t) ?? 0) > thrB;

  // Index A units by token (skipping blanks / common units when filtering).
  const byToken = new Map<string, number[]>();
  for (let i = 0; i < nA; i++) {
    const t = ua[i];
    if (!t || (hideCommon && common(t))) continue;
    const arr = byToken.get(t); if (arr) arr.push(i); else byToken.set(t, [i]);
  }

  const pts: number[] = [];
  let truncated = false;
  outer: for (let j = 0; j < nB; j++) {
    const t = ub[j];
    if (!t || (hideCommon && common(t))) continue;
    const hits = byToken.get(t);
    if (!hits) continue;
    for (const i of hits) {
      pts.push(i, j);
      if (pts.length >= MAX_POINTS * 2) { truncated = true; break outer; }
    }
  }

  return { nA, nB, points: Int32Array.from(pts), count: pts.length / 2, truncated, unitLabel: mode === "source" ? "lines" : "sentences" };
}
