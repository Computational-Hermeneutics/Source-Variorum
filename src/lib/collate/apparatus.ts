/**
 * Derive the critical apparatus from the engine output.
 *
 * Every non-match variant becomes one apparatus entry, tied to its variant id and
 * a locus (line range in the base text, or the leading words of the lemma). The
 * readings are keyed by siglum so the panel can render in classical apparatus
 * style (e.g. "Moor] Q1; Moore F1"). Editor notes/categories live separately in
 * `Collation.apparatusEdits` and are merged in at runtime, so re-collating never
 * destroys the editor's commentary.
 */

import type {
  ApparatusEntry,
  Collation,
  Variant,
  Witness,
} from "@/types/collation";

const LEMMA_WORDS = 6;

function lemmaFor(v: Variant, mode: Collation["mode"]): string {
  const source = v.textA || v.textB;
  const words = source.trim().split(/\s+/).filter(Boolean);
  const head = words.slice(0, LEMMA_WORDS).join(" ");
  const ellipsis = words.length > LEMMA_WORDS ? " …" : "";
  const span = v.a ?? v.b;
  const locus =
    span && mode === "source"
      ? span.startLine === span.endLine
        ? `l. ${span.startLine}`
        : `ll. ${span.startLine}–${span.endLine}`
      : "";
  const lead = head ? `${head}${ellipsis}` : "(blank)";
  return locus ? `${locus}: ${lead}` : lead;
}

export function buildApparatus(
  variants: Variant[],
  witnessA: Witness,
  witnessB: Witness,
  collation: Collation
): ApparatusEntry[] {
  return variants
    .filter((v) => v.type !== "match")
    .map((v): ApparatusEntry => {
      const readings: Record<string, string> = {};
      if (v.textA) readings[witnessA.siglum] = v.textA.trim();
      if (v.textB) readings[witnessB.siglum] = v.textB.trim();
      const edit = collation.apparatusEdits[v.id];
      return {
        id: `app-${v.id}`,
        variantId: v.id,
        type: v.type,
        lemma: lemmaFor(v, collation.mode),
        readings,
        note: edit?.note ?? "",
        category: edit?.category,
      };
    });
}
