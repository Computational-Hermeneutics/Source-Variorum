/**
 * Editor-made manual links (Advanced mode).
 *
 * Auto-collation is imperfect for divergent witnesses; in Advanced mode the
 * editor links passages by hand and assigns the relationship. A manual link
 * overrides the auto output wherever it overlaps: any auto variant touching the
 * link's spans is dropped, and the manual link becomes a (manual) variant. The
 * scholar's hand-collation always wins.
 */

import type { ManualLink, Variant, Witness } from "@/types/collation";
import { spanAt } from "./tokenize";
import { similarity } from "./similarity";

/** Key under which a pair's manual links are stored. Order matters (left = base). */
export function pairKey(leftId: string, rightId: string): string {
  return `${leftId}|${rightId}`;
}

/** A manual variant's id encodes its source link id so the apparatus can unlink it. */
export const MANUAL_PREFIX = "manual:";
export function linkIdOf(variantId: string): string | null {
  return variantId.startsWith(MANUAL_PREFIX) ? variantId.slice(MANUAL_PREFIX.length) : null;
}

function buildManualVariant(link: ManualLink, a: Witness, b: Witness): Variant {
  const aSpan = link.a ? spanAt(a.text, link.a.start, link.a.end) : undefined;
  const bSpan = link.b ? spanAt(b.text, link.b.start, link.b.end) : undefined;
  const textA = aSpan ? a.text.slice(aSpan.start, aSpan.end) : "";
  const textB = bSpan ? b.text.slice(bSpan.start, bSpan.end) : "";
  return {
    id: `${MANUAL_PREFIX}${link.id}`,
    type: link.type,
    a: aSpan,
    b: bSpan,
    textA,
    textB,
    length: Math.max(textA.length, textB.length),
    similarity: textA && textB ? similarity(textA, textB) : 0,
    manual: true,
  };
}

const overlaps = (
  s1?: { start: number; end: number },
  s2?: { start: number; end: number }
): boolean => !!s1 && !!s2 && s1.start < s2.end && s2.start < s1.end;

/** Merge manual links over the auto variants: drop overlapping auto variants,
 *  add the manual ones, re-sort top-to-bottom. */
export function applyManualLinks(auto: Variant[], links: ManualLink[], a: Witness, b: Witness): Variant[] {
  if (links.length === 0) return auto;
  const survivors = auto.filter(
    (v) => !links.some((l) => overlaps(v.a, l.a) || overlaps(v.b, l.b))
  );
  const manual = links.map((l) => buildManualVariant(l, a, b));
  const all = [...survivors, ...manual];
  all.sort((x, y) => {
    const ax = x.a ? x.a.start : Number.POSITIVE_INFINITY;
    const ay = y.a ? y.a.start : Number.POSITIVE_INFINITY;
    if (ax !== ay) return ax - ay;
    return (x.b ? x.b.start : 0) - (y.b ? y.b.start : 0);
  });
  return all;
}
