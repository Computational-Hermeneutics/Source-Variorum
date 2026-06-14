# Source Variorum — sample collations

These are the loadable sample projects (the **book** icon in the Sources sidebar,
"Load a sample collation"). Each is a small, self-contained collation chosen to
exercise a different register of the workbench — code, classical prose
translation, and early-modern editorial variation. All texts are public domain
or otherwise freely redistributable; provenance is recorded per witness in the
app and below.

| Sample | Mode | Witnesses | What it shows | Notes |
|---|---|---|---|---|
| **Spacewar! corpus (1962–63)** | Code | 8 versions (1 → 4.4) | Movement, addition, and deletion of PDP-1 MACRO assembly across the program's development; transpositions of whole routines | [spacewar-1962/README.md](spacewar-1962/README.md) |
| **Plato, _Phaedrus_ (Jowett / Fowler)** | Text | 2 translations | A *free* (Jowett 1892) vs a *literal* (Fowler 1925, Loeb) translation of the same Greek — word-level substitution is the analytical payload | [phaedrus.README.md](phaedrus.README.md) |
| **_Othello_ — Globe 1866 / Craig 1914** | Text | 2 editions | Editorial variation between two public-domain critical editions fifty years apart: punctuation, lineation, stage directions | [othello.README.md](othello.README.md) |

## How the samples are wired

Sample definitions live in `src/data/demos.ts`. Each witness points at a file in
this `public/demos/` tree; the witness text is fetched at load time and collated
**live in the browser** — nothing about the alignment is precomputed. A sample is
just witnesses + mode; the braid, apparatus, and metrics are derived on load.

## Adding a sample

1. Drop the witness text file(s) under `public/demos/` (a subfolder for a
   multi-file corpus, loose files for a simple pair).
2. Add a `Demo` entry to `src/data/demos.ts` (`witnesses` for N≥2, or
   `witnessA`/`witnessB` for a pair), with `mode`, sigla, dates, and provenance.
3. Add or update a README here so the sample is documented for scholarly use.
