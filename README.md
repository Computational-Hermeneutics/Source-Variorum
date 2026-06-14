# Source Variorum

> An instrument in the **Computational Hermeneutics** family.

| | |
|---|---|
| **Author** | David M. Berry ([@dmberry](https://github.com/dmberry), University of Sussex, [ORCID 0000-0002-2147-1366](https://orcid.org/0000-0002-2147-1366)) |
| **Version** | 0.5.10 |
| **Date** | June 2026 |
| **Licence** | MIT |
| **Summary** | A side-by-side textual collation workbench: collate two or more witnesses of a text — code or prose — and read additions, omissions, substitutions, and transpositions in a braided variorum view, with auto-collation plus hand-correction. |

**Source Variorum** is a side-by-side textual collation workbench. A *variorum*
(from *cum notis variorum*, "with the notes of various people") collates all
known variants of a text so that a reader can track how textual decisions were
made in preparing a text for publication. Source Variorum brings that apparatus
of textual criticism to computational close reading, across two registers:
**source code** and **prose**.

Give it two (and, in a later phase, more) witnesses of a text and it renders them
in parallel with a central *braid*: curved ribbons connecting matching passages
across the two columns, including passages that have **moved** relative to one
another. The crossing of those ribbons is the analytical payload. It shows, at a
glance, where text has been added, deleted, substituted, or transposed.

## Two modes

- **Source code** — line- and token-aware, monospace, for collating versions of
  code and reading the movement of code as a cultural-textual process. Optional
  syntax highlighting (historical assembly dialects, starting with PDP-1 MACRO
  for the *Spacewar!* sources) colours tokens as a foreground layer over the
  variant tints, so collation and reading legibility coexist.
- **Text** — sentence- and word-aware, proportional type, witness sigla, for
  prose witnesses, paratexts, and classical / hermeneutic comparison.

## What it shows

- A three-column **braid** (Witness A · ribbon gutter · Witness B) with Bezier
  ribbons whose thickness scales with the length of the matched block.
- Variant typing: **match**, **substitution**, **addition**, **deletion**,
  **transposition** (moved text), and near-identical **variant** (fuzzy match).
- **Word-level refinement** inside a differing sentence or line: only the words
  that actually change are tinted (a CollateX-style token alignment), so the eye
  lands on the divergence rather than the whole locus. Selecting a locus shows
  its full reading; the connecting ribbon stays at the sentence/line level.
- An auto-generated **critical apparatus** listing every locus of divergence by
  siglum.
- A **deep-dive** panel of quantitative summary statistics (verbatim overlap,
  moved-block counts, Jaccard / Dice / cosine similarity).
- Live filtering by variant type; click any passage or ribbon to highlight the
  shared reading in both witnesses (and fade the rest).
- Line numbers in both panels for reference.

## The project workbench

A project holds many sources, organised in a small file organiser:

- A **Sources** sidebar with a toolbar: add a source, import several files at
  once, load a **sample** collation, create folders. Sources can be filed into
  **collapsible folders**, renamed, moved, and sent to a **trash** (with restore
  / empty).
- **Click a source** to open it in the right (comparison) panel against the
  left, which acts as the **base** / copy-text; the per-panel dropdowns and each
  source's actions menu place either side explicitly.
- **Edit** witness text in place to correct or normalise it, with **undo/redo**.
  Every source keeps its pristine **original**, so an edited source is flagged
  and can be **reverted to original** (or **duplicated** as a working copy);
  the whole project can also be reverted to the last saved state.
- **Auto / Advanced** modes: auto-collate, then in Advanced mode **hand-link**
  passages — click a whole passage, or **drag to select an exact character
  range** on each side (CollateX-style boundary setting), then choose
  substitution / transposition / addition / omission / match; hand-made links
  override the auto braid.
- **⌘/Ctrl-click** any passage to attach a marginal annotation.
- **New / Open / Save** projects as `.svar` files; **export** to Markdown, PDF,
  or JSON. The working project autosaves to the browser.

## How the collation is computed

The app computes the collation **live in the browser**, every time the view
renders. The engine in `src/lib/collate/` is a set of pure, deterministic
functions: it segments each witness, aligns them, types each variant, and detects
moved blocks. A saved `.svar` project stores **only the source of truth** —
witnesses, mode, your apparatus notes and annotations — and **never the variants**,
which are recomputed deterministically on load. Nothing about the collation is
precomputed or baked into the data.

## Provenance

Source Variorum reuses the close-reading scaffolding of
[LLMbench](https://github.com/vector-lab-tools/LLMbench) (annotation system, word
diff, similarity metrics, editorial interface) but is a distinct instrument in a
distinct family. It is local-first: everything runs in the browser, with no model
calls and no server. The collation engine (`src/lib/collate/`) is a set of pure,
deterministic functions; the interface consumes their output and never recomputes
alignment.

It was begun as part of a Critical Code Studies study of the 1962 PDP-1
*Spacewar!* for a book, and is built to be general: the same collational apparatus
reads code and prose.

## Design lineage

Juxta / Juxta Commons, the Versioning Machine, and dotplot / sequence-alignment
views, reworked as a braided variorum for both code and text.

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

Stack: Next.js 16, React, TypeScript, Tailwind, CodeMirror, jsdiff, jsPDF.

## Licence

MIT © David M. Berry. See [LICENSE](LICENSE).
