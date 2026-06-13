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
  /** Inline witness text (for short demos). */
  text?: string;
  /** Path under /public to fetch the witness text from (for large real sources). */
  file?: string;
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
  /** For multi-witness corpora: all sources loaded into the project. When set,
   *  witnessA/witnessB name the two shown first in the braid. */
  witnesses?: DemoWitness[];
}

// The Spacewar! 1962–63 source corpus, as collected in the CCS Workbench sample
// set (bitsavers / Computer History Museum reconstructions). Loaded as a single
// project so any two versions can be braided from the Sources sidebar.
const SW = (file: string): string => `demos/spacewar-1962/${file}`;
const SPACEWAR_CORPUS: DemoWitness[] = [
  { siglum: "1", title: "Spacewar! 1 (reconstructed)", date: "early 1962", provenance: "spacewar_1_early1962_reconstructed.txt", file: SW("spacewar_1_early1962_reconstructed.txt") },
  { siglum: "2b", title: "Spacewar! 2b", date: "25 Mar 1962", provenance: "spacewar_2b_25mar62.txt", file: SW("spacewar_2b_25mar62.txt") },
  { siglum: "2b′", title: "Spacewar! 2b", date: "2 Apr 1962", provenance: "spacewar_2b_2apr62.txt", file: SW("spacewar_2b_2apr62.txt") },
  { siglum: "3.1", title: "Spacewar! 3.1 (canonical)", date: "24 Sep 1962", provenance: "spacewar_3.1_complete.txt", file: SW("spacewar_3.1_complete.txt") },
  { siglum: "4.1f", title: "Spacewar! 4.1f (CHM)", date: "1963 / 2005", provenance: "spacewar_4.1f.txt", file: SW("spacewar_4.1f.txt") },
  { siglum: "4.2a", title: "Spacewar! 4.2a", date: "22 Feb 1963", provenance: "spacewar_4.2a.txt", file: SW("spacewar_4.2a.txt") },
  { siglum: "4.3", title: "Spacewar! 4.3 (Twin Star)", date: "17 May 1963", provenance: "spacewar_4.3f.txt", file: SW("spacewar_4.3f.txt") },
  { siglum: "4.4", title: "Spacewar! 4.4 (dual console)", date: "21 May 1963", provenance: "spacewar_4.4.txt", file: SW("spacewar_4.4.txt") },
];

// Illustrative Othello 5.2 readings. "ought/aught", "lou'd/loued" are spelling
// variants; "Indian/Iudean" is the celebrated Quarto/Folio crux (substitution).
const OTHELLO_Q = `Speake of me as I am, nothing extenuate, nor set downe ought in malice. Then must you speake of one that lou'd not wisely, but too well. Of one whose hand, like the base Indian, threw a pearle away richer then all his tribe.`;

const OTHELLO_F = `Speake of me as I am, nothing extenuate, nor set downe aught in malice. Then must you speake of one that loued not wisely, but too well. Of one whose hand, like the base Iudean, threw a pearle away richer then all his tribe.`;


export const DEMOS: Demo[] = [
  {
    id: "spacewar-corpus",
    name: "Spacewar! corpus (1962–63, 8 versions)",
    mode: "source",
    blurb: "Eight versions of the Spacewar! PDP-1 source as one project",
    shows: "Whole-genealogy collation — pick any two versions from the sidebar",
    witnessA: SPACEWAR_CORPUS[1], // 2b (25 Mar 1962)
    witnessB: SPACEWAR_CORPUS[3], // 3.1 (canonical)
    witnesses: SPACEWAR_CORPUS,
  },
  {
    id: "spacewar-2b-41d",
    name: "Spacewar! 2b (1962) / 4.1d (1963)",
    mode: "source",
    blurb: "Two historical versions of the Spacewar! PDP-1 source",
    shows: "Real version-to-version evolution: additions, transpositions, substitutions",
    witnessA: {
      siglum: "2b",
      title: "Spacewar! 2b",
      date: "25 March 1962",
      provenance: "spacewar_2b_25mar62.txt (via CCS Workbench sample corpus)",
      file: "demos/spacewar_2b_25mar62.txt",
    },
    witnessB: {
      siglum: "4.1d",
      title: "Spacewar! 4.1d",
      date: "20 Feb 1963 (CHM listing, 2005)",
      provenance: "sw41d.txt (bitsavers.org/pdf/mit/rle_pdp1/spacewar)",
      file: "demos/sw41d.txt",
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
  {
    id: "othello-editions",
    name: "Othello — Globe 1866 / Craig 1914",
    mode: "text",
    blurb: "Two modern editions of Othello, fifty years apart",
    shows: "Editorial variation: punctuation, capitalisation, lineation, readings",
    witnessA: {
      siglum: "G",
      title: "Othello — Globe edition",
      date: "1866",
      provenance: "Clark & Wright, Globe edition (public domain; via the MIT Shakespeare / Moby text)",
      file: "demos/othello_globe.txt",
    },
    witnessB: {
      siglum: "C",
      title: "Othello — Oxford edition (Craig)",
      date: "1914",
      provenance: "W. J. Craig, Oxford Shakespeare (public domain; via Bartleby)",
      file: "demos/othello_craig.txt",
    },
  },
  {
    id: "meno-full",
    name: "Plato, Meno — full (Jowett / Lamb)",
    mode: "text",
    blurb: "The complete Meno in two public-domain translations",
    shows: "Translation variants across a whole dialogue: phrasing, idiom, structure",
    witnessA: {
      siglum: "J",
      title: "Plato, Meno — trans. Benjamin Jowett",
      date: "1892",
      provenance: "Jowett translation, full dialogue (public domain; via Project Gutenberg)",
      file: "demos/meno_jowett.txt",
    },
    witnessB: {
      siglum: "L",
      title: "Plato, Meno — trans. W. R. M. Lamb",
      date: "1924",
      provenance: "Lamb translation, Loeb, full dialogue (public domain; via Perseus / PerseusDL)",
      file: "demos/meno_lamb.txt",
    },
  },
];
