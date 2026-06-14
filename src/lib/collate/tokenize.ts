/**
 * Mode-aware segmentation.
 *
 * A SEGMENT is the atomic alignable unit. In SOURCE mode it is a line; in TEXT
 * mode it is a sentence. Every segment keeps its exact character offsets and the
 * line range it occupies in the original witness text, so the braid can draw
 * ribbons to precise pixels and the apparatus can cite line numbers. Whitespace
 * between segments (newlines, the space after a full stop) is attached to the
 * preceding segment's [start, end) range so that concatenating all segment texts
 * reproduces the witness verbatim — nothing is lost.
 */

import type { CollationMode } from "@/types/collation";

export interface Segment {
  /** Index of this segment in its witness's segment list. */
  index: number;
  /** Verbatim text of the segment, including its trailing separator. */
  text: string;
  /** Character offset (inclusive) into the witness text. */
  start: number;
  /** Character offset (exclusive) into the witness text. */
  end: number;
  /** 1-based line number where the segment begins. */
  startLine: number;
  /** 1-based line number where the segment ends. */
  endLine: number;
}

/** Precompute, for every character offset, which 1-based line it sits on. */
function lineAt(text: string): (offset: number) => number {
  // Offsets of each newline; line number = count of newlines strictly before offset, +1.
  const newlineOffsets: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") newlineOffsets.push(i);
  }
  return (offset: number) => {
    // Binary search for the number of newlines before `offset`.
    let lo = 0;
    let hi = newlineOffsets.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (newlineOffsets[mid] < offset) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1;
  };
}

/** Split into lines, keeping each line's trailing "\n" so offsets are exact. */
function segmentByLine(text: string): Segment[] {
  const segments: Segment[] = [];
  const lineOf = lineAt(text);
  let start = 0;
  let index = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      const end = i + 1;
      segments.push({
        index: index++,
        text: text.slice(start, end),
        start,
        end,
        startLine: lineOf(start),
        endLine: lineOf(Math.max(start, end - 1)),
      });
      start = end;
    }
  }
  if (start < text.length) {
    segments.push({
      index: index++,
      text: text.slice(start),
      start,
      end: text.length,
      startLine: lineOf(start),
      endLine: lineOf(text.length - 1),
    });
  }
  return segments;
}

/**
 * Split into sentences. We break after ., !, ? (and closing quotes/brackets that
 * follow them) plus trailing whitespace, but keep the punctuation and the space
 * with the sentence. Newlines also force a break so verse/short lines segment
 * sensibly. Deliberately simple and offset-preserving rather than linguistically
 * perfect; the aligner tolerates imperfect boundaries.
 */
function segmentBySentence(text: string): Segment[] {
  const segments: Segment[] = [];
  const lineOf = lineAt(text);
  const boundary = /([.!?]+["'”’)\]]*\s+|\n+)/g;
  let start = 0;
  let index = 0;
  let m: RegExpExecArray | null;
  while ((m = boundary.exec(text)) !== null) {
    const end = m.index + m[0].length;
    const piece = text.slice(start, end);
    if (piece.trim().length > 0) {
      segments.push({
        index: index++,
        text: piece,
        start,
        end,
        startLine: lineOf(start),
        endLine: lineOf(Math.max(start, end - 1)),
      });
    } else if (segments.length > 0) {
      // Pure-whitespace tail: fold into the previous segment so nothing is lost.
      const prev = segments[segments.length - 1];
      prev.text += piece;
      prev.end = end;
      prev.endLine = lineOf(Math.max(prev.start, end - 1));
    }
    start = end;
  }
  if (start < text.length && text.slice(start).trim().length > 0) {
    segments.push({
      index: index++,
      text: text.slice(start),
      start,
      end: text.length,
      startLine: lineOf(start),
      endLine: lineOf(text.length - 1),
    });
  }
  return segments;
}

export function segment(text: string, mode: CollationMode): Segment[] {
  return mode === "source" ? segmentByLine(text) : segmentBySentence(text);
}

/** Build a Span (with line numbers) for an arbitrary character range — used for
 *  editor-made manual links, which aren't tied to segment boundaries. */
export function spanAt(text: string, start: number, end: number): import("@/types/collation").Span {
  const lineOf = lineAt(text);
  const s = Math.max(0, Math.min(start, text.length));
  const e = Math.max(s, Math.min(end, text.length));
  return { start: s, end: e, startLine: lineOf(s), endLine: lineOf(Math.max(s, e - 1)) };
}
