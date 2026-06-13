/**
 * Quantitative summary of a collation, for the deep-dive panel.
 * Combines variant-type tallies derived from the engine output with the
 * set/frequency similarity metrics reused from LLMbench's text-metrics.
 */

import type { CollationMetrics, Variant, VariantType, Witness } from "@/types/collation";
import { VARIANT_TYPES } from "@/types/collation";
import {
  computeWordOverlap,
  computeCosineSimilarity,
} from "@/lib/metrics/text-metrics";

export function computeCollationMetrics(
  variants: Variant[],
  witnessA: Witness,
  witnessB: Witness
): CollationMetrics {
  const counts = Object.fromEntries(
    VARIANT_TYPES.map((t) => [t, 0])
  ) as Record<VariantType, number>;

  let matchedChars = 0;
  let movedBlocks = 0;
  let movedLength = 0;
  let longestMove = 0;

  for (const v of variants) {
    counts[v.type]++;
    if (v.type === "match") matchedChars += v.textA.length;
    if (v.type === "transposition") {
      movedBlocks++;
      movedLength += v.length;
      if (v.length > longestMove) longestMove = v.length;
    }
  }

  const baseLen = witnessA.text.length || 1;
  const verbatimPercent = (matchedChars / baseLen) * 100;

  const overlap = computeWordOverlap(witnessA.text, witnessB.text);
  const cosine = computeCosineSimilarity(witnessA.text, witnessB.text);

  return {
    counts,
    verbatimPercent,
    movedBlocks,
    movedLength,
    longestMove,
    jaccard: overlap.jaccardSimilarity,
    dice: overlap.diceCoefficient,
    cosine,
  };
}
