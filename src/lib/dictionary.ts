/**
 * Word/instruction lookup for the right-click (or Alt-click) "define" feature.
 *
 * CodeX (mode === "source"): looks the token up in the bundled PDP-1 instruction
 * dictionary (public/dictionaries/pdp1.json — name, parameters, octal, a
 * description, and a small example, with a reference back to masswerk.at). If the
 * token is instead a SYMBOL DEFINED IN THE WITNESS ITSELF — a macro, a label, or
 * a constant assignment — we also pull the source snippet that defines it, so the
 * reader sees the function it actually calls, not just the dictionary gloss.
 *
 * TextX (mode === "text"): a browser cannot reach the OS dictionary (macOS
 * Dictionary.app etc.) — sandboxed web apps have no such API — so we call the
 * free, key-less Dictionary API (dictionaryapi.dev) instead. This is the one
 * place SV reaches the network; it degrades gracefully offline.
 */

import type { CollationMode } from "@/types/collation";

export interface Definition {
  word: string;
  /** Full name, e.g. "Load Accumulator". */
  name?: string;
  /** Call signature / operands, e.g. "lac Y". */
  params?: string;
  /** Octal opcode, where the dictionary records one. */
  octal?: string;
  /** The main description / effect, or null when nothing was found. */
  text: string | null;
  /** A small illustrative example. */
  example?: string;
  /** Where the definition came from, for the popup footer. */
  source: string;
  /** Human-readable reference (citation) for the dictionary. */
  ref?: string;
  /** URL of the reference, linked from the popup. */
  url?: string;
  /** Source snippet that DEFINES this token in the witness (macro/label/symbol). */
  snippet?: string;
  /** What kind of definition the snippet is. */
  snippetKind?: "macro" | "label" | "symbol";
}

interface RawEntry { name?: string; params?: string; octal?: string; description?: string; example?: string }
interface RawDict { source?: string; ref?: string; url?: string; entries: Record<string, RawEntry> }

let pdp1Cache: RawDict | null = null;
const textCache = new Map<string, Definition>();

/** The leading [a-z]+ run of a token, e.g. "ssp1" → "ssp", "lac" → "lac". */
function mnemonic(word: string): string {
  const m = word.toLowerCase().match(/^[a-z]+/);
  return m ? m[0] : word.toLowerCase();
}

async function loadPdp1(): Promise<RawDict> {
  if (pdp1Cache) return pdp1Cache;
  try {
    const res = await fetch("/dictionaries/pdp1.json");
    pdp1Cache = (await res.json()) as RawDict;
  } catch {
    pdp1Cache = { entries: {} };
  }
  return pdp1Cache!;
}

/**
 * Find where `word` is DEFINED in the witness source: a macro (`define word …
 * term`), a label (`word, …`), or a constant assignment (`word=…`). Returns the
 * defining snippet so the reader can see the function it calls.
 */
export function findCodeDefinition(word: string, text: string): { snippet: string; kind: Definition["snippetKind"] } | null {
  if (!text) return null;
  const lines = text.split("\n");
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const w = word.toLowerCase();
  // Macro: a "define"/"macro" directive whose name is <word>, up to its "term".
  // In PDP-1 MACRO the name may follow on the SAME line ("define foo X,Y") or on
  // the NEXT line ("define" then "foo X,Y"). Collect the block either way.
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(?:define|macro)\b(.*)$/i);
    if (!m) continue;
    const rest = m[1].trim();
    // the macro name token, on this line or the next non-blank one
    let nameLine = i;
    let head = rest;
    if (!head) { let j = i + 1; while (j < lines.length && lines[j].trim() === "") j++; head = (lines[j] ?? "").trim(); nameLine = j; }
    const nameTok = (head.match(/^[A-Za-z0-9_]+/) ?? [""])[0].toLowerCase();
    if (nameTok !== w) continue;
    const body: string[] = [];
    for (let j = i; j <= nameLine || (j < lines.length && j < nameLine + 24); j++) {
      if (j >= lines.length) break;
      body.push(lines[j]);
      if (j > nameLine && /^\s*term\b/i.test(lines[j])) break;
    }
    return { snippet: body.join("\n").trimEnd(), kind: "macro" };
  }
  // Label: a line beginning "<word>," (a code location / data cell).
  const labelRe = new RegExp(`^\\s*${esc}\\s*,`, "i");
  for (let i = 0; i < lines.length; i++) {
    if (labelRe.test(lines[i])) {
      const body = [lines[i].replace(/\s+$/, "")];
      // include up to 3 continuation lines that look like the label's body
      for (let j = i + 1; j < lines.length && j < i + 4; j++) {
        if (/^\s*\w+\s*,/.test(lines[j]) || /^\s*(?:define|macro|term)\b/i.test(lines[j]) || lines[j].trim() === "") break;
        body.push(lines[j].replace(/\s+$/, ""));
      }
      return { snippet: body.join("\n"), kind: "label" };
    }
  }
  // Constant / parameter assignment: "<word>=…".
  const eqRe = new RegExp(`^\\s*${esc}\\s*=`, "i");
  for (const ln of lines) {
    if (eqRe.test(ln)) return { snippet: ln.trim(), kind: "symbol" };
  }
  return null;
}

