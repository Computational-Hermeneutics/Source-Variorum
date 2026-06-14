/**
 * Lezer (tree-based) highlighting for modern languages.
 *
 * The stream-mode path (./index.ts) covers the historical assembly dialects.
 * Modern languages (JS/TS, Python, HTML, CSS, C/C++, Java, Rust, SQL, JSON, XML,
 * Go, PHP, Markdown) ship as CodeMirror `LanguageSupport` built on Lezer parsers.
 * We parse the text to a tree and walk it with `highlightTree`, mapping each
 * Lezer tag to one of the same tag-name strings our `tokenStyle` understands —
 * so both highlighters feed the one colour table.
 */

import { highlightTree, tagHighlighter, tags as t } from "@lezer/highlight";
import type { LanguageSupport } from "@codemirror/language";
import type { HToken } from "./index";

// Map Lezer tags → the tag-name strings used by tokenStyle() in ./index.ts.
const HL = tagHighlighter([
  { tag: t.keyword, class: "keyword" },
  { tag: t.controlKeyword, class: "keyword.directive" },
  { tag: t.operatorKeyword, class: "keyword" },
  { tag: t.moduleKeyword, class: "keyword.directive" },
  { tag: t.definitionKeyword, class: "keyword" },
  { tag: t.comment, class: "comment" },
  { tag: t.lineComment, class: "comment" },
  { tag: t.blockComment, class: "comment" },
  { tag: t.docComment, class: "comment" },
  { tag: t.string, class: "string" },
  { tag: t.special(t.string), class: "string" },
  { tag: t.regexp, class: "string" },
  { tag: t.number, class: "number" },
  { tag: t.integer, class: "number" },
  { tag: t.float, class: "number" },
  { tag: t.bool, class: "atom" },
  { tag: t.atom, class: "atom" },
  { tag: t.null, class: "atom" },
  { tag: t.variableName, class: "variableName" },
  { tag: t.definition(t.variableName), class: "variableName" },
  { tag: t.function(t.variableName), class: "variableName" },
  { tag: t.propertyName, class: "propertyName" },
  { tag: t.function(t.propertyName), class: "propertyName" },
  { tag: t.typeName, class: "typeName" },
  { tag: t.className, class: "typeName" },
  { tag: t.namespace, class: "typeName" },
  { tag: t.tagName, class: "keyword" },
  { tag: t.attributeName, class: "propertyName" },
  { tag: t.attributeValue, class: "string" },
  { tag: t.operator, class: "operator" },
  { tag: t.punctuation, class: "punctuation" },
  { tag: t.bracket, class: "bracket" },
  { tag: t.meta, class: "meta" },
  { tag: t.labelName, class: "labelName" },
  { tag: t.heading, class: "heading" },
]);

/** Tokenize `text` with a Lezer LanguageSupport, returning absolute tag ranges. */
export function lezerRanges(text: string, support: LanguageSupport): HToken[] {
  const tokens: HToken[] = [];
  let tree;
  try {
    tree = support.language.parser.parse(text);
  } catch {
    return tokens;
  }
  highlightTree(tree, HL, (from, to, classes) => {
    // tagHighlighter joins multiple classes with a space; take the first.
    const tag = classes.split(" ")[0];
    if (tag) tokens.push({ from, to, tag });
  });
  return tokens;
}
