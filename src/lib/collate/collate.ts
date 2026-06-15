/**
 * The collation engine.
 *
 * Pipeline: segment both witnesses → align by exact (normalised) equality to get
 * the in-order backbone → within replacement blocks, pair leftovers by similarity
 * to type substitutions and near-identical VARIANTs → globally re-pair the
 * remaining additions/deletions to recover TRANSPOSITIONS (moved text, the
 * analytical payload) → merge contiguous same-type runs into block variants for
 * clean ribbons → emit a sorted `Variant[]`.
 *
 * Pure and deterministic: same inputs always yield the same variants (no clocks,
 * no randomness), so the output can drive the braid, the apparatus, and the
 * metrics identically and be snapshotted in saved collations.
 */

import { diffArrays, diffWords } from "diff";
import type { Span, Variant, VariantType, WordRun, Witness } from "@/types/collation";
import { segment, type Segment } from "./tokenize";
import { isMatch, similarity, normalize, DEFAULT_NORMALIZE, type NormalizeOptions } from "./similarity";
import type { CollationMode } from "@/types/collation";

export interface CollateOptions {
  mode: CollationMode;
  /** Minimum similarity for two displaced blocks to count as a move. */
  moveThreshold: number;
  /** Same-locus pairs at or above this similarity are typed VARIANT (near-identical),
   *  below it SUBSTITUTION (a genuinely different reading). */
  variantThreshold: number;
  /** Normalised-character floor below which a block is too short to call a move. */
  minMoveLength: number;
  /** Min similarity to pair two residual blocks as a substitution (Needleman–
   *  Wunsch residue pass). Lower than moveThreshold: corresponding sentences in
   *  two translations can read very differently yet still be the "same" locus. */
  subThreshold: number;
  /** Normalisation (which trivial differences to ignore when matching). */
  normalize: NormalizeOptions;
  /** Recover relocated blocks as TRANSPOSITIONS (the move-detection pass). When
   *  off, displaced text falls through to plain addition/deletion — a tighter,
   *  more literal braid. Default on. */
  detectMoves: boolean;
}

export const DEFAULT_OPTIONS: CollateOptions = {
  mode: "text",
  moveThreshold: 0.7,
  variantThreshold: 0.85,
  minMoveLength: 12,
  subThreshold: 0.2,
  normalize: DEFAULT_NORMALIZE,
  detectMoves: true,
};

/**
 * Mode-aware matching profile. Code is "almost 1-to-1": lines correspond closely,
 * so the braid should read LITERALLY — only pair leftover lines that are genuinely
 * alike (a renamed label, a changed operand), and otherwise call a clean
 * addition/deletion; require near-identical blocks to count as a move. Prose is
 * discourse: the "same" sentence is routinely rephrased, so the TEXT profile pairs
 * much more loosely (low subThreshold) and accepts fuzzier moves — the braid has
 * to be smarter because correspondence is semantic, not positional.
 */
export const MODE_PROFILE: Record<CollationMode, Pick<CollateOptions, "moveThreshold" | "variantThreshold" | "minMoveLength" | "subThreshold">> = {
  source: { moveThreshold: 0.82, variantThreshold: 0.82, minMoveLength: 8, subThreshold: 0.5 },
  text: { moveThreshold: 0.7, variantThreshold: 0.85, minMoveLength: 12, subThreshold: 0.2 },
};

function spanOf(run: Segment[]): Span {
  const first = run[0];
  const last = run[run.length - 1];
  return {
    start: first.start,
    end: last.end,
    startLine: first.startLine,
    endLine: last.endLine,
  };
}

function textOf(run: Segment[]): string {
  return run.map((s) => s.text).join("");
}

/** A typed pairing produced during the walk, before merging and id assignment. */
interface RawVariant {
  type: VariantType;
  aRun?: Segment[];
  bRun?: Segment[];
  similarity: number;
}

/**
 * Greedily pair the segments of a replacement block (removed run vs added run)
 * by best similarity. Returns substitution/variant pairings plus the leftover
 * removed/added segments that found no partner.
 */
