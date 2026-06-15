/**
 * Word/instruction lookup for the right-click "define" feature.
 *
 * CodeX (mode === "source"): looks up the token's mnemonic in the bundled PDP-1
 * instruction dictionary (public/dictionaries/pdp1.json). The dictionary FOLDER
 * is where more language references can be dropped later.
 *
 * TextX (mode === "text"): a browser cannot reach the OS dictionary (macOS
 * Dictionary.app etc.) — sandboxed web apps have no such API — so we call the
 * free, key-less Dictionary API (dictionaryapi.dev) instead. This is the one
 * place SV reaches the network; it degrades gracefully offline.
 */

import type { CollationMode } from "@/types/collation";

export interface Definition {
  word: string;
  /** Where the definition came from, for the popup footer. */
  source: string;
  /** The definition text, or null when nothing was found. */
  text: string | null;
}

let pdp1Cache: Record<string, string> | null = null;
const textCache = new Map<string, Definition>();

/** The leading [a-z]+ run of a token, e.g. "ssp1" → "ssp", "lac" → "lac". */
function mnemonic(word: string): string {
  const m = word.toLowerCase().match(/^[a-z]+/);
  return m ? m[0] : word.toLowerCase();
}

async function loadPdp1(): Promise<Record<string, string>> {
  if (pdp1Cache) return pdp1Cache;
  try {
    const res = await fetch("/dictionaries/pdp1.json");
    const data = await res.json();
    pdp1Cache = (data?.entries ?? {}) as Record<string, string>;
  } catch {
    pdp1Cache = {};
  }
  return pdp1Cache;
}

async function lookupCode(word: string): Promise<Definition> {
  const entries = await loadPdp1();
  const w = word.toLowerCase();
  const hit = entries[w] ?? entries[mnemonic(word)];
  return { word, source: "PDP-1 instruction set", text: hit ?? null };
}

async function lookupText(word: string): Promise<Definition> {
  const w = word.toLowerCase();
  if (textCache.has(w)) return textCache.get(w)!;
  let out: Definition = { word, source: "Dictionary API (dictionaryapi.dev)", text: null };
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`);
    if (res.ok) {
      const data = await res.json();
      const meaning = data?.[0]?.meanings?.[0];
      const def = meaning?.definitions?.[0]?.definition;
      if (def) out = { word, source: `Dictionary API · ${meaning.partOfSpeech ?? ""}`.trim(), text: def };
    }
  } catch {
    out = { word, source: "Dictionary API (offline?)", text: null };
  }
  textCache.set(w, out);
  return out;
}

/** Look a word up in the dictionary appropriate to the engine. */
export function lookup(word: string, mode: CollationMode): Promise<Definition> {
  return mode === "source" ? lookupCode(word) : lookupText(word);
}

/** Extract the word under a pointer position (for right-click define). */
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
