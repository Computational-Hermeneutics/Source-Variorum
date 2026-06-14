# TEI versions

This folder is for **TEI P5** encodings related to the samples — for scholarly
work that needs the standard textual-criticism interchange format. TEI is not
shown in the reading panels (the panels render plain text); it is an
import/export concern.

## What works now

**Export.** Any collation can be exported as **TEI P5 parallel segmentation**
(File ▸ Export ▸ TEI P5). The base witness (copy-text) is reconstructed with each
locus of divergence wrapped in `<app>`:

```xml
<app><lem wit="#wA">the cat sat</lem><rdg wit="#wB">the dog sat</rdg></app>
```

Additions become an empty `<lem/>` with a `<rdg>`; omissions an empty `<rdg/>`;
transpositions carry `cause="transposition"`; hand-made (Advanced-mode) links are
marked `resp="#editor"`; apparatus notes become `<note>`. This is the same
parallel-segmentation apparatus CollateX and the Versioning Machine consume.

## On the roadmap

- **TEI ingest** — load TEI witnesses directly, with a flat-text ↔ XML offset map
  and a per-tag include/exclude/newline filter (the Juxta architecture), so
  encoded sources can be collated and round-tripped.
- **Sample TEI encodings** — P5 versions of the bundled samples will be deposited
  here as reference artifacts once ingest lands.

Reference: TEI P5 Guidelines, *Critical Apparatus* —
<https://www.tei-c.org/release/doc/tei-p5-doc/en/html/TC.html> ·
beginner's guide <https://www.tei-c.org/release/doc/tei-p5-doc/en/html/SG.html>.
