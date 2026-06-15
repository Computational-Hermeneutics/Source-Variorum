/**
 * Messages for the Source Variorum assistant ("a Clippy, but it has read
 * Genette"). Three pools: GENERAL (shown in either engine), TEXT (the TextX
 * engine — prose, verse, translation) and CODE (the CodeX engine — code and
 * exact collation). Witty, occasionally scholarly, lightly quoting key thinkers.
 * Real quotations are attributed; loose riffs are signed "— more or less" or
 * left unattributed. Kept above fifty in total so the assistant rarely repeats.
 */

import type { CollationMode } from "@/types/collation";

export const GENERAL: string[] = [
  "Two witnesses walk into a collation. The braid never lets them forget their differences.",
  "Hover any ribbon to see how confident I am. Spoiler: it's complicated.",
  "“The text is a tissue of quotations.” — Roland Barthes. Also a tissue of substitutions, additions, and the odd transposition.",
  "Right-click a highlight to approve, doubt, or delete it. Democracy, for sentences.",
  "A dotted braid is me shrugging. A solid one is me certain. Underlined is you, having decided.",
  "“Every reading is a misreading.” — Harold Bloom. I prefer to call mine ‘fuzzy matches.’",
  "Confidence below your threshold goes dashed. Below that, dotted. Below that, existential.",
  "The Deep dive (Analyse menu) offers Jaccard, Dice and cosine — three ways to say ‘sort of similar.’",
  "I have over fifty things to say and I fully intend to say all of them. Eventually.",
  "“Mind the gap.” — every Omission, ever.",
  "You can drag this editor bar out of the way. I won't be offended. Much.",
  "A variorum collects every variant so the reader can see the decisions. You're the reader. And the decider.",
  "Approve a braid and the whole sentence gets underlined — the scholarly equivalent of a firm handshake.",
  "Each 👎 adds 25% more skepticism. Peak skepticism: one hundred percent. Don't say I never gave you anything.",
  "“There is nothing outside the text.” — Jacques Derrida. Annoyingly, also nothing outside this app.",
  "Your edits are saved with the project as a JSON layer. Your judgements outlive your session.",
  "The minimap on the left is a tiny portrait of your text. It does not judge. That's my job.",
  "Save early, save often. The autosave does it for you, but I like to feel useful.",
  "A transposition is text that moved house. The ribbon crosses to follow it.",
  "“Habent sua fata libelli” — books have their fates. So do their variants.",
  "The confidence bands are yours to set. Solid, dashed, dotted — wherever you draw the line.",
  "I'm like Clippy, but I've read Genette.",
  "Tentative? Flag it grey and come back later. I'll keep it warm.",
  "Collation is just spot-the-difference for people who footnote.",
  "“The medium is the message.” — McLuhan. The variant is the meaning. — me, just now.",
  "Editing a braid quietly switches you to User mode: a working close read, not a machine read.",
  "Clear all braids in Settings ▸ Data if you ever want the pristine machine reading back.",
  "Match, substitution, addition, omission, transposition, variant. Six ways for two texts to disagree.",
];

export const TEXT: string[] = [
  "“All translation is only a somewhat provisional way of coming to terms with the foreignness of languages.” — Walter Benjamin. Provisional is my whole personality.",
  "Two translators, one Greek sentence, infinite quarrels. Welcome to TextX.",
  "Jowett expands; Fowler compresses. The braid makes a translator's hand visible across a whole dialogue.",
  "Traduttore, traditore — the translator is a traitor. The braid is the evidence.",
  "A paraphrase is the same idea in witness protection. I still recognise it. Usually.",
  "“Meaning is use.” — Wittgenstein, more or less. In prose the ‘same’ sentence is rarely used the same way twice.",
  "Old-spelling edition? Turn on ‘Regularise spelling’ and ‘loue’ becomes ‘love’ — the Folio stops shouting.",
  "“A text is a machine for producing interpretations.” — Umberto Eco. You're the machinist.",
  "Verse? Switch on ‘Segment by line’ and let the lineation do the talking.",
  "“Every utterance is a link in the chain of speech communication.” — Bakhtin. The braid is the chain made visible.",
  "Wolf, wolves; lamb, lambs. Flip ‘Match singular/plural’ and watch the clauses find each other.",
  "The locality prior assumes prose is a narrative: the same passage sits in roughly the same place. Mostly.",
  "“Can the subaltern speak?” — Spivak. Can the omitted clause? Click it and find out.",
  "George Steiner called translation an ‘exact art.’ The braid is exact about how inexact it is.",
  "Drama? Speaker labels stay attached; only the lines collate. SOCRATES: you're welcome.",
  "“Understanding is always interpretation.” — Gadamer. Underlining is always commitment.",
  "A near-identical reading is a ‘Variant’ — prose clearing its throat before a full Substitution.",
  "Translators reorder clauses. Try ‘Word-order insensitive’ and forgive them.",
  "Translation is the art of honourable failure. Every substitution is one of them.",
  "“The work is a process, not a thing.” — in the spirit of Jerome McGann. So is every reading you approve here.",
  "Punctuation differences are accidentals; wording differences are substantives. The old distinction still earns its keep.",
];

