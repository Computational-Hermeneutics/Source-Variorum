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

/**
 * Tokenizer/normalisation settings (Juxta-style): what trivial differences to
 * ignore when deciding whether two readings count as the same. Defaults match
 * the engine's historical behaviour (ignore case + whitespace, keep punctuation).
 */
export interface NormalizeOptions {
  ignoreCase: boolean;
  ignorePunctuation: boolean;
  ignoreWhitespace: boolean;
}

export const DEFAULT_NORMALIZE: NormalizeOptions = {
  ignoreCase: true,
  ignorePunctuation: false,
  ignoreWhitespace: true,
};

/** Normalise a reading for comparison. With the defaults this collapses
 *  whitespace and lowercases, so trivial reflow/indentation/case differences do
 *  not register as variants; punctuation, case, or whitespace can each be kept
 *  significant by turning the corresponding flag off. Callers that need verbatim
 *  equality compare the raw strings separately. */
export function normalize(s: string, o: NormalizeOptions = DEFAULT_NORMALIZE): string {
  let r = s;
  if (o.ignoreWhitespace) r = r.replace(/\s+/g, " ").trim();
  if (o.ignorePunctuation) r = r.replace(/[^\p{L}\p{N}\s]/gu, "");
  if (o.ignoreCase) r = r.toLowerCase();
  return r;
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
export function similarity(a: string, b: string, o: NormalizeOptions = DEFAULT_NORMALIZE): number {
  const na = normalize(a, o);
  const nb = normalize(b, o);
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

/** True when two readings are the same up to the active normalisation. */
export function isMatch(a: string, b: string, o: NormalizeOptions = DEFAULT_NORMALIZE): boolean {
  return normalize(a, o) === normalize(b, o);
}
