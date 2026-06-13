"use client";

import { useEffect, useMemo, useState } from "react";
import type { CollationMode, Variant, Witness } from "@/types/collation";
import { VARIANT_TYPE_COLORS } from "@/types/collation";

type Side = "a" | "b";

/** Background tint for a variant span. Matches stay untinted so the eye rests on
 *  what changed; when a variant is selected every other span is faded so the
 *  locus under work stands alone. */
function tintStyle(type: Variant["type"], selected: boolean, hovered: boolean, anySelected: boolean) {
  if (type === "match") {
    return selected || hovered ? { background: "color-mix(in srgb, var(--sv-match) 14%, transparent)" } : {};
  }
  const color = VARIANT_TYPE_COLORS[type];
  const alpha = selected ? 46 : hovered ? 30 : anySelected ? 8 : 22;
  return {
    background: `color-mix(in srgb, ${color} ${alpha}%, transparent)`,
    boxShadow: selected ? `inset 0 -2px 0 0 ${color}` : undefined,
    opacity: anySelected && !selected && !hovered ? 0.55 : 1,
  };
}

interface LineSeg {
  vid: string;
  type: Variant["type"];
  text: string;
  /** True on the segment where this variant first appears (the braid anchor). */
  anchor: boolean;
}
interface Row {
  n: number;
  segs: LineSeg[];
}

/** Build line rows, splitting each variant's span at line boundaries so every
 *  visual line carries its own tinted segments plus a stable line number. */
function buildRows(text: string, variants: Variant[], side: Side): Row[] {
  // Variant spans on this side, sorted by start offset (they tile the text).
  const spans = variants
    .map((v) => ({ v, sp: side === "a" ? v.a : v.b }))
    .filter((x) => x.sp !== undefined)
    .map((x) => ({ vid: x.v.id, type: x.v.type, start: x.sp!.start, end: x.sp!.end }))
    .sort((a, b) => a.start - b.start);

  const rows: Row[] = [];
  const seen = new Set<string>();
  let lineStart = 0;
  let n = 1;
  let vi = 0; // pointer into spans

  const emitLine = (ls: number, le: number) => {
    const segs: LineSeg[] = [];
    // advance pointer past spans that end at/before this line
    while (vi < spans.length && spans[vi].end <= ls) vi++;
    let j = vi;
    while (j < spans.length && spans[j].start < le) {
      const s = spans[j];
      const from = Math.max(s.start, ls);
      const to = Math.min(s.end, le);
      if (to > from) {
        const anchor = !seen.has(s.vid) && s.start >= ls && s.start < le;
        if (anchor) seen.add(s.vid);
        segs.push({ vid: s.vid, type: s.type, text: text.slice(from, to), anchor });
      }
      j++;
    }
    rows.push({ n, segs });
    n++;
  };

  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      emitLine(lineStart, i);
      lineStart = i + 1;
    }
  }
  emitLine(lineStart, text.length);
  return rows;
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
  const fontFamily = isMono ? "var(--code-font-family)" : "var(--font-source-serif), Georgia, serif";

  const [draft, setDraft] = useState(witness.text);
  useEffect(() => setDraft(witness.text), [witness.text, witness.id]);

  const rows = useMemo(() => buildRows(witness.text, variants, side), [witness.text, variants, side]);
  const gutterCh = String(rows.length).length + 1;

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

  const lineHeight = isMono ? 1.55 : 1.75;

  return (
    <div className="py-2" style={{ fontFamily, fontSize: `${fontSize}px`, lineHeight }}>
      {rows.map((row) => (
        <div key={row.n} className="flex">
          <span
            className="shrink-0 select-none text-right pr-3 pl-2 text-muted-foreground/45 tabular-nums"
            style={{ minWidth: `${gutterCh}ch`, fontFamily: "var(--code-font-family)", fontSize: `${Math.max(9, fontSize - 2)}px` }}
            aria-hidden
          >
            {row.n}
          </span>
          <span
            className="flex-1 pr-4 min-w-0"
            style={{ whiteSpace: isMono ? "pre-wrap" : "pre-wrap", wordBreak: isMono ? "break-word" : "normal" }}
          >
            {row.segs.length === 0 ? (
              "​"
            ) : (
              row.segs.map((seg, k) => {
                const selected = seg.vid === selectedId;
                const hovered = seg.vid === hoveredId;
                return (
                  <span
                    key={k}
                    ref={seg.anchor ? (el) => registerAnchor(seg.vid, side, el) : undefined}
                    data-vid={seg.vid}
                    onMouseEnter={() => onHover(seg.vid)}
                    onMouseLeave={() => onHover(null)}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey) {
                        e.preventDefault();
                        onAnnotate(row.n);
                        return;
                      }
                      onSelect(selected ? null : seg.vid);
                    }}
                    className="rounded-[2px] cursor-pointer transition-colors duration-100"
                    style={tintStyle(seg.type, selected, hovered, anySelected)}
                  >
                    {seg.text}
                  </span>
                );
              })
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