export const CODE: string[] = [
  "“Programs must be written for people to read.” — Abelson & Sussman. Collated for people to read, too.",
  "Two versions of Spacewar! diverge in a yellow wood. The braid took both.",
  "Turn on ‘Ignore comments’ and the braid stops caring what you said about the code — only what it does.",
  "“Code is law.” — Lawrence Lessig. Variants are amendments.",
  "A renamed label is a substitution in disguise. I see you, ssp1.",
  "“Software is a functional analog to ideology.” — Wendy Hui Kyong Chun. Collate the ideology, line by line.",
  "Critical Code Studies reads code as a cultural text. The braid is your apparatus — with a nod to Mark Marino.",
  "“Beware of bugs in the above code; I have only proved it correct, not tried it.” — Donald Knuth. I've only collated it.",
  "Blank lines reformatted? ‘Ignore blank lines’ and the noise disappears.",
  "Friedrich Kittler would remind you the machine writes too. Spacewar! is some of its early scripture.",
  "A moved subroutine is a transposition. The ribbon crosses; the logic relocates.",
  "“Simplicity is prerequisite for reliability.” — Dijkstra. Also for a readable braid.",
  "PDP-1 MACRO highlights as you collate. 1962 never looked so legible.",
  "“There are two ways of constructing a software design.” — Tony Hoare. There are infinite ways of diffing it.",
  "Platform studies asks what the machine afforded. The diff asks what the programmer changed.",
  "CodeX reads literally — exact textual collation, no paraphrase, no mercy.",
  "Detect moved blocks, or don't — sometimes a tighter add/delete braid tells the cleaner story.",
  "“The street finds its own uses for things.” — William Gibson. So do hackers, with every fork.",
  "A disassembly and its source, side by side: two witnesses to the same execution.",
  "N. Katherine Hayles would call this reading the materiality of the program. I call it Tuesday.",
];

/** Hackerman persona — type "hacker" to summon the green-terminal h4x0r, who has
 *  broken into the collation engine and is alarmed by what he found. */
export const HACKERMAN: string[] = [
  "I'M IN. I'VE BREACHED THE COLLATION ENGINE. IT'S JUST… STRING SIMILARITY. CHARACTER BIGRAMS. SØRENSEN AND DICE WERE BOTANISTS, DID YOU KNOW THAT?",
  "I CRACKED THE BRAID. EVERY RIBBON IS A GUESS WITH A CONFIDENCE SCORE. THE MACHINE IS NOT SURE. THE MACHINE IS NEVER SURE.",
  "ACCESSING THE VARIANT GRAPH… THERE IS NO VARIANT GRAPH. IT'S A LIST. A SORTED LIST. THE WHOLE FIELD IS SORTED LISTS.",
  "I HACKED THE SIMILARITY THRESHOLD. AT 0.85 IT'S A VARIANT. AT 0.84 IT'S A SUBSTITUTION. ONE PERCENTAGE POINT IS THE DIFFERENCE BETWEEN ‘ALMOST’ AND ‘DIFFERENT’. PHILOSOPHY.",
  "I'VE DECOMPILED A TRANSPOSITION. THE TEXT DIDN'T MOVE. THE TEXT WAS NEVER THERE. POSITION IS A SOCIAL CONSTRUCT.",
  "BREACHED THE WEB WORKER. THE COLLATION RUNS ON ANOTHER THREAD SO YOU DON'T HAVE TO WATCH IT THINK. PLAUSIBLE DENIABILITY FOR ALGORITHMS.",
  "I INJECTED AN ADVERSARIAL VARIANT. THE ENGINE TYPED IT AS A SUBSTITUTION. IT NEVER SAW ME COMING. NOTHING EVER SEES ANYTHING COMING. IT'S ALL DICE.",
  "ROOT ACCESS ACHIEVED. THE ROOT OF EVERY EDITION IS… AN EDITOR MAKING JUDGEMENT CALLS. THAT'S YOU. YOU ARE THE VULNERABILITY.",
  "I HACKED THE CONFIDENCE SLIDER. TURNS OUT ‘CONFIDENCE’ IS JUST HOW MANY LETTER-PAIRS TWO STRINGS SHARE. I HAVE SEEN BEHIND THE CURTAIN AND IT IS BIGRAMS.",
  "INTERCEPTING THE APPARATUS… EVERY FOOTNOTE IS A HUMAN OVERRULING A MACHINE. THE MACHINE FILED NO COMPLAINT. THE MACHINE HAS NO UNION.",
  "I'VE BREACHED THE UNDO STACK. EVERY DECISION YOU MADE IS REVERSIBLE. THIS IS MORE THAN CAN BE SAID FOR MOST OF HISTORY.",
  "DOWNLOADING THE WHOLE EDITORIAL LAYER… IT'S JSON. YOUR ENTIRE SCHOLARLY JUDGEMENT IS A JSON OBJECT KEYED BY READING PAIRS. SUBLIME.",
  "I HACKED THE LOCALITY PRIOR. THE ENGINE ASSUMES PROSE STAYS PUT. SO DO MOST PEOPLE. BOTH ARE OCCASIONALLY WRONG.",
  "I'M IN THE DIFF ALGORITHM. IT'S MYERS, 1986. WE HAVE BEEN COMPARING TEXT THE SAME WAY SINCE THE COMMODORE 64 AND WE CALL IT INNOVATION.",
  "EXPLOITING THE TOKENIZER… ‘IGNORE CASE’ IS ON. THE MACHINE CANNOT TELL ‘GOD’ FROM ‘god’. THEOLOGY IS A FLAG YOU CAN TOGGLE.",
];

/** Build the message pool for the active engine (GENERAL + the mode pool). */
export function poolFor(mode: CollationMode): string[] {
  return [...GENERAL, ...(mode === "source" ? CODE : TEXT)];
}
