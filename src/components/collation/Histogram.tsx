"use client";

import { useMemo } from "react";
import type { Variant, VariantType } from "@/types/collation";
import { VARIANT_TYPE_COLORS } from "@/types/collation";

/**
 * Juxta-style global change-overview strip. A compact bar over the whole base
 * text (witness A) showing, per region, how much variation there is — so you can
 * see at a glance where the witnesses diverge most. Each bucket's height is the
 * summed length of non-match variants in that span; its colour is the dominant
 * variant type there. Clicking a bucket jumps to (and selects) the nearest
 * variant. The selected locus is marked with a vertical line.
 */
const BUCKETS = 240;
const H = 30; // svg height (viewBox units)
const PAD = 2;

export function Histogram({
  variants,
  baseLength,
  visibleTypes,
  selectedId,
  onSelect,
}: {
  variants: Variant[];
  baseLength: number;
  visibleTypes: Set<VariantType>;
  selectedId: string | null;
  onSelect: (id: string, scroll?: boolean) => void;
}) {
  const { bars, navPoints, selectedX } = useMemo(() => {
    const intensity = new Float64Array(BUCKETS);
    const typeOf = new Array<VariantType | null>(BUCKETS).fill(null);
    const typeWeight = new Float64Array(BUCKETS);
    const navPoints: { pos: number; id: string }[] = [];
    const len = Math.max(1, baseLength);
    let lastAEnd = 0;
    let selPos: number | null = null;
    for (const v of variants) {
      const anchor = v.a ? v.a.start : lastAEnd;
      if (v.a) lastAEnd = v.a.end;
      if (v.type === "match" || !visibleTypes.has(v.type)) continue;
      navPoints.push({ pos: anchor, id: v.id });
      if (v.id === selectedId) selPos = anchor;
      const s = v.a ? v.a.start : anchor;
      const e = v.a ? v.a.end : anchor + 1;
      const w = Math.max(1, e - s);
      const bs = Math.max(0, Math.floor((s / len) * BUCKETS));
      const be = Math.min(BUCKETS - 1, Math.floor((e / len) * BUCKETS));
      const span = Math.max(1, be - bs + 1);
      for (let i = bs; i <= be; i++) {
        intensity[i] += w / span;
        if (w > typeWeight[i]) {
          typeWeight[i] = w;
          typeOf[i] = v.type;
        }
      }
    }
    let max = 0;
    for (const x of intensity) if (x > max) max = x;
    max = max || 1;
    const bars = Array.from(intensity, (val, i) => ({
      h: (val / max) * (H - PAD * 2),
      color: typeOf[i] ? VARIANT_TYPE_COLORS[typeOf[i]!] : "transparent",
    }));
    navPoints.sort((a, b) => a.pos - b.pos);
    const selectedX = selPos == null ? null : (selPos / len) * BUCKETS;
    return { bars, navPoints, selectedX };
  }, [variants, baseLength, visibleTypes, selectedId]);

  if (baseLength === 0 || navPoints.length === 0) return null;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const pos = frac * baseLength;
    let best: string | null = null;
    let bd = Infinity;
    for (const p of navPoints) {
      const d = Math.abs(p.pos - pos);
      if (d < bd) {
        bd = d;
        best = p.id;
      }
    }
    if (best) onSelect(best, true);
  };

  return (
    <div className="px-3 py-1 border-b border-border bg-card/30 flex items-center gap-2">
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground shrink-0" title="Where the witnesses diverge across the base text (witness A). Click to jump.">Change&nbsp;overview</span>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={handleClick} title="Click to jump to the nearest variant">
        <svg viewBox={`0 0 ${BUCKETS} ${H}`} preserveAspectRatio="none" className="w-full h-6 block">
          <rect x={0} y={0} width={BUCKETS} height={H} className="fill-muted/30" />
          {bars.map((b, i) =>
            b.h > 0 ? <rect key={i} x={i} y={H - PAD - b.h} width={1} height={b.h} fill={b.color} opacity={0.85} /> : null
          )}
          {selectedX != null && <rect x={Math.max(0, selectedX - 0.5)} y={0} width={1.5} height={H} className="fill-foreground" opacity={0.7} />}
        </svg>
      </div>
    </div>
  );
}
