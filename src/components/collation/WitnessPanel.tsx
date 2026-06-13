"use client";

import { useMemo } from "react";
import type { CollationMode, Variant, Witness } from "@/types/collation";
import { VARIANT_TYPE_COLORS } from "@/types/collation";

type Side = "a" | "b";

/** Background tint for a variant span on a given side. Matches stay untinted so
 *  the eye rests on what changed; everything else carries its type colour at low
 *  alpha, lifted when selected. */
function tintStyle(type: Variant["type"], selected: boolean, hovered: boolean) {
  if (type === "match") {
    return selected || hovered
      ? { background: "color-mix(in srgb, var(--sv-match) 14%, transparent)" }
      : {};
  }
  const color = VARIANT_TYPE_COLORS[type];
  const alpha = selected ? 42 : hovered ? 30 : 20;
  return {
    background: `color-mix(in srgb, ${color} ${alpha}%, transparent)`,
    boxShadow: selected ? `inset 0 -2px 0 0 ${color}` : undefined,
  };
}

export function WitnessPanel({
  side,
  witness,
  variants,
  mode,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  registerAnchor,
}: {
  side: Side;
  witness: Witness;
  variants: Variant[];
  mode: CollationMode;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  registerAnchor: (id: string, side: Side, el: HTMLElement | null) => void;
}) {
  // This side's variants in document order. Every character of the witness
  // belongs to exactly one such variant (matches/subs/variants/transpositions
  // plus this side's del-or-add), so concatenating their slices is verbatim.
  const ordered = useMemo(() => {
    const span = (v: Variant) => (side === "a" ? v.a : v.b);
    return variants
      .filter((v) => span(v) !== undefined)
      .sort((x, y) => span(x)!.start - span(y)!.start);
  }, [variants, side]);

  const isMono = mode === "source";

  return (
    <div
      className="px-4 py-3"
      style={{
        fontFamily: isMono ? "var(--code-font-family)" : "var(--font-source-serif), Georgia, serif",
        fontSize: isMono ? "12.5px" : "15px",
        lineHeight: isMono ? "1.55" : "1.75",
        whiteSpace: "pre-wrap",
        wordBreak: isMono ? "normal" : "normal",
      }}
    >
      {ordered.map((v) => {
        const sp = (side === "a" ? v.a : v.b)!;
        const text = witness.text.slice(sp.start, sp.end);
        const selected = v.id === selectedId;
        const hovered = v.id === hoveredId;
        return (
          <span
            key={v.id}
            ref={(el) => registerAnchor(v.id, side, el)}
            data-vid={v.id}
            onMouseEnter={() => onHover(v.id)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onSelect(selected ? null : v.id)}
            title={`${v.type}${sp.startLine === sp.endLine ? ` · l.${sp.startLine}` : ` · ll.${sp.startLine}–${sp.endLine}`}`}
            className={
              "rounded-[2px] transition-colors duration-100 " +
              (v.type === "match" ? "cursor-default" : "cursor-pointer")
            }
            style={tintStyle(v.type, selected, hovered)}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}