function pairReplacementBlock(
  removed: Segment[],
  added: Segment[],
  opts: CollateOptions
): { pairs: RawVariant[]; leftRemoved: Segment[]; leftAdded: Segment[] } {
  const pairs: RawVariant[] = [];
  const usedAdded = new Set<number>();
  const leftRemoved: Segment[] = [];

  for (const r of removed) {
    let best = -1;
    let bestSim = 0;
    for (let j = 0; j < added.length; j++) {
      if (usedAdded.has(j)) continue;
      const sim = similarity(r.text, added[j].text, opts.normalize);
      if (sim > bestSim) {
        bestSim = sim;
        best = j;
      }
    }
    // Pair only if there is some real overlap; otherwise this is a pure deletion.
    if (best >= 0 && bestSim >= 0.3) {
      usedAdded.add(best);
      const type: VariantType = bestSim >= opts.variantThreshold ? "variant" : "substitution";
      pairs.push({ type, aRun: [r], bRun: [added[best]], similarity: bestSim });
    } else {
      leftRemoved.push(r);
    }
  }

  const leftAdded = added.filter((_, j) => !usedAdded.has(j));
  return { pairs, leftRemoved, leftAdded };
}

/**
 * Re-pair displaced deletions and additions into transpositions. Longest
 * deletions first (so a big moved block claims its partner before a fragment
 * does); a pairing is accepted only above `moveThreshold` and `minMoveLength`.
 */
function detectMoves(
  dels: Segment[][],
  adds: Segment[][],
  opts: CollateOptions
): { moves: RawVariant[]; leftDels: Segment[][]; leftAdds: Segment[][] } {
  const moves: RawVariant[] = [];
  const usedAdd = new Set<number>();

  const order = dels
    .map((run, i) => ({ i, len: normalize(textOf(run), opts.normalize).length }))
    .filter((d) => d.len >= opts.minMoveLength)
    .sort((x, y) => y.len - x.len);

  const usedDel = new Set<number>();
  for (const { i } of order) {
    const delText = textOf(dels[i]);
    let best = -1;
    let bestSim = opts.moveThreshold;
    for (let j = 0; j < adds.length; j++) {
      if (usedAdd.has(j)) continue;
      if (normalize(textOf(adds[j]), opts.normalize).length < opts.minMoveLength) continue;
      const sim = similarity(delText, textOf(adds[j]), opts.normalize);
      if (sim >= bestSim) {
        bestSim = sim;
        best = j;
      }
    }
    if (best >= 0) {
      usedDel.add(i);
      usedAdd.add(best);
      moves.push({
        type: "transposition",
        aRun: dels[i],
        bRun: adds[best],
        similarity: bestSim,
      });
    }
  }

  const leftDels = dels.filter((_, i) => !usedDel.has(i));
  const leftAdds = adds.filter((_, j) => !usedAdd.has(j));
  return { moves, leftDels, leftAdds };
}

/**
 * Needleman–Wunsch over the residual deletion/addition runs (those the exact
 * backbone and move detection didn't pair). Monotonic — preserves order, so it
 * can't cross-link wildly — but pairs corresponding-yet-differently-worded
 * blocks as SUBSTITUTIONs above `subThreshold`. This is what catches cases like
 * a translation's "O noble Lysias" against "O that is noble of him" that the
 * exact diff leaves as a separate omission + addition.
 */
function pairResidue(
  dels: Segment[][],
  adds: Segment[][],
  opts: CollateOptions
): { subs: RawVariant[]; leftDels: Segment[][]; leftAdds: Segment[][] } {
  const n = dels.length;
  const m = adds.length;
  if (n === 0 || m === 0) return { subs: [], leftDels: dels, leftAdds: adds };

  const delText = dels.map(textOf);
  const addText = adds.map(textOf);
  const GAP = -0.1;
  // Score for aligning del i with add j: similarity if it clears the bar, else
  // a small penalty so the DP prefers a gap over a meaningless pairing.
  const simCache = new Map<number, number>();
  const score = (i: number, j: number): number => {
    const key = i * m + j;
    let s = simCache.get(key);
    if (s === undefined) {
      // Cheap length-ratio prune before the bigram work.
      const la = delText[i].length || 1;
      const lb = addText[j].length || 1;
      s = Math.max(la, lb) / Math.min(la, lb) > 6 ? 0 : similarity(delText[i], addText[j], opts.normalize);
      simCache.set(key, s);
    }
    return s >= opts.subThreshold ? s : -0.25;
  };

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) dp[i][0] = dp[i - 1][0] + GAP;
  for (let j = 1; j <= m; j++) dp[0][j] = dp[0][j - 1] + GAP;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.max(dp[i - 1][j - 1] + score(i - 1, j - 1), dp[i - 1][j] + GAP, dp[i][j - 1] + GAP);
    }
  }

  const subs: RawVariant[] = [];
  const usedDel = new Set<number>();
  const usedAdd = new Set<number>();
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (dp[i][j] === dp[i - 1][j - 1] + score(i - 1, j - 1)) {
      const sim = simCache.get((i - 1) * m + (j - 1)) ?? 0;
      if (sim >= opts.subThreshold) {
        subs.push({
          type: sim >= opts.variantThreshold ? "variant" : "substitution",
          aRun: dels[i - 1],
          bRun: adds[j - 1],
          similarity: sim,
        });
        usedDel.add(i - 1);
        usedAdd.add(j - 1);
      }
      i--;
      j--;
    } else if (dp[i][j] === dp[i - 1][j] + GAP) {
      i--;
    } else {
      j--;
    }
  }

  return {
    subs,
    leftDels: dels.filter((_, k) => !usedDel.has(k)),
    leftAdds: adds.filter((_, k) => !usedAdd.has(k)),
  };
}