async function lookupCode(word: string, sources: string[]): Promise<Definition> {
  const dict = await loadPdp1();
  const w = word.toLowerCase();
  const raw = dict.entries[w] ?? dict.entries[mnemonic(word)];
  // Is it defined in one of the witnesses? (a macro / label / symbol)
  let def: { snippet: string; kind: Definition["snippetKind"] } | null = null;
  for (const src of sources) { def = findCodeDefinition(word, src); if (def) break; }
  const out: Definition = {
    word,
    name: raw?.name,
    params: raw?.params,
    octal: raw?.octal,
    text: raw?.description ?? null,
    example: raw?.example,
    source: raw ? "PDP-1 instruction set" : (def ? "Defined in this witness" : "PDP-1 instruction set"),
    ref: dict.ref,
    url: dict.url,
  };
  if (def) { out.snippet = def.snippet; out.snippetKind = def.kind; }
  return out;
}

async function lookupText(word: string): Promise<Definition> {
  const w = word.toLowerCase();
  if (textCache.has(w)) return textCache.get(w)!;
  let out: Definition = { word, source: "Dictionary API (dictionaryapi.dev)", url: "https://dictionaryapi.dev", text: null };
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`);
    if (res.ok) {
      const data = await res.json();
      const meaning = data?.[0]?.meanings?.[0];
      const def = meaning?.definitions?.[0];
      if (def?.definition) {
        out = {
          word,
          name: meaning.partOfSpeech ? meaning.partOfSpeech : undefined,
          text: def.definition,
          example: def.example,
          source: "Dictionary API",
          ref: "dictionaryapi.dev (Free Dictionary API)",
          url: "https://dictionaryapi.dev",
        };
      }
    }
  } catch {
    out = { word, source: "Dictionary API (offline?)", text: null };
  }
  textCache.set(w, out);
  return out;
}

/** Look a word up in the dictionary appropriate to the engine. `sources` is the
 *  witness text(s), used in CodeX to surface a macro/label/symbol definition. */
export function lookup(word: string, mode: CollationMode, sources: string[] = []): Promise<Definition> {
  return mode === "source" ? lookupCode(word, sources) : lookupText(word);
}

/** Extract the word under a pointer position (for right-click / Alt-click define). */
export function wordAtPoint(x: number, y: number): string | null {
  type LegacyDoc = Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  let node: Node | null = null;
  let offset = 0;
  if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (r) { node = r.startContainer; offset = r.startOffset; }
  } else {
    const pos = (document as LegacyDoc).caretPositionFromPoint?.(x, y);
    if (pos) { node = pos.offsetNode; offset = pos.offset; }
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent ?? "";
  const isWord = (c: string) => /[A-Za-z0-9_'’-]/.test(c);
  let s = Math.min(offset, text.length), e = s;
  while (s > 0 && isWord(text[s - 1])) s--;
  while (e < text.length && isWord(text[e])) e++;
  const w = text.slice(s, e).replace(/^['’-]+|['’-]+$/g, "").trim();
  return w.length ? w : null;
}
