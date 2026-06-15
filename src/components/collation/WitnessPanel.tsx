"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode, CSSProperties } from "react";
import { StickyNote } from "lucide-react";
import type { CollationMode, Variant, Witness, WordRun } from "@/types/collation";
import { VARIANT_TYPE_COLORS, confidenceOf } from "@/types/collation";
import { highlightRanges, tokenStyle, type HToken } from "@/lib/highlight";
import { wordAtPoint } from "@/lib/dictionary";

type Side = "a" | "b";

/** Split a segment's text into syntax-coloured runs using absolute token ranges.
 *  Foreground only — the caller keeps any variant background tint. */
function colorize(absStart: number, str: string, tokens: HToken[], isDark: boolean): ReactNode {
  if (!tokens.length || !str) return str;
  const absEnd = absStart + str.length;
  // First token whose end is past absStart (tokens are sorted, non-overlapping).
  let lo = 0, hi = tokens.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tokens[mid].to <= absStart) lo = mid + 1;
    else hi = mid;
  }
  const out: ReactNode[] = [];
  let cursor = absStart;
  let i = lo;
  let key = 0;
  while (cursor < absEnd && i < tokens.length && tokens[i].from < absEnd) {
    const tk = tokens[i];
    const s = Math.max(tk.from, cursor);
    const e = Math.min(tk.to, absEnd);
    if (s > cursor) out.push(str.slice(cursor - absStart, s - absStart));
    if (e > s) {
      const sub = str.slice(s - absStart, e - absStart);
      const st = tokenStyle(tk.tag, isDark);
      out.push(st ? <span key={key++} style={st}>{sub}</span> : sub);
      cursor = e;
    }
    i++;
  }
  if (cursor < absEnd) out.push(str.slice(cursor - absStart));
  return out.length ? out : str;
}

/** Background tint for a variant span. Matches stay untinted so the eye rests on
 *  what changed; when a variant is selected every other span is faded so the
 *  locus under work stands alone. */
function tintStyle(type: Variant["type"], band: Band, selected: boolean, hovered: boolean, anySelected: boolean, confirmed = false, tentative = false): CSSProperties {
  // Approved (👍): the editor has signed off, so the locus no longer shouts as a
  // highlight — it's UNDERLINED in its type colour, the "settled" state.
  if (confirmed && !selected) {
    return { textDecorationLine: "underline", textDecorationColor: `color-mix(in srgb, ${VARIANT_TYPE_COLORS[type]} 85%, transparent)`, textDecorationThickness: "2px", textUnderlineOffset: "3px", opacity: anySelected && !hovered ? 0.6 : 1 };
  }
  // Tentative: a provisional flag to revisit — a flat NEUTRAL GREY highlight (not
  // the type colour), so it reads as "noted but unsure", set apart from the real
  // typed loci and from the approved underline.
  if (tentative && !selected) {
    return { background: "color-mix(in srgb, hsl(var(--muted-foreground)) 26%, transparent)", opacity: anySelected && !hovered ? 0.55 : 1 };
  }
  // The selected locus KEEPS its variant-type colour (so a transposition still
  // reads as blue, an omission as red, etc.) and is framed in the strong
  // version-variation yellow — the yellow marks "you are here", it doesn't
  // replace the type.
  if (selected) {
    const base = type === "match"
      ? "color-mix(in srgb, var(--sv-match) 16%, transparent)"
      : `color-mix(in srgb, ${VARIANT_TYPE_COLORS[type]} 42%, transparent)`;
    return {
      background: base,
      boxShadow: "inset 0 0 0 2px var(--sv-variation)",
      opacity: 1,
    };
  }
  if (type === "match") {
    return hovered ? { background: "color-mix(in srgb, var(--sv-match) 14%, transparent)" } : {};
  }
  const color = VARIANT_TYPE_COLORS[type];
  const alpha = hovered ? 30 : anySelected ? 8 : 22;
  // Half-tone echoes the braid's confidence texture: a HIGH-confidence locus is a
  // solid wash; a MEDIUM one is a fine dot screen; a LOW one a coarser, airier dot
  // screen — so an uncertain reading literally looks less solid.
  if (band !== "high" && !hovered) {
    const dot = `color-mix(in srgb, ${color} ${Math.min(38, alpha + 12)}%, transparent)`;
    const size = band === "low" ? 4.5 : 3.5;
    const r = band === "low" ? 0.8 : 0.9;
    return {
      backgroundImage: `radial-gradient(${dot} ${r}px, transparent ${r + 0.6}px)`,
      backgroundSize: `${size}px ${size}px`,
      opacity: anySelected ? 0.55 : 1,
    };
  }
  return {
    background: `color-mix(in srgb, ${color} ${alpha}%, transparent)`,
    opacity: anySelected && !hovered ? 0.55 : 1,
  };
}