/** Merge contiguous same-type runs (match/addition/deletion) into block variants. */
function mergeRuns(raw: RawVariant[]): RawVariant[] {
  const merged: RawVariant[] = [];
  for (const v of raw) {
    const prev = merged[merged.length - 1];
    const mergeable = v.type === "match" || v.type === "addition" || v.type === "deletion";
    if (
      prev &&
      mergeable &&
      prev.type === v.type &&
      contiguous(prev.aRun, v.aRun) &&
      contiguous(prev.bRun, v.bRun)
    ) {
      prev.aRun = concatRuns(prev.aRun, v.aRun);
      prev.bRun = concatRuns(prev.bRun, v.bRun);
      prev.similarity = Math.min(prev.similarity, v.similarity);
    } else {
      merged.push({ ...v });
    }
  }
  return merged;
}

function contiguous(a?: Segment[], b?: Segment[]): boolean {
  if (!a && !b) return true;
  if (!a || !b) return a === b; // both must be absent to be contiguous
  return a[a.length - 1].index + 1 === b[0].index;
}

function concatRuns(a?: Segment[], b?: Segment[]): Segment[] | undefined {
  if (!a) return b;
  if (!b) return a;
  return [...a, ...b];
}

/** Group segments into maximal runs of consecutive original indices. */
function coalesce(segs: Segment[]): Segment[][] {
  const sorted = [...segs].sort((a, b) => a.index - b.index);
  const runs: Segment[][] = [];
  for (const s of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1].index + 1 === s.index) last.push(s);
    else runs.push([s]);
  }
  return runs;
}

