/**
 * The derived VIEW: variants + apparatus + metrics for the open witness pair.
 *
 * Kept separate from `collation-export.ts` so it can be imported by a Web Worker
 * WITHOUT dragging in jsPDF (which touches the DOM and would throw at module
 * load inside a worker). The main thread and the worker both compute the view
 * through this one function, so they always agree.
 */

import type { Collation, Witness } from "@/types/collation";
import { variantSignature, suppressSteps } from "@/types/collation";
import { collate } from "./collate";
import type { NormalizeOptions } from "./similarity";
import { buildApparatus } from "./apparatus";
import { computeCollationMetrics } from "./metrics";
import { applyManualLinks, pairKey } from "./manual";

/** Engine knobs beyond the normalize options + move toggle. */
export interface DeriveExtra {
  segmentByLine?: boolean;
  ignoreBlankLines?: boolean;
  subThreshold?: number;
}

/** The two witnesses the braid currently compares (the panel selections). */
export function pairOf(c: Collation): [Witness, Witness] {
  const a = c.witnesses.find((w) => w.id === c.leftId) ?? c.witnesses[0];
  const b =
    c.witnesses.find((w) => w.id === c.rightId) ??
    c.witnesses.find((w) => w.id !== a.id) ??
    c.witnesses[1] ??
    a;
  return [a, b];
}

/** Recompute the full derived view (variants + apparatus + metrics) from a
 *  collation. `normalize` carries the active engine settings; `detectMoves`
 *  toggles transposition recovery; `extra` carries the rest. */
export function deriveView(
  c: Collation,
  normalize?: NormalizeOptions,
  detectMoves?: boolean,
  extra?: DeriveExtra,
) {
  const [a, b] = pairOf(c);
  let variants = collate(a, b, {
    mode: c.mode,
    ...(normalize ? { normalize } : {}),
    ...(detectMoves !== undefined ? { detectMoves } : {}),
    ...(extra?.segmentByLine !== undefined ? { segmentByLine: extra.segmentByLine } : {}),
    ...(extra?.ignoreBlankLines !== undefined ? { ignoreBlankLines: extra.ignoreBlankLines } : {}),
    ...(extra?.subThreshold !== undefined ? { subThreshold: extra.subThreshold } : {}),
  });
  const links = c.manualLinks?.[pairKey(c.leftId, c.rightId)] ?? [];
  if (links.length) variants = applyManualLinks(variants, links, a, b);
  // Editorial overrides: re-type, delete, or confirm individual braids. Applied
  // after auto-collation + manual links so the editor always has the last word.
  const ov = c.variantOverrides;
  if (ov && Object.keys(ov).length) {
    variants = variants.flatMap((v) => {
      const o = ov[variantSignature(v)];
      if (!o) return [v];
      if (o.deleted) return [];
      const supp = suppressSteps(o);
      if (!o.type && !o.confirmed && !supp && !o.tentative) return [v];
      return [{
        ...v,
        ...(o.type ? { type: o.type } : {}),
        ...(o.confirmed ? { similarity: 1, confirmed: true } : supp ? { similarity: Math.max(0, v.similarity - 0.25 * supp) } : {}),
        ...(o.tentative ? { tentative: true } : {}),
      }];
    });
  }
  const apparatus = buildApparatus(variants, a, b, c);
  const metrics = computeCollationMetrics(variants, a, b);
  return { a, b, variants, apparatus, metrics };
}

export type DerivedView = ReturnType<typeof deriveView>;
