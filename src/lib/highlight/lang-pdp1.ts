/**
 * PDP-1 MACRO assembly tokenizer.
 *
 * Vendored from the CCS Workbench (src/components/code/cm-lang-pdp1.ts) as a
 * bare CodeMirror StreamParser. Source Variorum does not mount a CodeMirror
 * editor in the collation panels — it runs this parser line by line (see
 * ./index.ts) to get token ranges, then colours them as foreground over the
 * variant background tints.
 *
 * Used by the canonical Spacewar! (1962) sources. MACRO is Saunders/Edwards'
 * PDP-1 assembler (DECUS no. 1, 1959). The dialect has a few features that
 * mainstream assemblers don't:
 *
 *   - Line comments are `/` to end-of-line. `///` is the conventional section
 *     divider; we colour the whole line as a section heading.
 *   - Numbers are octal by default. `.` is the location counter / current
 *     address. Decimal mode is entered with the `decimal` pseudo-op.
 *   - Labels end with `,` (e.g. `sbf,`).
 *   - Constants live in a literal pool introduced by `(` (e.g. `add (335671`).
 *   - `\` is the complement operator.
 *   - `i` is an indirect-addressing modifier in operand position.
 *   - Macros are introduced with `define <name> <params>` and closed with `term`.
 */

import type { StreamParser, StringStream } from "@codemirror/language";

// PDP-1 instruction mnemonics. Lower-case matches the source convention used in
// the surviving Spacewar listings. Any token in instruction position is
// highlighted as a keyword, which also covers Spacewar's user-defined macros.
const instructions: Record<string, boolean> = {
  lac: true, dac: true, lio: true, dio: true,
  add: true, sub: true, mul: true, mult: true, mus: true,
  div: true, idv: true, dis: true,
  and: true, ior: true, xor: true,
  sad: true, sas: true,
  dap: true, dip: true, dzm: true,
  idx: true, isp: true,
  jmp: true, jsp: true, jda: true, cal: true,
  xct: true, law: true,
  ral: true, rar: true, rcl: true, rcr: true, ril: true, rir: true,
  sal: true, sar: true, scl: true, scr: true, sil: true, sir: true,
  skp: true,
  sma: true, spa: true, sza: true, sna: true,
  szf: true, szs: true, spi: true, spq: true,
  sps: true, asp: true, clo: true,
  cla: true, cli: true, clc: true, clf: true, caf: true, cma: true,
  hlt: true, halt: true, lap: true, lat: true, nop: true, opr: true,
  stf: true, cmq: true, lpd: true, swap: true,
  iot: true, ioh: true,
  ppa: true, ppb: true, rpa: true, rpb: true,
  tyo: true, tyi: true, dpy: true, esm: true, lsm: true,
  cks: true, mcs: true, cbs: true, esc: true, lem: true,
};

const directives: Record<string, boolean> = {
  define: true, term: true, repeat: true,
  constants: true, variables: true,
  start: true, text: true, flexo: true,
  decimal: true, octal: true,
};

const operandModifiers: Record<string, boolean> = { i: true };

interface PDP1State {
  firstTokenOnLine: boolean;
  afterInstruction: boolean;
}

function tokenBase(stream: StringStream, state: PDP1State): string | null {
  // Section divider `///` — colour the whole line distinctly.
  if (stream.sol() && stream.match(/^\s*\/\/\//)) {
    stream.skipToEnd();
    return "heading";
  }

  if (stream.eatSpace()) return null;

  const ch = stream.peek();
  if (!ch) return null;

  // Comment: `/` to end of line.
  if (ch === "/") {
    stream.skipToEnd();
    return "comment";
  }

  // Literal-pool constant: `(335671`.
  if (ch === "(") {
    stream.next();
    stream.eatWhile(/[0-9.]/);
    return "number.special";
  }

  // Complement operator `\sym`.
  if (ch === "\\") {
    stream.next();
    return "operator";
  }

  // Numbers (octal by default).
  if (/\d/.test(ch)) {
    stream.next();
    stream.eatWhile(/[0-9]/);
    if (stream.peek() === ".") {
      stream.next();
      stream.eatWhile(/[0-9]/);
    }
    if (stream.peek() === "s") stream.next();
    state.firstTokenOnLine = false;
    state.afterInstruction = false;
    return "number";
  }

  // Bare `.` as the current-address symbol.
  if (ch === ".") {
    stream.next();
    state.firstTokenOnLine = false;
    state.afterInstruction = false;
    return "number.special";
  }

  // Operators and punctuation.
  if (/[+\-*=]/.test(ch)) {
    stream.next();
    return "operator";
  }

  if (ch === ",") {
    stream.next();
    return "punctuation";
  }

  // Identifiers.
  if (/[A-Za-z_]/.test(ch)) {
    stream.eatWhile(/[A-Za-z0-9_]/);
    const word = stream.current();
    const lower = word.toLowerCase();
    const wasFirst = state.firstTokenOnLine;
    state.firstTokenOnLine = false;

    if (directives[lower]) {
      state.afterInstruction = false;
      return "keyword.directive";
    }

    // Label definition: identifier immediately followed by `,` at statement start.
    if (wasFirst && stream.peek() === ",") {
      state.afterInstruction = false;
      return "labelName";
    }

    // Instruction position: known mnemonic → keyword (orange); anything else →
    // macroName (rose), covering both macro definitions and calls.
    if (wasFirst) {
      state.afterInstruction = true;
      return instructions[lower] ? "keyword" : "macroName";
    }

    // Indirect-addressing modifier `i` in operand position.
    if (operandModifiers[lower] && state.afterInstruction) {
      return "keyword.special";
    }

    // Known instructions still highlight even in non-first position.
    if (instructions[lower]) {
      state.afterInstruction = true;
      return "keyword";
    }

    state.afterInstruction = false;
    return "variableName";
  }

  // Unknown character — consume and move on so we never stall.
  stream.next();
  return null;
}

export const pdp1Parser: StreamParser<PDP1State> = {
  name: "pdp1",
  startState(): PDP1State {
    return { firstTokenOnLine: true, afterInstruction: false };
  },
  token(stream: StringStream, state: PDP1State): string | null {
    if (stream.sol()) {
      state.firstTokenOnLine = true;
      state.afterInstruction = false;
    }
    return tokenBase(stream, state);
  },
  languageData: { commentTokens: { line: "/" } },
};
