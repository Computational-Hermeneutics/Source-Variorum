"use client";

import { useEffect, useMemo, useState } from "react";
import type { CollationMode, Variant, Witness } from "@/types/collation";
import { VARIANT_TYPE_COLORS } from "@/types/collation";

type Side = "a" | "b";

/** Background tint for a variant span on a given side. Matches stay untinted so
 *  the eye rests on what changed; everything else carries its type colour at low
 *  alpha, lifted when selected. When a variant is selected, every other span is
 *  faded so the locus under work stands alone. */
function tintStyle(type: Variant["type"], selected: boolean, hovered: boolean, anySelected: boolean) {
  if (type === "match") {
    return selected || hovered
      ? { background: "color-mix(in srgb, var(--sv-match) 14%, transparent)" }
      : {};
  }
  const color = VARIANT_TYPE_COLORS[type];
  const alpha = selected ? 46 : hovered ? 30 : anySelected ? 8 : 22;
  return {
    background: `color-mix(in srgb, ${color} ${alpha}%, transparent)`,
    boxShadow: selected ? `inset 0 -2px 0 0 ${color}` : undefined,
    opacity: anySelected && !selected && !hovered ? 0.55 : 1,
  };
}

export function WitnessPanel({
  side,
  witness,
  variants,
  mode,
  fontSize,
  editMode,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  onEditText,
  onAnnotate,
  registerAnchor,
}: {
  side: Side;
  witness: Witness;
  variants: Variant[];
  mode: CollationMode;
  fontSize: number;
  editMode: boolean;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onEditText: (text: string) => void;
  onAnnotate: (line: number) => void;
  registerAnchor: (id: string, side: Side, el: HTMLElement | null) => void;
}) {
  const isMono = mode === "source";
  const anySelected = selectedId !== null;

  // Local editing buffer; commit to the project on blur so undo history records
  // one entry per edit session rather than one per keystroke.
  const [draft, setDraft] = useState(witness.text);
  useEffect(() => setDraft(witness.text), [witness.text, witness.id]);

  const ordered = useMemo(() => {
    const span = (v: Variant) => (side === "a" ? v.a : v.b);
    return variants
      .filter((v) => span(v) !== undefined)
      .sort((x, y) => span(x)!.start - span(y)!.start);
  }, [variants, side]);

  const fontFamily = isMono
    ? "var(--code-font-family)"
    : "var(--font-source-serif), Georgia, serif";

  if (editMode) {
    return (
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== witness.text) onEditText(draft);
        }}
        spellCheck={false}
        className="w-full min-h-[60vh] bg-amber-50/40 dark:bg-amber-900/10 border-0 outline-none px-4 py-3 resize-none"
        style={{
          fontFamily,
          fontSize: `${fontSize}px`,
          lineHeight: isMono ? 1.55 : 1.75,
          whiteSpace: isMono ? "pre" : "pre-wrap",
          tabSize: 8,
        }}
      />
    );
  }

  return (
    <div
      className="px-4 py-3"
      style={{
        fontFamily,
        fontSize: `${fontSize}px`,
        lineHeight: isMono ? 1.55 : 1.75,
        whiteSpace: "pre-wrap",
        tabSize: 8,
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
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) {
                e.preventDefault();
                onAnnotate(sp.startLine);
                return;
              }
              onSelect(selected ? null : v.id);
            }}
            title={`${v.type}${sp.startLine === sp.endLine ? ` · l.${sp.startLine}` : ` · ll.${sp.startLine}–${sp.endLine}`}  ·  ⌘/Ctrl-click to annotate`}
            className={
              "rounded-[2px] transition-colors duration-100 " +
              (v.type === "match" ? "cursor-pointer" : "cursor-pointer")
            }
            style={tintStyle(v.type, selected, hovered, anySelected)}
          >
            {text}
          </span>
        );
      })}
    </div>
  );
}
