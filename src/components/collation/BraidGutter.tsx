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
  /** Confidence that this pairing is correct, in [0,1] (see confidenceOf). */
  confidence: number;
}

/** Map a variant length to a stroke width. Matches stay hairline; larger moved
 *  or substituted blocks read as thicker bands, as in the original braid. */
function thickness(type: VariantType, length: number, maxLength: number): number {
  if (type === "match") return 1.5;
  const scaled = 2 + Math.sqrt(length / Math.max(1, maxLength)) * 9;
  return Math.min(12, scaled);
}

/** Confidence bands that set a braid's line style: high → solid, medium →
 *  dashed, low → dotted. So line texture reads as the engine's certainty. */
export const CONF_HIGH = 0.85;
export const CONF_MED = 0.6;

/** Visualisation controls for the braid (set in Settings ▸ Braid). */
export interface BraidViz {
  /** Don't draw braids whose confidence is below this (0 = draw all). */
  hideBelowConfidence: number;
  /** Global opacity multiplier for ribbons (0.1–1). */
  opacity: number;
  /** Hide ribbons whose vertical span exceeds (1 − this)×viewport (0 = off). */
  hideLongDistance: number;
  /** "Gravity": how much a ribbon sags in the middle, like a slack patch cable.
   *  0 = taut S-curves; 1 = full droop. Short (near-horizontal) ribbons sag most,
   *  steep long-range ones stay taut, so the braid reads with physical depth. */
  cableSag: number;
}

export const DEFAULT_BRAID_VIZ: BraidViz = { hideBelowConfidence: 0, opacity: 1, hideLongDistance: 0, cableSag: 0.5 };

export function BraidGutter({
  width,
  height,
  ribbons,
  maxLength,
  selectedId,
  hoveredId,
  visibleTypes,
  viz = DEFAULT_BRAID_VIZ,
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
  viz?: BraidViz;
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
        // Hide braids the engine is too unsure of, when the reader has asked.
        if (viz.hideBelowConfidence > 0 && r.confidence < viz.hideBelowConfidence) return null;
        // Long-distance hiding: drop steep ribbons (ends far apart vertically).
        const span = Math.abs(r.yA - r.yB) / Math.max(1, height);
        if (viz.hideLongDistance > 0 && span > 1 - viz.hideLongDistance) return null;
        const isSelected = r.id === selectedId;
        // Keep the ribbon its variant-type colour; selection is shown by emphasis
        // (thicker + full opacity) so the type stays legible.
        const color = VARIANT_TYPE_COLORS[r.type];
        const active = isSelected || r.id === hoveredId;
        const w = thickness(r.type, r.length, maxLength) * (active ? 1.6 : 1);
        // Confidence as line texture: high = solid, medium = dashed, low = dotted.
        // (Matches and one-sided add/omit are confidence 1, so always solid.)
        const band = r.confidence >= CONF_HIGH ? "high" : r.confidence >= CONF_MED ? "med" : "low";
        const dash = band === "high" ? undefined
          : band === "med" ? `${Math.max(3, w * 1.4)} ${Math.max(3, w * 1.3)}`
          : `${Math.max(1, w * 0.5)} ${Math.max(2.5, w * 1.5)}`; // dotted
        const cx = width / 2;
        // Gravity: pull the mid control points DOWN so the ribbon hangs like a
        // slack cable. Slack is greatest for short, near-horizontal correspondences
        // and tapers to nothing for steep long-range ones (which read as taut).
        const sag = viz.cableSag * Math.min(width * 0.9, 56) * (1 - Math.min(1, span * 1.4)) * (active ? 0.5 : 1);
        const d = `M 0 ${r.yA} C ${cx} ${r.yA + sag} ${cx} ${r.yB + sag} ${width} ${r.yB}`;
        // The further apart the two ends sit, the more the reading has moved —
        // boost opacity with vertical distance so long-range correspondences read
        // through the busier short ones.
        const distBoost = Math.min(0.26, span * 0.5);
        // When a variant is selected, fade everything else right back so the one
        // being worked on stands alone. When nothing is selected, show ALL braids
        // (matches a touch lighter than changes so the eye still reads the changes).
        const baseOp = anySelected
          ? active
            ? 0.95
            : 0.05
          : active
            ? 0.95
            : Math.min(0.95, (r.type === "match" ? 0.34 : 0.72) + distBoost);
        const opacity = baseOp * (active ? 1 : viz.opacity);
        return (
          <path
            key={r.id}
            d={d}
            fill="none"
            stroke={color}
            strokeWidth={w}
            strokeLinecap={band === "high" ? "round" : band === "low" ? "round" : "butt"}
            strokeDasharray={dash}
            opacity={opacity}
            style={{ cursor: r.type === "match" ? "default" : "pointer", transition: "opacity 120ms, stroke-width 120ms" }}
            onMouseEnter={() => onHover(r.id)}
            onMouseLeave={() => onHover(null)}
            onClick={(e) => { e.stopPropagation(); onSelect(r.id === selectedId ? null : r.id); }}
          />
        );
      })}
    </svg>
  );
}