type Band = "high" | "med" | "low";
interface LineSeg {
  vid: string;
  type: Variant["type"];
  band: Band;
  confirmed: boolean;
  tentative: boolean;
  text: string;
  /** Absolute character offset of this segment's first character in the witness. */
  start: number;
  /** True on the segment where this variant first appears (the braid anchor). */
  anchor: boolean;
}
interface Row {
  n: number;
  segs: LineSeg[];
}

/** Confidence band of a variant given the (user-set) cut-offs, for the panel's
 *  half-tone tint: high = solid, medium = fine dots, low = coarse dots. */
function bandOf(v: Variant, confHigh: number, confMed: number): Band {
  const c = confidenceOf(v);
  return c >= confHigh ? "high" : c >= confMed ? "med" : "low";
}

/** Build line rows, splitting each variant's span at line boundaries so every
 *  visual line carries its own tinted segments plus a stable line number. */
function buildRows(text: string, variants: Variant[], side: Side, confHigh: number, confMed: number): Row[] {
  // Variant spans on this side, sorted by start offset (they tile the text).
  const spans = variants
    .map((v) => ({ v, sp: side === "a" ? v.a : v.b }))
    .filter((x) => x.sp !== undefined)
    .map((x) => ({ vid: x.v.id, type: x.v.type, band: bandOf(x.v, confHigh, confMed), confirmed: !!x.v.confirmed, tentative: !!x.v.tentative, start: x.sp!.start, end: x.sp!.end }))
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
    let pos = ls; // cursor: every character from ls..le is emitted (tinted or plain)
    let j = vi;
    while (j < spans.length && spans[j].start < le) {
      const s = spans[j];
      const from = Math.max(s.start, ls, pos);
      const to = Math.min(s.end, le);
      if (from > pos) segs.push({ vid: "", type: "match", band: "high", confirmed: false, tentative: false, text: text.slice(pos, from), start: pos, anchor: false });
      if (to > from) {
        const anchor = !seen.has(s.vid) && s.start >= ls && s.start < le;
        if (anchor) seen.add(s.vid);
        segs.push({ vid: s.vid, type: s.type, band: s.band, confirmed: s.confirmed, tentative: s.tentative, text: text.slice(from, to), start: from, anchor });
        pos = to;
      }
      j++;
    }
    // Trailing uncovered text on this line (e.g. when a manual link reassigned a
    // partner): render it plain rather than dropping it.
    if (pos < le) segs.push({ vid: "", type: "match", band: "high", confirmed: false, tentative: false, text: text.slice(pos, le), start: pos, anchor: false });
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
  confHigh,
  confMed,
  editMode,
  annotateMode,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
  onLookup,
  onEditText,
  onAnnotate,
  registerAnchor,
  advancedMode,
  pick,
  onPick,
  onPickRange,
  lang,
  isDark,
  search,
  analysis = true,
  annotatedNotes,
  onOpenAnnotation,
}: {
  side: Side;
  witness: Witness;
  variants: Variant[];
  mode: CollationMode;
  fontSize: number;
  /** Confidence band cut-offs (from braid settings) for the half-tone tint. */
  confHigh: number;
  confMed: number;
  editMode: boolean;
  /** Annotate mode for this panel: a plain click on a line adds a note. */
  annotateMode?: boolean;
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (id: string | null, scroll?: boolean) => void;
  onHover: (id: string | null) => void;
  /** Right-click → look up the word under the cursor (dictionary). */
  onLookup: (word: string, x: number, y: number) => void;
  onEditText: (text: string) => void;
  onAnnotate: (line: number) => void;
  registerAnchor: (id: string, side: Side, el: HTMLElement | null) => void;
  advancedMode: boolean;
  pick: { start: number; end: number } | null;
  onPick: (side: Side, vid: string, shift: boolean) => void;
  /** Set a precise pick range from a native text selection (Advanced mode). */
  onPickRange: (side: Side, start: number, end: number, shift: boolean) => void;
  /** Syntax-highlighting language id for code mode; undefined / "none" = off. */
  lang?: string;
  isDark: boolean;
  /** Active search query — matching substrings are marked. */
  search?: string;
  /** When false, drop variant tints + word-runs for plain reading. */
  analysis?: boolean;
  /** 1-based line number → annotation text, for the margin marker + hover. */
  annotatedNotes?: Map<number, string>;
  /** Open the annotation(s) on a line (click the margin marker). */
  onOpenAnnotation?: (line: number) => void;
}) {
  const isMono = mode === "source";
  const anySelected = selectedId !== null;
  const fontFamily = isMono ? "var(--code-font-family)" : "var(--font-source-serif), Georgia, serif";

  const [draft, setDraft] = useState(witness.text);
  useEffect(() => setDraft(witness.text), [witness.text, witness.id]);

  const rows = useMemo(() => buildRows(witness.text, variants, side, confHigh, confMed), [witness.text, variants, side, confHigh, confMed]);
  const gutterCh = String(rows.length).length + 1;

  // Word-level runs per variant for this side (substitution/variant only): lets
  // us tint just the words that differ within a sentence/line locus, while the
  // braid ribbon still spans the whole locus.
  const wordRunsByVid = useMemo(() => {
    const m = new Map<string, WordRun[]>();
    for (const v of variants) {
      const runs = side === "a" ? v.aWords : v.bWords;
      if (runs && runs.length) m.set(v.id, runs);
    }
    return m;
  }, [variants, side]);

  // Syntax tokens (foreground colour), only in code mode with a language chosen.
  const htokens = useMemo(
    () => (isMono && lang && lang !== "none" ? highlightRanges(witness.text, lang) : []),
    [isMono, lang, witness.text]
  );
  const hl = (start: number, str: string): ReactNode => (htokens.length ? colorize(start, str, htokens, isDark) : str);

  // Split a segment at absolute character ranges, applying a background style to
  // the covered parts (syntax colour still applies via hl everywhere). Used both
  // for word-level variant tinting and for the Advanced-mode pick highlight.
  const tintRuns = (seg: LineSeg, runs: { start: number; end: number; style: React.CSSProperties }[]): ReactNode => {
    const out: ReactNode[] = [];
    const end = seg.start + seg.text.length;
    let cursor = seg.start;
    let key = 0;
    const sliceHl = (from: number, to: number) => hl(from, seg.text.slice(from - seg.start, to - seg.start));
    for (const r of runs) {
      if (r.end <= cursor || r.start >= end) continue;
      const s = Math.max(r.start, cursor);
      const e = Math.min(r.end, end);
      if (s > cursor) out.push(<span key={key++}>{sliceHl(cursor, s)}</span>);
      out.push(<span key={key++} className="rounded-[2px]" style={r.style}>{sliceHl(s, e)}</span>);
      cursor = e;
    }
    if (cursor < end) out.push(<span key={key++}>{sliceHl(cursor, end)}</span>);
    return out;
  };

  // Word-level tinting: only the words that differ carry the variant background —
  // solid for a high-confidence locus, a half-tone dot screen for medium/low so
  // the changed words echo their braid's dashed/dotted confidence texture.
  const wordTint = (color: string, band: Band, tentative: boolean): CSSProperties => {
    if (tentative) return { background: "color-mix(in srgb, hsl(var(--muted-foreground)) 26%, transparent)" }; // flat grey, provisional
    if (band === "high") return { background: `color-mix(in srgb, ${color} 30%, transparent)` };
    const dot = `color-mix(in srgb, ${color} 34%, transparent)`;
    const size = band === "low" ? 4.5 : 3.5;
    const r = band === "low" ? 0.8 : 0.9;
    return { backgroundImage: `radial-gradient(${dot} ${r}px, transparent ${r + 0.6}px)`, backgroundSize: `${size}px ${size}px` };
  };
  const wordBody = (seg: LineSeg, runs: WordRun[], color: string): ReactNode =>
    tintRuns(
      seg,
      runs.filter((r) => r.changed).map((r) => ({ start: r.start, end: r.end, style: wordTint(color, seg.band, seg.tentative) }))
    );

  // Advanced-mode pick highlight: show the exact selected character range.
  const PICK_STYLE: React.CSSProperties = { background: "color-mix(in srgb, var(--sv-sel) 32%, transparent)", boxShadow: "inset 0 0 0 1px var(--sv-sel)" };
  const segPicked = (seg: LineSeg): boolean => !!pick && pick.start < seg.start + seg.text.length && seg.start < pick.end;
  const pickBody = (seg: LineSeg): ReactNode => (pick ? tintRuns(seg, [{ start: pick.start, end: pick.end, style: PICK_STYLE }]) : hl(seg.start, seg.text));

  // Search match ranges over this witness's text (case-insensitive).
  const searchRanges = useMemo(() => {
    const q = (search ?? "").trim().toLowerCase();
    if (q.length < 2) return [] as { start: number; end: number }[];
    const out: { start: number; end: number }[] = [];
    const hay = witness.text.toLowerCase();
    let i = hay.indexOf(q);
    while (i >= 0) {
      out.push({ start: i, end: i + q.length });
      i = hay.indexOf(q, i + q.length);
    }
    return out;
  }, [search, witness.text]);
  const segHasMatch = (seg: LineSeg): boolean => searchRanges.some((r) => r.start < seg.start + seg.text.length && seg.start < r.end);
  // Wrap matching substrings in <mark> with a data attr so the toolbar can scroll
  // between hits. Uses a distinct orange so it doesn't read as the yellow selection.
  const searchBody = (seg: LineSeg): ReactNode => {
    const out: ReactNode[] = [];
    const end = seg.start + seg.text.length;
    let cursor = seg.start;
    let key = 0;
    const sliceHl = (from: number, to: number) => hl(from, seg.text.slice(from - seg.start, to - seg.start));
    for (const r of searchRanges) {
      if (r.end <= cursor || r.start >= end) continue;
      const s = Math.max(r.start, cursor);
      const e = Math.min(r.end, end);
      if (s > cursor) out.push(<span key={key++}>{sliceHl(cursor, s)}</span>);
      out.push(<mark key={key++} data-sv-match="1" className="rounded-[2px]" style={{ background: "color-mix(in srgb, #ff8a00 45%, transparent)", color: "inherit", boxShadow: "inset 0 0 0 1px #ff8a00" }}>{sliceHl(s, e)}</mark>);
      cursor = e;
    }
    if (cursor < end) out.push(<span key={key++}>{sliceHl(cursor, end)}</span>);
    return out;
  };

  // Read a native text selection inside this panel and turn it into a precise
  // character range (CollateX-style boundary setting). Each rendered segment span
  // carries data-seg-start; we measure from there to the selection endpoint.
  const onMouseUp = (e: React.MouseEvent) => {
    if (!advancedMode) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const root = e.currentTarget as HTMLElement;
    const offsetOf = (node: Node | null, off: number): number | null => {
      let el: HTMLElement | null = node ? (node.nodeType === 3 ? node.parentElement : (node as HTMLElement)) : null;
      const segEl = el?.closest("[data-seg-start]") as HTMLElement | null;
      if (!segEl || !root.contains(segEl)) return null;
      const base = Number(segEl.getAttribute("data-seg-start"));
      const r = document.createRange();
      r.setStart(segEl, 0);
      r.setEnd(node!, off);
      return base + r.toString().length;
    };
    const a = offsetOf(sel.anchorNode, sel.anchorOffset);
    const b = offsetOf(sel.focusNode, sel.focusOffset);
    if (a == null || b == null || a === b) return;
    onPickRange(side, Math.min(a, b), Math.max(a, b), e.shiftKey);
    sel.removeAllRanges();
  };

  if (editMode) {
    // Keep the line-number gutter visible while editing. Both gutter and textarea
    // use the same pixel line-height and the textarea does not wrap, so each
    // logical line aligns 1:1 with its number (long lines scroll horizontally).
    const editLineHeight = isMono ? 1.55 : 1.75;
    const lhPx = Math.round(fontSize * editLineHeight);
    const editLines = Math.max(1, draft.split("\n").length);
    const editGutterCh = String(editLines).length + 1;
    return (
      <div className="py-3 flex bg-amber-50/40 dark:bg-amber-900/10 min-h-[60vh]" style={{ fontFamily, fontSize: `${fontSize}px` }}>
        <div
          aria-hidden
          className="shrink-0 select-none text-right pr-3 pl-2 text-muted-foreground/45 tabular-nums"
          style={{ minWidth: `${editGutterCh}ch`, fontFamily: "var(--code-font-family)", fontSize: `${Math.max(9, fontSize - 2)}px`, lineHeight: `${lhPx}px`, whiteSpace: "pre" }}
        >
          {Array.from({ length: editLines }, (_, i) => i + 1).join("\n")}
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== witness.text) onEditText(draft);
          }}
          spellCheck={false}
          rows={editLines}
          className="flex-1 min-w-0 bg-transparent border-0 outline-none pr-4 resize-none overflow-hidden"
          style={{
            fontFamily,
            fontSize: `${fontSize}px`,
            lineHeight: `${lhPx}px`,
            whiteSpace: "pre",
            overflowX: "auto",
            tabSize: 8,
          }}
        />
      </div>
    );
  }

  const lineHeight = isMono ? 1.55 : 1.75;

  return (
    <div className="py-2" style={{ fontFamily, fontSize: `${fontSize}px`, lineHeight }} onMouseUp={onMouseUp}>
      {rows.map((row) => (
        <div key={row.n} className="flex group/row">
          <span
            className="shrink-0 select-none text-right pr-3 pl-2 text-muted-foreground/45 tabular-nums"
            style={{ minWidth: `${gutterCh}ch`, fontFamily: "var(--code-font-family)", fontSize: `${Math.max(9, fontSize - 2)}px` }}
            aria-hidden
          >
            {row.n}
          </span>
          <span
            className={"flex-1 pr-1 min-w-0" + (annotateMode ? " cursor-text" : "")}
            style={{ whiteSpace: isMono ? "pre-wrap" : "pre-wrap", wordBreak: isMono ? "break-word" : "normal" }}
            onClick={(e) => { if (e.metaKey || e.ctrlKey || annotateMode) onAnnotate(row.n); }}
          >
            {row.segs.length === 0 ? (
              "​"
            ) : (
              row.segs.map((seg, k) => {
                // Plain (uncollated) text: static, but still shows the Advanced
                // pick highlight if a native selection covers it.
                if (!seg.vid)
                  return (
                    <span key={k} data-seg-start={seg.start}>
                      {segHasMatch(seg) ? searchBody(seg) : advancedMode && segPicked(seg) ? pickBody(seg) : hl(seg.start, seg.text)}
                    </span>
                  );
                const selected = seg.vid === selectedId;
                const hovered = seg.vid === hoveredId;
                const runs = wordRunsByVid.get(seg.vid);
                // Word-level tinting applies at rest (auto mode, not selected); a
                // selected locus reverts to whole-span tint. APPROVED loci skip
                // word-tint so the WHOLE sentence is underlined, not just words.
                const useWordTint = analysis && !advancedMode && !selected && !!runs && !seg.confirmed && !seg.tentative;
                const style = !analysis
                  ? (selected ? tintStyle(seg.type, seg.band, true, hovered, false, seg.confirmed, seg.tentative) : undefined)
                  : advancedMode
                    ? tintStyle(seg.type, seg.band, false, hovered, false, seg.confirmed, seg.tentative)
                    : useWordTint
                      ? hovered
                        ? { background: `color-mix(in srgb, ${VARIANT_TYPE_COLORS[seg.type]} 14%, transparent)` }
                        : { opacity: anySelected ? 0.55 : 1 }
                      : tintStyle(seg.type, seg.band, selected, hovered, anySelected, seg.confirmed, seg.tentative);
                return (
                  <span
                    key={k}
                    ref={seg.anchor ? (el) => registerAnchor(seg.vid, side, el) : undefined}
                    data-vid={seg.vid}
                    data-seg-start={seg.start}
                    onMouseEnter={() => onHover(seg.vid)}
                    onMouseLeave={() => onHover(null)}
                    onContextMenu={(e) => { const w = wordAtPoint(e.clientX, e.clientY); if (w) { e.preventDefault(); e.stopPropagation(); onLookup(w, e.clientX, e.clientY); } }}
                    onClick={(e) => {
                      // Don't let the click reach the background.
                      e.stopPropagation();
                      // Alt/Option-click = dictionary lookup. A reliable backup for
                      // the right-click, which macOS / the trackpad can intercept.
                      if (e.altKey) { const w = wordAtPoint(e.clientX, e.clientY); if (w) { e.preventDefault(); onLookup(w, e.clientX, e.clientY); } return; }
                      // Double-click selects the word (native) — don't toggle the
                      // locus selection off on the second click.
                      if (e.detail >= 2) return;
                      // Annotate mode: any click on this panel adds a note.
                      if (annotateMode) {
                        onAnnotate(row.n);
                        return;
                      }
                      // A drag-select (non-collapsed) is handled by onMouseUp as a
                      // precise range pick — don't also do a whole-segment pick.
                      if (advancedMode) {
                        const s = window.getSelection();
                        if (s && !s.isCollapsed) return;
                        onPick(side, seg.vid, e.shiftKey);
                        return;
                      }
                      // Annotate only on modifier-click; a plain click just
                      // highlights the variant in place (no scroll/jump).
                      if (e.metaKey || e.ctrlKey) {
                        e.preventDefault();
                        onAnnotate(row.n);
                        return;
                      }
                      onSelect(selected ? null : seg.vid, false);
                    }}
                    className="rounded-[2px] cursor-pointer transition-colors duration-100"
                    style={style}
                  >
                    {segHasMatch(seg)
                      ? searchBody(seg)
                      : advancedMode && segPicked(seg)
                        ? pickBody(seg)
                        : useWordTint && runs
                          ? wordBody(seg, runs, VARIANT_TYPE_COLORS[seg.type])
                          : hl(seg.start, seg.text)}
                  </span>
                );
              })
            )}
          </span>
          {annotatedNotes?.has(row.n) ? (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenAnnotation?.(row.n); }}
              title={`${annotatedNotes.get(row.n)}\n\n(click to edit)`}
              className="shrink-0 self-start mt-[1px] mr-1 text-amber-600 dark:text-amber-400 hover:text-amber-700"
            >
              <StickyNote className="w-3 h-3" />
            </button>
          ) : (
            <span className="shrink-0 w-4 mr-1" aria-hidden />
          )}
        </div>
      ))}
    </div>
  );
}
