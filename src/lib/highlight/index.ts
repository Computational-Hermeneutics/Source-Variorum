/**
 * Standalone syntax highlighting for the collation panels.
 *
 * Source Variorum renders witness text as manual spans whose *background*
 * encodes variant membership (the braid). Syntax highlighting is an orthogonal
 * *foreground* concern, so the two coexist: we run a CodeMirror StreamParser
 * (vendored from the CCS Workbench) line by line to get token ranges, and the
 * renderer colours the text while the variant tint keeps owning the background.
 *
 * Only stream-mode (historical assembly / early) languages are covered here;
 * these are the scholarly core of the workbench. Lezer-tree languages (modern
 * JS/C/…) can be added later via highlightTree.
 */

import { StringStream, type StreamParser } from "@codemirror/language";
import { pdp1Parser } from "./lang-pdp1";

export interface HToken {
  from: number;
  to: number;
  tag: string;
}

export interface HLang {
  id: string;
  label: string;
  parser: StreamParser<unknown>;
  /** File extensions (no dot) that auto-select this language. */
  ext: string[];
}

/**
 * Registry of available code languages. `none` disables highlighting. Add a new
 * stream language by vendoring its parser (see lang-pdp1.ts) and pushing an
 * entry here — nothing else needs to change.
 */
export const LANGS: HLang[] = [
  { id: "pdp1", label: "PDP-1 MACRO", parser: pdp1Parser as StreamParser<unknown>, ext: ["mac", "pdp1", "s", "asm", "lst"] },
];

export function langById(id: string | undefined): HLang | undefined {
  return id ? LANGS.find((l) => l.id === id) : undefined;
}

/** Guess a language id from a witness title / filename, or undefined. */
export function detectLang(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = m?.[1];
  if (!ext) return undefined;
  return LANGS.find((l) => l.ext.includes(ext))?.id;
}

/**
 * Tokenize `text` with the given language id. Runs the StreamParser one line at
 * a time over a fresh StringStream, mirroring how CodeMirror drives legacy
 * modes, and returns absolute character ranges. Returns [] for unknown / `none`.
 */
export function highlightRanges(text: string, langId: string | undefined): HToken[] {
  const lang = langById(langId);
  if (!lang) return [];
  const parser = lang.parser;
  const tokens: HToken[] = [];
  const lines = text.split("\n");
  let state: unknown = parser.startState ? parser.startState(2) : {};
  let offset = 0;
  for (const line of lines) {
    const stream = new StringStream(line, 2, 2, undefined);
    if (line.length === 0) {
      parser.blankLine?.(state, 2);
    }
    let guard = 0;
    while (!stream.eol()) {
      stream.start = stream.pos;
      const tag = parser.token(stream, state);
      if (stream.pos <= stream.start) stream.pos = stream.start + 1; // never stall
      if (tag) tokens.push({ from: offset + stream.start, to: offset + stream.pos, tag });
      if (++guard > line.length + 8) break; // hard safety
    }
    offset += line.length + 1; // + newline
  }
  return tokens;
}

export interface TokenStyle {
  color: string;
  fontStyle?: "italic";
  fontWeight?: number;
}

/**
 * Map a StreamParser tag string (e.g. "keyword", "number.special",
 * "keyword.directive") to a foreground style. Ported from the CCS Workbench
 * HighlightStyle (cm-theme.ts); the base tag before the first dot is used, with
 * a few specials. Returns undefined when the tag has no style (render as plain).
 */
export function tokenStyle(tag: string, isDark: boolean): TokenStyle | undefined {
  const base = tag.split(".")[0];
  const map = isDark ? DARK : LIGHT;
  // Whole-tag specials take precedence over the base.
  return map[tag] ?? map[base];
}

const LIGHT: Record<string, TokenStyle> = {
  keyword: { color: "hsl(20 75% 40%)" },
  "keyword.directive": { color: "hsl(20 75% 40%)", fontWeight: 500 },
  "keyword.special": { color: "hsl(20 75% 40%)" },
  comment: { color: "hsl(280 60% 50%)", fontStyle: "italic" },
  string: { color: "hsl(150 40% 35%)" },
  number: { color: "hsl(280 35% 45%)" },
  "number.special": { color: "hsl(280 45% 38%)" },
  operator: { color: "hsl(352 30% 40%)" },
  punctuation: { color: "hsl(0 0% 35%)" },
  bracket: { color: "hsl(0 0% 35%)" },
  variableName: { color: "hsl(210 80% 45%)" },
  propertyName: { color: "hsl(210 70% 45%)" },
  typeName: { color: "hsl(20 60% 45%)" },
  labelName: { color: "hsl(220 40% 40%)", fontWeight: 500 },
  macroName: { color: "hsl(330 60% 42%)", fontWeight: 600 },
  heading: { color: "hsl(352 47% 33%)", fontWeight: 700 },
  meta: { color: "hsl(0 0% 70%)" },
  bool: { color: "hsl(280 35% 45%)" },
  atom: { color: "hsl(280 35% 45%)" },
};

const DARK: Record<string, TokenStyle> = {
  keyword: { color: "hsl(20 75% 55%)" },
  "keyword.directive": { color: "hsl(20 75% 55%)", fontWeight: 500 },
  "keyword.special": { color: "hsl(20 75% 55%)" },
  comment: { color: "hsl(280 65% 65%)", fontStyle: "italic" },
  string: { color: "hsl(150 45% 55%)" },
  number: { color: "hsl(280 45% 65%)" },
  "number.special": { color: "hsl(280 50% 60%)" },
  operator: { color: "hsl(352 40% 65%)" },
  punctuation: { color: "hsl(40 10% 65%)" },
  bracket: { color: "hsl(40 10% 65%)" },
  variableName: { color: "hsl(210 80% 65%)" },
  propertyName: { color: "hsl(210 70% 65%)" },
  typeName: { color: "hsl(20 65% 60%)" },
  labelName: { color: "hsl(210 50% 65%)", fontWeight: 500 },
  macroName: { color: "hsl(330 75% 70%)", fontWeight: 600 },
  heading: { color: "hsl(352 55% 65%)", fontWeight: 700 },
  meta: { color: "hsl(0 0% 40%)" },
  bool: { color: "hsl(280 45% 65%)" },
  atom: { color: "hsl(280 45% 65%)" },
};
