/**
 * Loadable demo collations that ship with Source Variorum (picker in the header,
 * after the CCS Workbench sample-project pattern). Each demo is a complete pair
 * of witnesses the engine can collate on load, chosen to exercise the braid and
 * the apparatus across modes and variant types.
 *
 * Both demos are clearly labelled ILLUSTRATIVE: the source pair takes a genuine
 * excerpt of the 1962/63 Spacewar! source and reorders one macro to show how a
 * transposition reads in the braid; the prose pair stages well-known Othello
 * Quarto/Folio variant readings. They demonstrate the instrument; they are not
 * authoritative critical texts.
 */

import type { CollationMode } from "@/types/collation";

export interface DemoWitness {
  siglum: string;
  title: string;
  date?: string;
  provenance?: string;
  text: string;
}

export interface Demo {
  id: string;
  name: string;
  mode: CollationMode;
  /** One line shown in the picker. */
  blurb: string;
  /** What variant types this demo is good for showing. */
  shows: string;
  witnessA: DemoWitness;
  witnessB: DemoWitness;
}

// Real excerpt of the Spacewar! macro definitions (fio-dec system, June 1963).
const SPACEWAR_A = `/macro fio-dec system, june 1963

	szm=sza sma-szf
	spq=szm i
	clc=cma+cla-opr

	define senseswitch A
	repeat 3, A=A+A
	szs A
	term

	define init A,B
	law B
	dap A
	term

	define index A,B,C
	idx A
	sas B
	jmp C
	term

	define listen
	cla+cli+clf 1-opr-opr
	szf i 1
	jmp .-1
	tyi
	term

	define swap
	rcl 9s
	rcl 9s
	term
`;

// The same excerpt with the `index` macro relocated to the foot of the block —
// an illustrative reordering, so the braid shows a clean transposition ribbon.
const SPACEWAR_B = `/macro fio-dec system, june 1963

	szm=sza sma-szf
	spq=szm i
	clc=cma+cla-opr

	define senseswitch A
	repeat 3, A=A+A
	szs A
	term

	define init A,B
	law B
	dap A
	term

	define listen
	cla+cli+clf 1-opr-opr
	szf i 1
	jmp .-1
	tyi
	term

	define swap
	rcl 9s
	rcl 9s
	term

	define index A,B,C
	idx A
	sas B
	jmp C
	term
`;

// Illustrative Othello 5.2 readings. "ought/aught", "lou'd/loued" are spelling
// variants; "Indian/Iudean" is the celebrated Quarto/Folio crux (substitution).
const OTHELLO_Q = `Speake of me as I am, nothing extenuate, nor set downe ought in malice. Then must you speake of one that lou'd not wisely, but too well. Of one whose hand, like the base Indian, threw a pearle away richer then all his tribe.`;

const OTHELLO_F = `Speake of me as I am, nothing extenuate, nor set downe aught in malice. Then must you speake of one that loued not wisely, but too well. Of one whose hand, like the base Iudean, threw a pearle away richer then all his tribe.`;

export const DEMOS: Demo[] = [
  {
    id: "spacewar-macros",
    name: "Spacewar! macro block (source)",
    mode: "source",
    blurb: "Two arrangements of the Spacewar! fio-dec macro definitions",
    shows: "Transposition (a relocated macro), verbatim matches",
    witnessA: {
      siglum: "S1",
      title: "Spacewar! source — fio-dec system",
      date: "June 1963",
      provenance: "Excerpt of spacewar.mac (illustrative)",
      text: SPACEWAR_A,
    },
    witnessB: {
      siglum: "S2",
      title: "Spacewar! source — reordered macros",
      date: "illustrative",
      provenance: "Same excerpt with the index macro relocated",
      text: SPACEWAR_B,
    },
  },
  {
    id: "othello-q-f",
    name: "Othello 5.2 (Quarto / Folio)",
    mode: "text",
    blurb: "Othello's final speech across the Quarto and Folio readings",
    shows: "Substitution (Indian/Iudean), spelling variants",
    witnessA: {
      siglum: "Q1",
      title: "Othello, First Quarto",
      date: "1622",
      provenance: "Illustrative reading",
      text: OTHELLO_Q,
    },
    witnessB: {
      siglum: "F1",
      title: "Othello, First Folio",
      date: "1623",
      provenance: "Illustrative reading",
      text: OTHELLO_F,
    },
  },
];
