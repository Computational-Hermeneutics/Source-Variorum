"use client";

import type { Variant, VariantType } from "@/types/collation";
import { VARIANT_TYPE_COLORS } from "@/types/collation";

export interface Ribbon {
  id: string;
  type: VariantType;
  /** Vertical centre of the A-span, in gutter coordinates. */
  yA: number;
  /** Vertical centre of the B-span, in gutter coordinates. */
  yB: number;
  /** Variant length, for stroke thickness. */
  length: number;
}

/** Map a variant length to a stroke width. Matches stay hairline; larger moved
 *  or substituted blocks read as thicker bands, as in the original braid. */
function thickness(type: VariantType, length: number, maxLength: number): number {
  if (type === "match") return 1.5;
  const scaled = 2 + Math.sqrt(length / Math.max(1, maxLength)) * 9;
  return Math.min(12, scaled);
}

export function BraidGutter({
  width,
  height,
  ribbons,
  maxLength,
  selectedId,
  hoveredId,
  visibleTypes,
  onSelect,
  onHover,
}: {
  width: number;
  height: number;
  ribbons: Ribbon[];
  maxLength: number;
  selectedId: string | null;
  hoveredId: string | null;
  visibleTypes: Set<VariantType>;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  const anySelected = selectedId !== null;
  // Draw matches first (underneath), then changes, then the active ribbon on top.
  const sorted = [...ribbons].sort((a, b) => {
    const score = (r: Ribbon) =>
      (r.id === selectedId ? 3 : 0) + (r.id === hoveredId ? 2 : 0) + (r.type === "match" ? 0 : 1);
    return score(a) - score(b);
  });

  return (
    <svg
      width={width}
      height={height}
      className="block"
      style={{ overflow: "visible" }}
    >
      {sorted.map((r) => {
        if (!visibleTypes.has(r.type)) return null;
        const color = VARIANT_TYPE_COLORS[r.type];
        const active = r.id === selectedId || r.id === hoveredId;
        const w = thickness(r.type, r.length, maxLength) * (active ? 1.6 : 1);
        const cx = width / 2;
        const d = `M 0 ${r.yA} C ${cx} ${r.yA} ${cx} ${r.yB} ${width} ${r.yB}`;
        // When a variant is selected, fade everything else right back so the one
        // being worked on stands alone; otherwise matches stay faint, changes mid.
        const opacity = anySelected
          ? active
            ? 0.95
            : 0.05
          : active
            ? 0.95
            : r.type === "match"
              ? 0.16
              : 0.6;
        return (
          <path
            key={r.id}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={w}
            strokeLinecap="round"
            opacity={opacity}
            style={{ cursor: r.type === "match" ? "default" : "pointer", transition: "opacity 120ms, stroke-width 120ms" }}
            onMouseEnter={() => onHover(r.id)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onSelect(r.id === selectedId ? null : r.id)}
          />
        );
      })}
    </svg>
  );
}
