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
  /** CX-Engine: strip line/block comments (`;` `//` `#` `/* … *​/`) before
   *  matching, so re-commented or de-commented code still aligns to its twin. */
  ignoreComments?: boolean;
  /** TX-Engine: fold early-modern ↔ modern orthography (long-s, u/v and i/j
   *  allographs, vv→w, doubled letters, word-final -e) so old-spelling and
   *  modernised witnesses align. Heuristic and deliberately aggressive: it can
   *  over-merge (e.g. "hat"≈"hate"), so it is off by default. */
  regulariseSpelling?: boolean;
  /** TX-Engine: compare readings as a bag of words (sort tokens) so two passages
   *  with the same words in a different order count as the same reading — a
   *  reordered clause is a match/variant, not an unrelated substitution. */
  ignoreWordOrder?: boolean;
  /** TX-Engine: fold a regular plural to its singular for matching (strip a
   *  trailing -s, not -ss), so "lambs"≈"lamb", "lovers"≈"lover", "loves"≈"love".
   *  Helps a passage like "As wolves love lambs…" align with "…the wolf loves the
   *  lamb…". Irregular plurals (wolves→wolf) aren't fully regularised, but the
   *  regular ones around them lift the similarity enough to pair the clause. */
  matchPluralSingular?: boolean;
}

export const DEFAULT_NORMALIZE: NormalizeOptions = {
  ignoreCase: true,
  ignorePunctuation: false,
  ignoreWhitespace: true,
  ignoreComments: false,
  regulariseSpelling: false,
  ignoreWordOrder: false,
  matchPluralSingular: false,
};

/** Strip line and block comments across the common syntaxes (PDP-1 / assembler
 *  `;`, C/JS `//` and `/​* *​/`, shell/Python `#`). Heuristic — it does not parse
 *  strings — but for collation it is enough to keep a re-commented line matching. */
function stripComments(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/\/\/[^\n]*/g, " ") // // to end of line
    .replace(/(^|[ \t]);[^\n]*/gm, "$1 ") // ; to end of line (asm / PDP-1)
    .replace(/#[^\n]*/g, " "); // # to end of line
}

/** Irregular plurals a bare "-s" rule can't reach: f/fe→ves, vowel changes, and
 *  the common -en/Latin forms. A simple suffix strip would mangle these (or, for
 *  -ves, break stem-v verbs like "loves"/"moves"), so we map them explicitly. */
const IRREGULAR_PLURALS: Record<string, string> = {
  wolves: "wolf", leaves: "leaf", lives: "life", knives: "knife", halves: "half",
  calves: "calf", selves: "self", shelves: "shelf", thieves: "thief", wives: "wife",
  elves: "elf", loaves: "loaf", scarves: "scarf", wharves: "wharf", hooves: "hoof",
  men: "man", women: "woman", children: "child", feet: "foot", teeth: "tooth",
  geese: "goose", mice: "mouse", people: "person", oxen: "ox", brethren: "brother",
};

/** Fold a word to its singular for matching: irregular map first, then -ies→y and
 *  a regular trailing -s (not -ss). Operates on the lowercased comparison key. */
function singularise(w: string): string {
  if (IRREGULAR_PLURALS[w]) return IRREGULAR_PLURALS[w];
  return w.replace(/ies$/, "y").replace(/([^s])s$/, "$1");
}

/** Fold early-modern English orthography toward a modern matching key. Operates
 *  on a lowercased copy used only for comparison (never displayed). */
function regulariseSpelling(s: string): string {
  return s
    .toLowerCase()
    .replace(/ſ/g, "s") // long s
    .replace(/vv/g, "w")
    .replace(/v/g, "u") // u/v allographs → one class
    .replace(/j/g, "i") // i/j allographs → one class
    .replace(/(.)\1+/g, "$1") // collapse any doubled letter (Moore→More)
    .replace(/e\b/g, ""); // drop word-final e (More→Mor, loue→lou)
}

/** Normalise a reading for comparison. With the defaults this collapses
 *  whitespace and lowercases, so trivial reflow/indentation/case differences do
 *  not register as variants; punctuation, case, or whitespace can each be kept
 *  significant by turning the corresponding flag off. The optional engine flags
 *  (ignoreComments, regulariseSpelling) add code- and text-specific folding.
 *  Callers that need verbatim equality compare the raw strings separately. */
// Memoise by input string for the current option signature. The aligner calls
// normalize on the same segment texts hundreds of thousands of times (every DP
// cell in the residue pass, every move-detection pair), so caching the result
// turns repeated work — including the costly sort/spelling folds — into a lookup.
// The cache clears whenever the options change or it grows past a cap.
const normCache = new Map<string, string>();
let normCacheSig = "\0";
function sigOf(o: NormalizeOptions): string {
  return `${+!!o.ignoreCase}${+!!o.ignorePunctuation}${+!!o.ignoreWhitespace}${+!!o.ignoreComments}${+!!o.regulariseSpelling}${+!!o.ignoreWordOrder}${+!!o.matchPluralSingular}`;
}

export function normalize(s: string, o: NormalizeOptions = DEFAULT_NORMALIZE): string {
  const sig = sigOf(o);
  if (sig !== normCacheSig) { normCache.clear(); normCacheSig = sig; }
  const hit = normCache.get(s);
  if (hit !== undefined) return hit;
  let r = s;
  if (o.ignoreComments) r = stripComments(r);
  if (o.ignoreWhitespace) r = r.replace(/\s+/g, " ").trim();
  if (o.ignorePunctuation) r = r.replace(/[^\p{L}\p{N}\s]/gu, "");
  if (o.ignoreCase) r = r.toLowerCase();
  if (o.regulariseSpelling) r = regulariseSpelling(r);
  if (o.matchPluralSingular) r = r.replace(/[a-z]+/gi, (w) => singularise(w.toLowerCase()) || w);
  if (o.ignoreWordOrder) r = r.split(/\s+/).filter(Boolean).sort().join(" ");
  if (normCache.size > 60000) normCache.clear();
  normCache.set(s, r);
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