export function collate(
  witnessA: Witness,
  witnessB: Witness,
  options: Partial<CollateOptions> & { mode: CollationMode }
): Variant[] {
  // Base defaults < mode profile (literal for code, smart for prose) < explicit.
  const opts: CollateOptions = { ...DEFAULT_OPTIONS, ...MODE_PROFILE[options.mode], ...options };
  const segsA = segment(witnessA.text, opts.mode);
  const segsB = segment(witnessB.text, opts.mode);

  const keysA = segsA.map((s) => normalize(s.text, opts.normalize));
  const keysB = segsB.map((s) => normalize(s.text, opts.normalize));

  const changes = diffArrays(keysA, keysB);

  const raw: RawVariant[] = [];
  // Displaced segments accumulate flat, then coalesce into contiguous runs so a
  // relocated BLOCK (header + body) is one move candidate, not several fragments.
  const delSegs: Segment[] = [];
  const addSegs: Segment[] = [];

  let iA = 0;
  let iB = 0;
  for (let p = 0; p < changes.length; p++) {
    const ch = changes[p];
    const count = ch.count ?? ch.value.length;

    if (!ch.added && !ch.removed) {
      // Unchanged backbone: emit one match per segment (merged into runs later).
      for (let k = 0; k < count; k++) {
        raw.push({
          type: "match",
          aRun: [segsA[iA + k]],
          bRun: [segsB[iB + k]],
          similarity: 1,
        });
      }
      iA += count;
      iB += count;
      continue;
    }

    if (ch.removed) {
      const removed = segsA.slice(iA, iA + count);
      iA += count;
      const next = changes[p + 1];
      if (next && next.added) {
        // Replacement block: pair by similarity, route leftovers to the pools.
        const added = segsB.slice(iB, iB + (next.count ?? next.value.length));
        iB += next.count ?? next.value.length;
        p++; // consume the paired added chunk
        const { pairs, leftRemoved, leftAdded } = pairReplacementBlock(removed, added, opts);
        raw.push(...pairs);
        delSegs.push(...leftRemoved);
        addSegs.push(...leftAdded);
      } else {
        delSegs.push(...removed);
      }
      continue;
    }

    if (ch.added) {
      const added = segsB.slice(iB, iB + count);
      iB += count;
      addSegs.push(...added);
    }
  }

  // Coalesce displaced segments into maximal contiguous runs, then recover
  // transpositions: a whole relocated block matches a whole block elsewhere.
  const delPool = coalesce(delSegs);
  const addPool = coalesce(addSegs);
  // Move detection is optional: with it off, displaced runs stay add/delete for a
  // tighter, more literal braid (useful in the CX-Engine for small code edits).
  const { moves, leftDels, leftAdds } = opts.detectMoves === false
    ? { moves: [] as RawVariant[], leftDels: delPool, leftAdds: addPool }
    : detectMoves(delPool, addPool, opts);
  raw.push(...moves);
  // Similarity-aware residue alignment: pair what's left into substitutions
  // before falling back to plain omission/addition.
  const residue = pairResidue(leftDels, leftAdds, opts);
  raw.push(...residue.subs);
  residue.leftDels.forEach((run) => raw.push({ type: "deletion", aRun: run, similarity: 0 }));
  residue.leftAdds.forEach((run) => raw.push({ type: "addition", bRun: run, similarity: 0 }));

  // Order by base (A) position, then by B position, so the braid and apparatus
  // read top-to-bottom down the base text. Additions (no A) sort by their B anchor.
  raw.sort((x, y) => {
    const ax = x.aRun ? x.aRun[0].start : Number.POSITIVE_INFINITY;
    const ay = y.aRun ? y.aRun[0].start : Number.POSITIVE_INFINITY;
    if (ax !== ay) return ax - ay;
    const bx = x.bRun ? x.bRun[0].start : 0;
    const by = y.bRun ? y.bRun[0].start : 0;
    return bx - by;
  });

  const merged = mergeRuns(raw);

  return merged.map((v, i): Variant => {
    const a = v.aRun ? spanOf(v.aRun) : undefined;
    const b = v.bRun ? spanOf(v.bRun) : undefined;
    const textA = v.aRun ? textOf(v.aRun) : "";
    const textB = v.bRun ? textOf(v.bRun) : "";
    // A match that survived as exact stays a match; guard against normalisation
    // having equated two visibly different strings (keep the verbatim check honest).
    let type = v.type;
    if (type === "match" && !isMatch(textA, textB, opts.normalize)) type = "substitution";
    const variant: Variant = {
      id: `v${i}`,
      type,
      a,
      b,
      textA,
      textB,
      length: Math.max(textA.length, textB.length),
      similarity: v.similarity,
    };
    // Word-level refinement: inside a substitution/variant locus, mark which
    // words actually differ so the renderer tints only those (the braid ribbon
    // still spans the whole locus). Only worth attaching when both sides exist
    // and there is at least one shared word to leave untinted.
    if ((type === "substitution" || type === "variant") && a && b) {
      const { aWords, bWords } = wordRuns(textA, textB, a.start, b.start);
      if (aWords.some((w) => !w.changed) || bWords.some((w) => !w.changed)) {
        variant.aWords = aWords;
        variant.bWords = bWords;
      }
    }
    return variant;
  });
}

/**
 * Word-level diff of a substitution/variant locus. Walks the jsdiff word changes
 * and emits absolute-offset runs for each side, flagging which words differ.
 * Removed words exist only in A, added only in B, common in both.
 */
function wordRuns(
  textA: string,
  textB: string,
  aStart: number,
  bStart: number
): { aWords: WordRun[]; bWords: WordRun[] } {
  const aWords: WordRun[] = [];
  const bWords: WordRun[] = [];
  let ca = aStart;
  let cb = bStart;
  for (const ch of diffWords(textA, textB)) {
    const len = ch.value.length;
    if (ch.added) {
      bWords.push({ start: cb, end: cb + len, changed: true });
      cb += len;
    } else if (ch.removed) {
      aWords.push({ start: ca, end: ca + len, changed: true });
      ca += len;
    } else {
      aWords.push({ start: ca, end: ca + len, changed: false });
      bWords.push({ start: cb, end: cb + len, changed: false });
      ca += len;
      cb += len;
    }
  }
  return { aWords, bWords };
}
