/**
 * String similarity for the collation engine.
 *
 * We use Sørensen–Dice over character bigrams. It is O(n), needs no DP table,
 * and behaves well for both prose ("Moor" vs "Moore") and code lines (a renamed
 * label, a changed operand). Returns a score in [0, 1]; 1 means identical after
 * normalisation. This single primitive drives same-locus substitution/variant
 * typing AND cross-locus move detection, so the whole engine shares one notion
 * of "how alike are these two readings".
 */

/** Collapse runs of whitespace and lowercase, so trivial reflowing/indentation
 *  differences do not register as variants. Callers that need verbatim equality
 *  compare the raw strings separately. */
export function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/**
 * Dice coefficient over character bigrams of the normalised strings.
 * Short strings (0–1 chars) fall back to exact equality.
 */
export function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.length < 2 || nb.length < 2) return na === nb ? 1 : 0;

  const ga = bigrams(na);
  const gb = bigrams(nb);

  let intersection = 0;
  let totalA = 0;
  let totalB = 0;
  ga.forEach((countA, g) => {
    totalA += countA;
    const countB = gb.get(g) ?? 0;
    intersection += Math.min(countA, countB);
  });
  gb.forEach((countB) => {
    totalB += countB;
  });

  const denom = totalA + totalB;
  return denom > 0 ? (2 * intersection) / denom : 0;
}

/** True when two readings are the same up to whitespace/case normalisation. */
export function isMatch(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}
