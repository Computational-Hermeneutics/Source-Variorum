/**
 * Stemma / distance tree — a computational *stemma codicum*.
 *
 * Builds an N×N dissimilarity matrix over the comparable witnesses (1 − Sørensen–
 * Dice over character bigrams on the normalised text, the same primitive the
 * engine and Eddy use), then agglomerates them into a rooted distance tree by
 * UPGMA (average-linkage hierarchical clustering). The tree groups witnesses that
 * read alike and, for an ordered version lineage like Spacewar! 1962–63,
 * approximates the descent of the text. Cheap: each profile is built once, then
 * compared pairwise.
 */

import type { Collation, Witness } from "@/types/collation";
import { comparableWitnesses } from "@/types/collation";
import { normalize, type NormalizeOptions } from "./similarity";

export interface StemmaLeaf { kind: "leaf"; id: string; siglum: string; title: string; height: number; size: number }
export interface StemmaInternal { kind: "node"; height: number; size: number; children: [StemmaNode, StemmaNode] }
export type StemmaNode = StemmaLeaf | StemmaInternal;

export interface Stemma {
  root: StemmaNode | null;
  /** Witnesses in their original order, for the matrix axes. */
  labels: { id: string; siglum: string; title: string }[];
  /** N×N dissimilarity matrix (0 = identical, 1 = no shared bigrams). */
  matrix: number[][];
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
  small.forEach((c, g) => { inter += Math.min(c, large.get(g) ?? 0); });
  const denom = sizeA + sizeB;
  return denom > 0 ? (2 * inter) / denom : 0;
}

/** The full pairwise dissimilarity matrix over the comparable witnesses. */
export function distanceMatrix(witnesses: Witness[], normOpts: NormalizeOptions): { ws: Witness[]; matrix: number[][] } {
  const ws = comparableWitnesses(witnesses);
  const profiles = ws.map((w) => {
    const bg = bigrams(normalize(w.text, normOpts));
    let size = 0; bg.forEach((n) => (size += n));
    return { bg, size };
  });
  const n = ws.length;
  const matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = 1 - dice(profiles[i].bg, profiles[i].size, profiles[j].bg, profiles[j].size);
      matrix[i][j] = d; matrix[j][i] = d;
    }
  }
  return { ws, matrix };
}

/** Build the stemma: distance matrix + UPGMA tree. */
export function computeStemma(c: Collation, normOpts: NormalizeOptions): Stemma {
  const { ws, matrix } = distanceMatrix(c.witnesses, normOpts);
  const labels = ws.map((w) => ({ id: w.id, siglum: w.siglum, title: w.title }));
  if (ws.length < 2) return { root: null, labels, matrix };

  // UPGMA: each cluster keeps its node, member count, and a live distance row.
  interface Cluster { node: StemmaNode; n: number }
  const clusters: (Cluster | null)[] = ws.map((w, i): Cluster => ({
    node: { kind: "leaf", id: w.id, siglum: w.siglum, title: w.title, height: 0, size: 1 },
    n: 1,
  }));
  // Working copy of the distance matrix (mutated as clusters merge).
  const d = matrix.map((row) => row.slice());
  let active = ws.length;

  while (active > 1) {
    // Find the closest pair of active clusters.
    let bi = -1, bj = -1, best = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      if (!clusters[i]) continue;
      for (let j = i + 1; j < clusters.length; j++) {
        if (!clusters[j]) continue;
        if (d[i][j] < best) { best = d[i][j]; bi = i; bj = j; }
      }
    }
    const ci = clusters[bi]!, cj = clusters[bj]!;
    const merged: Cluster = {
      node: { kind: "node", height: best / 2, size: ci.n + cj.n, children: [ci.node, cj.node] },
      n: ci.n + cj.n,
    };
    // Average-linkage update: distance from the merged cluster to every other.
    for (let k = 0; k < clusters.length; k++) {
      if (k === bi || k === bj || !clusters[k]) continue;
      const nd = (ci.n * d[bi][k] + cj.n * d[bj][k]) / (ci.n + cj.n);
      d[bi][k] = nd; d[k][bi] = nd;
    }
    clusters[bi] = merged;
    clusters[bj] = null;
    active--;
  }

  const root = clusters.find((c2) => c2)!.node;
  return { root, labels, matrix };
}
