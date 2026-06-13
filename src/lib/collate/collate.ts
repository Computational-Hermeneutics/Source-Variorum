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

import { diffArrays } from "diff";
import type { Span, Variant, VariantType, Witness } from "@/types/collation";
import { segment, type Segment } from "./tokenize";
import { isMatch, similarity, normalize } from "./similarity";
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
}

export const DEFAULT_OPTIONS: CollateOptions = {
  mode: "text",
  moveThreshold: 0.7,
  variantThreshold: 0.85,
  minMoveLength: 12,
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
      const sim = similarity(r.text, added[j].text);
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
    .map((run, i) => ({ i, len: normalize(textOf(run)).length }))
    .filter((d) => d.len >= opts.minMoveLength)
    .sort((x, y) => y.len - x.len);

  const usedDel = new Set<number>();
  for (const { i } of order) {
    const delText = textOf(dels[i]);
    let best = -1;
    let bestSim = opts.moveThreshold;
    for (let j = 0; j < adds.length; j++) {
      if (usedAdd.has(j)) continue;
      if (normalize(textOf(adds[j])).length < opts.minMoveLength) continue;
      const sim = similarity(delText, textOf(adds[j]));
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
  const opts: CollateOptions = { ...DEFAULT_OPTIONS, ...options };
  const segsA = segment(witnessA.text, opts.mode);
  const segsB = segment(witnessB.text, opts.mode);

  const keysA = segsA.map((s) => normalize(s.text));
  const keysB = segsB.map((s) => normalize(s.text));

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
  const { moves, leftDels, leftAdds } = detectMoves(delPool, addPool, opts);
  raw.push(...moves);
  leftDels.forEach((run) => raw.push({ type: "deletion", aRun: run, similarity: 0 }));
  leftAdds.forEach((run) => raw.push({ type: "addition", bRun: run, similarity: 0 }));

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
    if (type === "match" && !isMatch(textA, textB)) type = "substitution";
    return {
      id: `v${i}`,
      type,
      a,
      b,
      textA,
      textB,
      length: Math.max(textA.length, textB.length),
      similarity: v.similarity,
    };
  });
}
