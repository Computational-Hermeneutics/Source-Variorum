/**
 * Standalone syntax highlighting for the collation panels.
 *
 * Source Variorum renders witness text as manual spans whose *background*
 * encodes variant membership (the braid). Syntax highlighting is an orthogonal
 * *foreground* concern, so the two coexist: we run a CodeMirror StreamParser
 * (vendored from the CCS Workbench) line by line to get token ranges, and the
 * renderer colours the text while the variant tint keeps owning the background.
 *
 * Two highlighter paths feed one colour table (tokenStyle): stream-mode parsers
 * (the historical assembly dialects, vendored from CCS-WB, run line by line) and
 * Lezer tree parsers (modern languages — JS/TS, Python, HTML, …, via ./lezer.ts).
 */

import { StringStream, type StreamParser, type LanguageSupport } from "@codemirror/language";
import { pdp1Parser } from "./lang-pdp1";
import { agc } from "./langs/agc";
import { basic } from "./langs/basic";
import { fortran } from "./langs/fortran";
import { iplv } from "./langs/iplv";
import { mad } from "./langs/mad";
import { lezerRanges } from "./lezer";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { json } from "@codemirror/lang-json";
import { xml } from "@codemirror/lang-xml";
import { go } from "@codemirror/lang-go";
import { php } from "@codemirror/lang-php";
import { markdown } from "@codemirror/lang-markdown";

/** Pull the bare StreamParser out of a vendored CCS-WB LanguageSupport so we can
 *  run it standalone (no editor). `streamParser` exists at runtime on every
 *  StreamLanguage even though it is not in the public type. */
function parserOf(support: LanguageSupport): StreamParser<unknown> {
  return (support.language as unknown as { streamParser: StreamParser<unknown> }).streamParser;
}

export interface HToken {
  from: number;
  to: number;
  tag: string;
}

export interface HLang {
  id: string;
  label: string;
  /** Grouping for the language picker. */
  group: "modern" | "historical";
  /** File extensions (no dot) that auto-select this language. */
  ext: string[];
  /** Stream-mode parser (historical dialects) — mutually exclusive with support. */
  parser?: StreamParser<unknown>;
  /** Lezer LanguageSupport (modern languages). */
  support?: LanguageSupport;
}

/**
 * Registry of available code languages. `none` disables highlighting.
 * - Modern languages use Lezer parsers (`support`).
 * - Historical dialects use stream parsers (`parser`), vendored under ./langs/.
 */
export const LANGS: HLang[] = [
  // Modern (Lezer)
  { id: "javascript", label: "JavaScript / TS", group: "modern", support: javascript({ typescript: true, jsx: true }), ext: ["js", "jsx", "ts", "tsx", "mjs", "cjs"] },
  { id: "python", label: "Python", group: "modern", support: python(), ext: ["py", "pyw"] },
  { id: "html", label: "HTML", group: "modern", support: html(), ext: ["html", "htm", "xhtml"] },
  { id: "css", label: "CSS", group: "modern", support: css(), ext: ["css", "scss"] },
  { id: "cpp", label: "C / C++", group: "modern", support: cpp(), ext: ["c", "h", "cpp", "cc", "cxx", "hpp", "hh"] },
  { id: "java", label: "Java", group: "modern", support: java(), ext: ["java"] },
  { id: "rust", label: "Rust", group: "modern", support: rust(), ext: ["rs"] },
  { id: "go", label: "Go", group: "modern", support: go(), ext: ["go"] },
  { id: "php", label: "PHP", group: "modern", support: php(), ext: ["php"] },
  { id: "sql", label: "SQL", group: "modern", support: sql(), ext: ["sql"] },
  { id: "json", label: "JSON", group: "modern", support: json(), ext: ["json"] },
  { id: "xml", label: "XML / TEI", group: "modern", support: xml(), ext: ["xml", "tei", "svg", "rss"] },
  { id: "markdown", label: "Markdown", group: "modern", support: markdown(), ext: ["md", "markdown"] },
  // Historical assembly / early dialects (stream parsers)
  { id: "pdp1", label: "PDP-1 MACRO", group: "historical", parser: pdp1Parser as StreamParser<unknown>, ext: ["mac", "pdp1", "asm", "lst"] },
  { id: "agc", label: "AGC (Apollo)", group: "historical", parser: parserOf(agc()), ext: ["agc"] },
  { id: "mad", label: "MAD", group: "historical", parser: parserOf(mad()), ext: ["mad"] },
  { id: "fortran", label: "FORTRAN", group: "historical", parser: parserOf(fortran()), ext: ["f", "for", "ftn", "f77", "fortran"] },
  { id: "iplv", label: "IPL-V", group: "historical", parser: parserOf(iplv()), ext: ["ipl", "iplv"] },
  { id: "basic", label: "BASIC", group: "historical", parser: parserOf(basic()), ext: ["bas", "basic"] },
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
 * Tokenize `text` with the given language id and return absolute character
 * ranges. Modern languages parse to a Lezer tree; historical dialects run their
 * StreamParser line by line. Returns [] for unknown / `none`.
 */
export function highlightRanges(text: string, langId: string | undefined): HToken[] {
  const lang = langById(langId);
  if (!lang) return [];
  if (lang.support) return lezerRanges(text, lang.support);
  const parser = lang.parser;
  if (!parser) return [];
  const tokens: HToken[] = [];
  const lines = text.split("\n");
  const state: unknown = parser.startState ? parser.startState(2) : {};
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
