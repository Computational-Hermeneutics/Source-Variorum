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
}

// Illustrative Othello 5.2 readings. "ought/aught", "lou'd/loued" are spelling
// variants; "Indian/Iudean" is the celebrated Quarto/Folio crux (substitution).
const OTHELLO_Q = `Speake of me as I am, nothing extenuate, nor set downe ought in malice. Then must you speake of one that lou'd not wisely, but too well. Of one whose hand, like the base Indian, threw a pearle away richer then all his tribe.`;

const OTHELLO_F = `Speake of me as I am, nothing extenuate, nor set downe aught in malice. Then must you speake of one that loued not wisely, but too well. Of one whose hand, like the base Iudean, threw a pearle away richer then all his tribe.`;

// Plato, Meno, opening (Stephanus 70a–71a) in two public-domain English
// translations. Verbatim: Jowett (1892, via the MIT Classics Archive) and Lamb
// (1924 Loeb, via Perseus). A real translation-variant collation — note the
// word-order transposition "riches and their riding" / "riding and their riches".
const MENO_JOWETT = `Can you tell me, Socrates, whether virtue is acquired by teaching or by practice; or if neither by teaching nor practice, then whether it comes to man by nature, or in what other way?

O Meno, there was a time when the Thessalians were famous among the other Hellenes only for their riches and their riding; but now, if I am not mistaken, they are equally famous for their wisdom, especially at Larisa, which is the native city of your friend Aristippus.`;

const MENO_LAMB = `Can you tell me, Socrates, whether virtue can be taught, or is acquired by practice, not teaching? Or if neither by practice nor by learning, whether it comes to mankind by nature or in some other way?

Meno, of old the Thessalians were famous and admired among the Greeks for their riding and their riches; but now they have a name, I believe, for wisdom also, especially your friend Aristippus's people, the Larisaeans.`;

export const DEMOS: Demo[] = [
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
    id: "meno-translations",
    name: "Plato, Meno (Jowett / Lamb)",
    mode: "text",
    blurb: "The opening of Plato's Meno in two public-domain translations",
    shows: "Translation variants, word-order transposition, substitutions",
    witnessA: {
      siglum: "J",
      title: "Plato, Meno — trans. Benjamin Jowett",
      date: "1892",
      provenance: "Jowett translation (public domain; via MIT Classics Archive)",
      text: MENO_JOWETT,
    },
    witnessB: {
      siglum: "L",
      title: "Plato, Meno — trans. W. R. M. Lamb",
      date: "1924",
      provenance: "Lamb translation, Loeb (public domain; via Perseus)",
      text: MENO_LAMB,
    },
  },
];
