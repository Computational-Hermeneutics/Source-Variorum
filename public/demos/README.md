# Source Variorum — sample collations

These are the loadable sample projects (the **book** icon in the Sources sidebar,
"Load a sample collation"). Each is a small, self-contained collation chosen to
exercise a different register of the workbench — code, classical prose
translation, and early-modern editorial variation. All texts are public domain
or otherwise freely redistributable; provenance is recorded per witness in the
app and in the per-sample READMEs.

| Sample | Mode | Witnesses | What it shows | Notes |
|---|---|---|---|---|
| **Spacewar! corpus (1962–63)** | Code | 24 sources (versions, listings, disassemblies, related PDP-1 programs) | Movement, addition, and deletion of PDP-1 MACRO assembly across the program's development; transpositions of whole routines; the distributed, pseudonymous authorship chain (Russell → "dfw" → Preonas/Morris → Samson) | [spacewar-1962/README.md](spacewar-1962/README.md) |
| **_Othello_ (Folio 1623 → World Library)** | Text | 4 editions | Old- vs modern-spelling and editorial variation across ~370 years: original-spelling First Folio, Globe 1866, Craig 1914, World Library — punctuation, lineation, stage directions, Q/F readings | [othello.README.md](othello.README.md) |
| **Plato, _Phaedrus_ (Jowett / Fowler)** | Text | 2 translations | A *free* (Jowett 1892) vs a *literal* (Fowler 1925, Loeb) translation of the same Greek — word-level substitution is the analytical payload | [phaedrus.README.md](phaedrus.README.md) |

The two default panels on first load are **Plato, _Phaedrus_** (a clear
translation-divergence case); switch samples from the book icon.

## Folder structure

```
public/demos/
├── README.md                     ← this file (all samples + structure)
│
├── spacewar-1962/                ← Spacewar! corpus (24 witnesses, code mode)
│   ├── README.md                 ← per-version genealogy, authorship, sources
│   ├── spacewar_1_…  … _4.4f.txt  core development versions (1 → 4.4)
│   ├── spacewar_4.8.txt          4.8 (parts 1 + 2 combined) + _4.8_scorer.txt
│   ├── sw41d_combined.txt        4.1d combined listing
│   ├── spacewar2015.txt, …_2016… modern re-typings (Landsteiner)
│   ├── *_disassembly.txt, *patch… disassemblies, patches, listings
│   └── hyperspace85…, snowflake…, stars…  related PDP-1 display programs
│
├── othello_folio1623.txt         ← Othello, 4 editions (text mode)
├── othello_globe.txt
├── othello_craig.txt
├── othello_pg1793.txt            (World Library)
├── othello.README.md
│
├── phaedrus_jowett.txt           ← Phaedrus, 2 translations (text mode)
├── phaedrus_fowler.txt
├── phaedrus.README.md
│
└── tei/                          ← TEI P5 round-trip fixtures (export ⇄ import)
    └── README.md
```

In the Spacewar sample the supplementary files are presented in two **subfolders**
in the Sources sidebar — *Disassemblies & listings* and *Related PDP-1 programs* —
so the core version genealogy stays uncluttered. Subfolders default to collapsed.

## How the samples are wired

Sample definitions live in `src/data/demos.ts`. Each witness points at a file in
this `public/demos/` tree; the witness text is fetched at load time and collated
**live in the browser** — nothing about the alignment is precomputed. A sample is
just witnesses + mode; the braid, apparatus, and metrics are derived on load.
Leading blank lines are trimmed on ingestion so every witness starts at line 1.

## Adding a sample

1. Drop the witness text file(s) under `public/demos/` (a subfolder for a
   multi-file corpus, loose files for a simple pair).
2. Add a `Demo` entry to `src/data/demos.ts` (`witnesses` for N≥2, or
   `witnessA`/`witnessB` for a pair), with `mode`, sigla, dates, author, and
   provenance; use `folder` to file supplementary witnesses into a subfolder.
3. Add or update a README here so the sample is documented for scholarly use.
