/**
 * Core data model for Source Variorum.
 *
 * A COLLATION owns N witnesses (MVP renders two at a time in the braid; the
 * model is N-ready so a base text plus multiple witnesses can be added in a
 * later phase without reshaping persistence). The collation engine in
 * `src/lib/collate/` turns a pair of witnesses into a list of typed VARIANTs,
 * from which the braid, the critical apparatus, and the deep-dive metrics are
 * all derived. UI never recomputes alignment; it consumes engine output.
 */

import type { LineAnnotation } from "./annotations";
import type { CrossPanelLink } from "./links";

/** Global reading register. Changes tokenizer, typography, and locus style. */
export type CollationMode = "source" | "text";

/** A single version of the text under collation (a "witness" in textual-criticism terms). */
export interface Witness {
  id: string;
  /** Short label used throughout the apparatus, e.g. "Q1" / "F1" or "v1.0". */
  siglum: string;
  /** Full human title, e.g. "Othello, First Quarto (1622)". */
  title: string;
  /** Optional provenance / source note (where this witness came from). */
  provenance?: string;
  /** Optional date string (free-form: "1622", "1962-04", etc.). */
  date?: string;
  /** Optional folder this witness is filed under in the Sources organiser. */
  folder?: string;
  /** The raw text. Kept verbatim; annotations and variants reference offsets into it. */
  text: string;
  /** Immutable original text, snapshotted on creation/import. Editing changes
   *  `text` but never this, so the source can always be reverted to clean. */
  original?: string;
}

/** What kind of difference a variant records, relative to the base/left witness. */
export type VariantType =
  | "match" // verbatim, in the same place
  | "substitution" // both sides present, different reading at the same locus
  | "addition" // present only on the right (B) side
  | "deletion" // present only on the left (A) side
  | "transposition" // the same (or near-identical) text, moved to a different place
  | "variant"; // fuzzy / near-identical reading (edit-distance match below identity)

export const VARIANT_TYPES: VariantType[] = [
  "match",
  "substitution",
  "addition",
  "deletion",
  "transposition",
  "variant",
];

export const VARIANT_TYPE_LABELS: Record<VariantType, string> = {
  match: "Match",
  substitution: "Substitution",
  addition: "Addition",
  deletion: "Deletion",
  transposition: "Transposition",
  variant: "Variant",
};

/** Display label for a variant type, mode-aware: in Text mode left-only text is
 *  an "Omission" (apparatus term); in Source mode it's a "Deletion" (version diff). */
export function variantLabel(type: VariantType, mode: CollationMode): string {
  if (mode === "text" && type === "deletion") return "Omission";
  return VARIANT_TYPE_LABELS[type];
}

/** Colours for tinting passages and ribbons. Editorial palette, not Vector Lab. */
export const VARIANT_TYPE_COLORS: Record<VariantType, string> = {
  match: "#9fb8c4", // muted blue (the braid's resting colour)
  substitution: "#b8862e", // ochre
  addition: "#3f7d5b", // green (B-only)
  deletion: "#9c3b3b", // burgundy-red (A-only)
  transposition: "#3563a8", // strong blue (moved — the analytical payload)
  variant: "#7a5ea8", // violet (fuzzy)
};

/** A half-span: a character range within one witness's `text`. */
export interface Span {
  /** Character offset (inclusive) into the witness text. */
  start: number;
  /** Character offset (exclusive) into the witness text. */
  end: number;
  /** First line number this span touches (1-based), for source-mode locus refs. */
  startLine: number;
  /** Last line number this span touches (1-based). */
  endLine: number;
}

/**
 * A word-level run inside a substitution/variant locus. `changed` words differ
 * between the two readings and are tinted; unchanged words are shared and render
 * untinted at rest, so the eye lands on the actual divergence within a sentence.
 */
export interface WordRun {
  start: number;
  end: number;
  changed: boolean;
}

