/**
 * Sample collations that ship with Source Variorum, loaded from the Sources
 * organiser's toolbar (the book icon), after the CCS Workbench sample pattern.
 * Each sample is a complete set of witnesses the engine collates live on load.
 * All sample texts are public-domain sources fetched from /public/demos.
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
  // Core versions (the development genealogy)
  { siglum: "1", title: "Spacewar! 1 (reconstructed)", date: "early 1962", provenance: "spacewar_1_early1962_reconstructed.txt", file: SW("spacewar_1_early1962_reconstructed.txt") },
  { siglum: "2b", title: "Spacewar! 2b (25 Mar 1962)", date: "25 Mar 1962", provenance: "spacewar_2b_25mar62.txt", file: SW("spacewar_2b_25mar62.txt") },
  { siglum: "2b′", title: "Spacewar! 2b (2 Apr 1962)", date: "2 Apr 1962", provenance: "spacewar_2b_2apr62.txt", file: SW("spacewar_2b_2apr62.txt") },
  { siglum: "3.1", title: "Spacewar! 3.1 (canonical)", date: "24 Sep 1962", provenance: "spacewar_3.1_complete.txt", file: SW("spacewar_3.1_complete.txt") },
  { siglum: "4.1f", title: "Spacewar! 4.1f (CHM)", date: "1963 / 2005", provenance: "spacewar_4.1f.txt", file: SW("spacewar_4.1f.txt") },
  { siglum: "4.2a", title: "Spacewar! 4.2a", date: "22 Feb 1963", provenance: "spacewar_4.2a.txt", file: SW("spacewar_4.2a.txt") },
  { siglum: "4.3", title: "Spacewar! 4.3 (Twin Star)", date: "17 May 1963", provenance: "spacewar_4.3f.txt", file: SW("spacewar_4.3f.txt") },
  { siglum: "4.4", title: "Spacewar! 4.4 (dual console)", date: "21 May 1963", provenance: "spacewar_4.4.txt", file: SW("spacewar_4.4.txt") },
  { siglum: "4.4f", title: "Spacewar! 4.4f", date: "1963", provenance: "spacewar_4.4f.txt", file: SW("spacewar_4.4f.txt") },
  { siglum: "4.8a", title: "Spacewar! 4.8 (part 1)", date: "1963", provenance: "spacewar_4.8_pt1.txt", file: SW("spacewar_4.8_pt1.txt") },
  { siglum: "4.8b", title: "Spacewar! 4.8 (part 2)", date: "1963", provenance: "spacewar_4.8_pt2.txt", file: SW("spacewar_4.8_pt2.txt") },
  { siglum: "4.8s", title: "Spacewar! 4.8 (scorer)", date: "1963", provenance: "spacewar_4.8_scorer.txt", file: SW("spacewar_4.8_scorer.txt") },
  { siglum: "41d", title: "Spacewar! 4.1d (combined)", date: "1963", provenance: "sw41d_combined.txt", file: SW("sw41d_combined.txt") },
  // Modern reconstructions / re-typings
  { siglum: "2bм", title: "Spacewar! 2b (2016 retype)", date: "2016", provenance: "spacewar_2b_m_2016.txt", file: SW("spacewar_2b_m_2016.txt") },
  { siglum: "sw15", title: "Spacewar! (2015 retype)", date: "2015", provenance: "spacewar2015.txt", file: SW("spacewar2015.txt") },
  // Disassemblies, patches, and supporting listings
  { siglum: "2b·d", title: "Spacewar! 2b — disassembly", date: "—", provenance: "spacewar_2b_disassembly.txt", file: SW("spacewar_2b_disassembly.txt") },
  { siglum: "rst·d", title: "Spacewar! restart — disassembly", date: "—", provenance: "spaceWarRstrt_disassembly.txt", file: SW("spaceWarRstrt_disassembly.txt") },
  { siglum: "rst", title: "Spacewar! auto-restart patch", date: "—", provenance: "spacewAutoRestartPatch.txt", file: SW("spacewAutoRestartPatch.txt") },
  { siglum: "ssw", title: "Spacewar! sense-switch settings", date: "—", provenance: "spacewar-senseswitches.txt", file: SW("spacewar-senseswitches.txt") },
  { siglum: "fio", title: "MACRO / FIO-DEC character set", date: "—", provenance: "macro_fiodec.txt", file: SW("macro_fiodec.txt") },
  // Related PDP-1 display programs (same milieu, in the CCS corpus)
  { siglum: "hs85", title: "Minskytron Hyperspace (85)", date: "1962", provenance: "hyperspace85.txt", file: SW("hyperspace85.txt") },
  { siglum: "hs·d", title: "Hyperspace 85 — disassembly", date: "—", provenance: "hyperspace85_disassembly.txt", file: SW("hyperspace85_disassembly.txt") },
  { siglum: "hs·doc", title: "Minskytron Hyperspace — how-to", date: "—", provenance: "minskytron-hyperspace-howto.txt", file: SW("minskytron-hyperspace-howto.txt") },
  { siglum: "snow", title: "Snowflake (SA-100)", date: "1962", provenance: "snowflake_sa-100.txt", file: SW("snowflake_sa-100.txt") },
  { siglum: "stars", title: "Expensive Planetarium (stars)", date: "1962", provenance: "stars_expensive_planetarium.txt", file: SW("stars_expensive_planetarium.txt") },
];

const OTHELLO_EDITIONS: DemoWitness[] = [
  { siglum: "F", title: "Othello — First Folio (1623, old spelling)", date: "1623", provenance: "Shakespeare's First Folio, original spelling (public domain; via Project Gutenberg #2270, normalised)", file: "demos/othello_folio1623.txt" },
  { siglum: "G", title: "Othello — Globe edition", date: "1866", provenance: "Clark & Wright, Globe edition (public domain; via the MIT Shakespeare / Moby text)", file: "demos/othello_globe.txt" },
  { siglum: "C", title: "Othello — Oxford (Craig)", date: "1914", provenance: "W. J. Craig, Oxford Shakespeare (public domain; via Bartleby)", file: "demos/othello_craig.txt" },
  { siglum: "W", title: "Othello — World Library", date: "1990–93", provenance: "World Library Complete Works (public domain; via Project Gutenberg #1793, normalised)", file: "demos/othello_pg1793.txt" },
];

export const DEMOS: Demo[] = [
  {
    id: "spacewar-corpus",
    name: "Spacewar! corpus (1962–63, full)",
    mode: "source",
    blurb: "The full CCS Spacewar! PDP-1 corpus — versions, disassemblies, related programs",
    shows: "Whole-genealogy collation — pick any two of 25 sources from the sidebar",
    witnessA: SPACEWAR_CORPUS[1], // 2b (25 Mar 1962)
    witnessB: SPACEWAR_CORPUS[3], // 3.1 (canonical)
    witnesses: SPACEWAR_CORPUS,
  },
  {
    id: "othello-editions",
    name: "Othello — four editions (Folio 1623 → World Library)",
    mode: "text",
    blurb: "Four public-domain Othellos incl. the original-spelling First Folio",
    shows: "Editorial + textual variation: old vs modern spelling, punctuation, lineation, Q/F readings",
    witnessA: OTHELLO_EDITIONS[1], // Globe (modern base)
    witnessB: OTHELLO_EDITIONS[0], // First Folio (old spelling)
    witnesses: OTHELLO_EDITIONS,
  },
  {
    id: "phaedrus",
    name: "Plato, Phaedrus (Jowett / Fowler)",
    mode: "text",
    blurb: "The dialogue on writing, in a free and a literal translation",
    shows: "Strong translation divergence — free literary vs literal renderings",
    witnessA: {
      siglum: "J",
      title: "Plato, Phaedrus — trans. Benjamin Jowett",
      date: "1892",
      provenance: "Jowett translation, full dialogue (public domain; via Project Gutenberg)",
      file: "demos/phaedrus_jowett.txt",
    },
    witnessB: {
      siglum: "F",
      title: "Plato, Phaedrus — trans. Harold N. Fowler",
      date: "1925",
      provenance: "Fowler translation, Loeb, full dialogue (public domain; via Perseus / PerseusDL)",
      file: "demos/phaedrus_fowler.txt",
    },
  },
];
