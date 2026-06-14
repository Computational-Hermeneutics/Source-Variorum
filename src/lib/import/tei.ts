/**
 * Light TEI / XML ingest.
 *
 * Source Variorum collates plain text, so an imported TEI/XML witness is reduced
 * to readable text: the teiHeader and non-collatable elements (notes, page
 * breaks, apparatus, etc.) are dropped, structural elements (paragraphs, verse
 * lines, speeches, headings) become line breaks, and speaker labels are upper-
 * cased onto their own line — matching the shape of the bundled prose samples.
 *
 * This is deliberately simple (no offset map yet); it is enough to read a TEI
 * witness, or to re-import a file SV exported as TEI P5 parallel segmentation
 * (where `<lem>`/`<rdg>` are flattened to the base reading).
 */

/** Heuristic: does this text look like XML/TEI we should convert on import? */
export function looksLikeXml(s: string, filename?: string): boolean {
  if (filename && /\.(xml|tei|tei\.xml)$/i.test(filename)) return true;
  const head = s.slice(0, 400).toLowerCase();
  return head.includes("<?xml") || head.includes("<tei") || /<(p|l|sp|div|body)\b/.test(head);
}

const DROP = new Set(["teiheader", "note", "pb", "fw", "app", "rdg", "figure", "graphic", "milestone"]);
const BLOCK = new Set(["p", "l", "lg", "div", "head", "sp", "ab", "item", "list", "table", "row", "stage", "trailer", "opener", "closer", "lb"]);

/** Convert a TEI/XML string to plain text suitable for collation. */
export function teiToPlainText(xml: string): string {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xml, "application/xml");
  } catch {
    return stripTags(xml);
  }
  if (doc.getElementsByTagName("parsererror").length) return stripTags(xml);

  const out: string[] = [];
  let line = "";
  const flush = () => {
    const t = line.replace(/[ \t]+/g, " ").trim();
    if (t) out.push(t);
    line = "";
  };

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      line += node.nodeValue ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.localName.toLowerCase();
    if (DROP.has(tag)) {
      // For an <app>, keep the lemma reading (the base text) so SV's own TEI
      // export round-trips to the base witness.
      if (tag === "app") {
        const lem = el.getElementsByTagName("lem")[0] ?? el.querySelector("lem");
        if (lem) walk(lem);
      }
      return;
    }
    if (tag === "lem" || tag === "rdg") {
      // when reached directly (not via the app shortcut), take its text
      el.childNodes.forEach(walk);
      return;
    }
    // A <speaker> becomes its own upper-cased line.
    if (tag === "speaker") {
      flush();
      const s = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (s) out.push(s.toUpperCase());
      return;
    }
    const block = BLOCK.has(tag);
    if (block) flush();
    el.childNodes.forEach(walk);
    if (block) flush();
  };

  const body = doc.querySelector("text > body") ?? doc.querySelector("body") ?? doc.documentElement;
  walk(body);
  flush();
  return out.join("\n");
}

/** Fallback: strip all tags and collapse whitespace. */
function stripTags(xml: string): string {
  return xml
    .replace(/<teiHeader[\s\S]*?<\/teiHeader>/gi, "")
    .replace(/<note[\s\S]*?<\/note>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .trim();
}