/**
 * One aligned unit between witness A (left) and witness B (right).
 * Additions have no `a`; deletions have no `b`. Everything else has both.
 */
export interface Variant {
  id: string;
  type: VariantType;
  /** Span in witness A (absent for pure additions). */
  a?: Span;
  /** Span in witness B (absent for pure deletions). */
  b?: Span;
  /** The A-side string (empty for additions). */
  textA: string;
  /** The B-side string (empty for deletions). */
  textB: string;
  /** Token/char length used for ribbon thickness (max of the two sides). */
  length: number;
  /** 0–1 similarity between the two readings (1 = verbatim; <1 = fuzzy/substitution). */
  similarity: number;
  /** True for editor-made links (Advanced mode), false/absent for auto variants. */
  manual?: boolean;
  /** Word-level runs within the A-side span (substitution/variant only). */
  aWords?: WordRun[];
  /** Word-level runs within the B-side span (substitution/variant only). */
  bWords?: WordRun[];
}

/**
 * One entry in the critical apparatus: a locus where witnesses diverge,
 * with an editable scholarly note. Auto-generated from a Variant, then annotated.
 */
export interface ApparatusEntry {
  id: string;
  /** The variant this entry documents. */
  variantId: string;
  type: VariantType;
  /** Lemma / locus label shown in the apparatus (e.g. line range or leading words). */
  lemma: string;
  /** Reading by siglum, e.g. { Q1: "Moor", F1: "Moore" }. */
  readings: Record<string, string>;
  /** Editor's note (free text). Empty until the editor writes one. */
  note: string;
  /** Optional interpretive category, reusing the cross-panel relation vocabulary. */
  category?: string;
}

/** Summary statistics for the deep-dive panel. */
export interface CollationMetrics {
  counts: Record<VariantType, number>;
  /** Percentage of base-text characters that are verbatim matches. */
  verbatimPercent: number;
  /** Number of transposed (moved) blocks. */
  movedBlocks: number;
  /** Total character length of moved blocks. */
  movedLength: number;
  /** Longest single moved block length. */
  longestMove: number;
  jaccard: number;
  dice: number;
  cosine: number;
}

/** A character range within one witness's text (for hand-made links). */
export interface ManualSpan {
  start: number;
  end: number;
}

/** An editor-made link between passages, created in Advanced mode. It overrides
 *  the auto-collation wherever it overlaps. Addition has no `a`; omission no `b`. */
export interface ManualLink {
  id: string;
  type: VariantType;
  a?: ManualSpan;
  b?: ManualSpan;
}

/** A full collation, the unit of persistence and JSON export/import. */
export interface Collation {
  id: string;
  name: string;
  mode: CollationMode;
  witnesses: Witness[];
  /** Index into `witnesses` marked as base / copy-text. */
  baseIndex: number;
  /** Witness id shown in the left (A) panel of the braid. */
  leftId: string;
  /** Witness id shown in the right (B) panel of the braid. */
  rightId: string;
  /** Per-witness marginal annotations, keyed by witness id. */
  annotations: Record<string, LineAnnotation[]>;
  /** Cross-witness interpretive links (apparatus relations). */
  links: CrossPanelLink[];
  /** Editor-edited apparatus entries, keyed by variant id (auto-entries merged at runtime). */
  apparatusEdits: Record<string, Pick<ApparatusEntry, "note" | "category">>;
  /** Editor-made manual links, keyed by the witness pair `${leftId}|${rightId}`.
   *  They override the auto-collation for that specific pairing. */
  manualLinks?: Record<string, ManualLink[]>;
  /** Explicit folder names in the Sources organiser (incl. ones with no witness yet). */
  folders?: string[];
  /** Soft-deleted witnesses, recoverable from the organiser's trash. */
  trash?: Witness[];
  createdAt: string;
  updatedAt: string;
}

/** The on-disk / localStorage envelope, versioned for forward migration. */
export interface SavedCollation extends Collation {
  schemaVersion: 1;
}
