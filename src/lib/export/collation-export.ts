/**
 * Project I/O and export for Source Variorum.
 *
 * The project FILE (.svar, JSON) stores only the source of truth — witnesses,
 * mode, apparatus edits, annotations, links — never the derived variants, which
 * the deterministic engine recomputes on load. Export to Markdown / PDF renders
 * the collation as a readable variorum: witnesses, critical apparatus, summary.
 */

import jsPDF from "jspdf";
import type { Collation, SavedCollation, Variant, Witness } from "@/types/collation";
import { VARIANT_TYPE_LABELS, VARIANT_TYPE_COLORS } from "@/types/collation";
import { collate } from "@/lib/collate/collate";
import type { NormalizeOptions } from "@/lib/collate/similarity";
import { buildApparatus } from "@/lib/collate/apparatus";
import { computeCollationMetrics } from "@/lib/collate/metrics";
import { applyManualLinks, pairKey } from "@/lib/collate/manual";

/** The two witnesses the braid currently compares (the panel selections). */
export function pairOf(c: Collation): [Witness, Witness] {
  const a = c.witnesses.find((w) => w.id === c.leftId) ?? c.witnesses[0];
  const b =
    c.witnesses.find((w) => w.id === c.rightId) ??
    c.witnesses.find((w) => w.id !== a.id) ??
    c.witnesses[1] ??
    a;
  return [a, b];
}

/** Recompute the full derived view (variants + apparatus + metrics) from a
 *  collation. `normalize` lets the caller pass the active tokenizer settings
 *  (ignore case / punctuation / whitespace); defaults to the engine defaults. */
export function deriveView(c: Collation, normalize?: NormalizeOptions) {
  const [a, b] = pairOf(c);
  let variants = collate(a, b, normalize ? { mode: c.mode, normalize } : { mode: c.mode });
  const links = c.manualLinks?.[pairKey(c.leftId, c.rightId)] ?? [];
  if (links.length) variants = applyManualLinks(variants, links, a, b);
  const apparatus = buildApparatus(variants, a, b, c);
  const metrics = computeCollationMetrics(variants, a, b);
  return { a, b, variants, apparatus, metrics };
}

/** Browser download helper. */
export function download(filename: string, content: string | Blob, mime = "text/plain") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function slugify(name: string): string {
  return (
    name
      .replace(/[^a-z0-9-_ ]/gi, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "collation"
  );
}

// ----- Project file (.svar) -----

export function toProjectFile(c: Collation): SavedCollation {
  return { ...c, schemaVersion: 1 };
}

export function toJSON(c: Collation): string {
  return JSON.stringify(toProjectFile(c), null, 2);
}

/** Parse and minimally validate a .svar/JSON project file. Returns null on failure. */
export function parseProjectFile(text: string): SavedCollation | null {
  try {
    const data = JSON.parse(text);
    if (
      data &&
      Array.isArray(data.witnesses) &&
      data.witnesses.length >= 2 &&
      (data.mode === "source" || data.mode === "text")
    ) {
      // Backfill optional fields older files may lack.
      const witnesses: Witness[] = (data.witnesses as Witness[]).map((w) => ({
        ...w,
        original: w.original ?? w.text,
      }));
      return {
        schemaVersion: 1,
        id: data.id ?? "loaded",
        name: data.name ?? "Loaded collation",
        mode: data.mode,
        witnesses,
        baseIndex: typeof data.baseIndex === "number" ? data.baseIndex : 0,
        leftId: data.leftId ?? witnesses[0]?.id,
        rightId: data.rightId ?? witnesses[1]?.id ?? witnesses[0]?.id,
        annotations: data.annotations ?? {},
        links: data.links ?? [],
        apparatusEdits: data.apparatusEdits ?? {},
        manualLinks: data.manualLinks ?? {},
        folders: Array.isArray(data.folders) ? data.folders : [],
        trash: Array.isArray(data.trash) ? data.trash : [],
        createdAt: data.createdAt ?? new Date().toISOString(),
        updatedAt: data.updatedAt ?? new Date().toISOString(),
      };
    }
  } catch {
    // fall through
  }
  return null;
}

// ----- Markdown -----

function reading(v: Variant, a: Witness, b: Witness): string {
  const parts: string[] = [];
  if (v.textA.trim()) parts.push(`**${a.siglum}** ${v.textA.trim()}`);
  if (v.textB.trim()) parts.push(`**${b.siglum}** ${v.textB.trim()}`);
  return parts.join(" ] ");
}

export function toMarkdown(c: Collation): string {
  const { a, b, variants, metrics } = deriveView(c);
  const out: string[] = [];
  out.push(`# ${c.name || "Untitled collation"}`);
  out.push("");
  out.push(`*A Source Variorum collation · ${c.mode} mode · ${new Date(c.updatedAt).toLocaleDateString()}*`);
  out.push("");
  out.push("## Witnesses");
  out.push("");
  for (const w of c.witnesses) {
    const base = w.id === c.leftId ? " *(base / copy-text)*" : "";
    out.push(`- **${w.siglum}** — ${w.title}${w.author ? `, ${w.author}` : ""}${w.date ? ` (${w.date})` : ""}${base}`);
  }
  out.push("");

  const entries = variants.filter((v) => v.type !== "match");
  out.push(`## Critical apparatus`);
  out.push("");
  out.push(`${entries.length} ${entries.length === 1 ? "entry" : "entries"}.`);
  out.push("");
  for (const v of entries) {
    const sp = v.a ?? v.b;
    const locus =
      sp && c.mode === "source"
        ? sp.startLine === sp.endLine
          ? `l. ${sp.startLine}`
          : `ll. ${sp.startLine}–${sp.endLine}`
        : "";
    const note = c.apparatusEdits[v.id]?.note?.trim();
    const cat = c.apparatusEdits[v.id]?.category;
    out.push(
      `- ${locus ? `**${locus}** ` : ""}${reading(v, a, b)} _(${VARIANT_TYPE_LABELS[v.type]}${cat ? `, ${cat}` : ""})_`
    );
    if (note) out.push(`  - ${note}`);
  }
  out.push("");

  out.push("## Summary");
  out.push("");
  out.push(`- Verbatim overlap: ${metrics.verbatimPercent.toFixed(1)}%`);
  out.push(`- Transpositions: ${metrics.movedBlocks} (${metrics.movedLength} ch; longest ${metrics.longestMove})`);
  out.push(`- Substitutions: ${metrics.counts.substitution} · Variants: ${metrics.counts.variant} · Additions: ${metrics.counts.addition} · Deletions: ${metrics.counts.deletion}`);
  out.push(`- Similarity: Jaccard ${metrics.jaccard.toFixed(3)} · Dice ${metrics.dice.toFixed(3)} · Cosine ${metrics.cosine.toFixed(3)}`);
  out.push("");
  out.push(`*Generated by Source Variorum — Computational Hermeneutics.*`);
  return out.join("\n");
}

// ----- TEI P5 (parallel segmentation critical apparatus) -----

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Export the collation as TEI P5 **parallel segmentation** — the standard
 * scholarly interchange for a critical apparatus (cf. CollateX). The base text
 * (witness A / copy-text) is reconstructed, with each locus of divergence wrapped
 * in `<app>`: `<lem wit="#wA">` for the base reading and `<rdg wit="#wB">` for the
 * other witness (an empty element where a witness omits the passage). Hand-made
 * (Advanced-mode) links are marked `@resp="#editor"`; apparatus notes become
 * `<note>`. Additions are interleaved by witness-B position.
 */
export function toTEI(c: Collation): string {
  const { a, b, variants } = deriveView(c);
  const wA = "wA";
  const wB = "wB";

  const appOpen = (v: Variant) => `<app${v.manual ? ' resp="#editor"' : ""}>`;
  const noteFor = (v: Variant): string => {
    const note = c.apparatusEdits[v.id]?.note?.trim();
    return note ? `<note>${escXml(note)}</note>` : "";
  };

  const segXml = (v: Variant): string => {
    switch (v.type) {
      case "match":
        return escXml(v.textA);
      case "addition":
        return `${appOpen(v)}<lem wit="#${wA}"/><rdg wit="#${wB}">${escXml(v.textB)}</rdg>${noteFor(v)}</app>`;
      case "deletion":
        return `${appOpen(v)}<lem wit="#${wA}">${escXml(v.textA)}</lem><rdg wit="#${wB}"/>${noteFor(v)}</app>`;
      case "transposition":
        return `${appOpen(v)}<lem wit="#${wA}">${escXml(v.textA)}</lem><rdg wit="#${wB}" cause="transposition">${escXml(v.textB)}</rdg>${noteFor(v)}</app>`;
      default: // substitution | variant
        return `${appOpen(v)}<lem wit="#${wA}">${escXml(v.textA)}</lem><rdg wit="#${wB}">${escXml(v.textB)}</rdg>${noteFor(v)}</app>`;
    }
  };

  // Reconstruct the base in order; interleave additions (no A-span) by their
  // B-position relative to the A-bearing segments (alignment is ~monotonic in B).
  const withA = variants.filter((v) => v.a).sort((x, y) => x.a!.start - y.a!.start);
  const adds = variants.filter((v) => !v.a && v.b).sort((x, y) => x.b!.start - y.b!.start);
  let ai = 0;
  const body: string[] = [];
  const flushAddsBefore = (bStart: number) => {
    while (ai < adds.length && adds[ai].b!.start < bStart) body.push(segXml(adds[ai++]));
  };
  for (const v of withA) {
    if (v.b) flushAddsBefore(v.b.start);
    body.push(segXml(v));
  }
  while (ai < adds.length) body.push(segXml(adds[ai++]));

  const witLine = (w: Witness, base: boolean) =>
    `        <witness xml:id="${w.id === c.leftId ? wA : wB}"><abbr>${escXml(w.siglum)}</abbr> — ${escXml(w.title)}${w.author ? `, ${escXml(w.author)}` : ""}${w.date ? ` (${escXml(w.date)})` : ""}${base ? " [base / copy-text]" : ""}</witness>`;

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<TEI xmlns="http://www.tei-c.org/ns/1.0">`,
    `  <teiHeader>`,
    `    <fileDesc>`,
    `      <titleStmt><title>${escXml(c.name || "Untitled collation")}</title></titleStmt>`,
    `      <publicationStmt><p>Generated by Source Variorum (Computational Hermeneutics). Parallel-segmentation apparatus, ${c.mode} mode.</p></publicationStmt>`,
    `      <sourceDesc>`,
    `        <listWit>`,
    witLine(a, true),
    witLine(b, false),
    `        </listWit>`,
    `      </sourceDesc>`,
    `    </fileDesc>`,
    `    <encodingDesc><variantEncoding method="parallel-segmentation" location="internal"/></encodingDesc>`,
    `  </teiHeader>`,
    `  <text>`,
    `    <body>`,
    `      <p>${body.join("")}</p>`,
    `    </body>`,
    `  </text>`,
    `</TEI>`,
    "",
  ].join("\n");
}

// ----- PDF -----

export function toPDF(c: Collation): jsPDF {
  const { a, b, variants, metrics } = deriveView(c);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const width = doc.internal.pageSize.getWidth() - margin * 2;
  const bottom = doc.internal.pageSize.getHeight() - margin;
  let y = margin;

  const line = (text: string, size = 10, style: "normal" | "bold" | "italic" = "normal", indent = 0) => {
    doc.setFont("times", style);
    doc.setFontSize(size);
    const wrapped = doc.splitTextToSize(text, width - indent);
    for (const w of wrapped) {
      if (y > bottom) {
        doc.addPage();
        y = margin;
      }
      doc.text(w, margin + indent, y);
      y += size * 1.35;
    }
  };
  const gap = (h = 6) => {
    y += h;
  };

  line(c.name || "Untitled collation", 18, "bold");
  line(`A Source Variorum collation · ${c.mode} mode · ${new Date(c.updatedAt).toLocaleDateString()}`, 9, "italic");
  gap(10);

  line("Witnesses", 12, "bold");
  for (const w of c.witnesses) {
    const base = w.id === c.leftId ? " (base / copy-text)" : "";
    line(`${w.siglum} — ${w.title}${w.author ? `, ${w.author}` : ""}${w.date ? ` (${w.date})` : ""}${base}`, 10, "normal", 12);
  }
  gap(10);

  const entries = variants.filter((v) => v.type !== "match");
  line(`Critical apparatus — ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`, 12, "bold");
  gap(2);
  for (const v of entries) {
    const sp = v.a ?? v.b;
    const locus =
      sp && c.mode === "source"
        ? sp.startLine === sp.endLine
          ? `l. ${sp.startLine}`
          : `ll. ${sp.startLine}-${sp.endLine}`
        : "";
    const readingA = v.textA.trim() ? `${a.siglum} ${v.textA.trim()}` : "";
    const readingB = v.textB.trim() ? `${b.siglum} ${v.textB.trim()}` : "";
    const head = [locus, [readingA, readingB].filter(Boolean).join("  ]  ")].filter(Boolean).join("  ");
    line(`${head}  (${VARIANT_TYPE_LABELS[v.type]})`, 10, "normal", 12);
    const note = c.apparatusEdits[v.id]?.note?.trim();
    if (note) line(note, 9, "italic", 24);
    gap(2);
  }
  gap(10);

  line("Summary", 12, "bold");
  line(`Verbatim overlap: ${metrics.verbatimPercent.toFixed(1)}%`, 10, "normal", 12);
  line(`Transpositions: ${metrics.movedBlocks} (${metrics.movedLength} ch; longest ${metrics.longestMove})`, 10, "normal", 12);
  line(`Substitutions ${metrics.counts.substitution} · Variants ${metrics.counts.variant} · Additions ${metrics.counts.addition} · Deletions ${metrics.counts.deletion}`, 10, "normal", 12);
  line(`Jaccard ${metrics.jaccard.toFixed(3)} · Dice ${metrics.dice.toFixed(3)} · Cosine ${metrics.cosine.toFixed(3)}`, 10, "normal", 12);
  gap(14);
  line("Generated by Source Variorum — Computational Hermeneutics.", 8, "italic");

  return doc;
}

/** hex "#rrggbb" → [r,g,b], optionally lightened toward white (0..1). */
function rgbOf(hex: string, lighten = 0): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (lighten > 0) { r = Math.round(r + (255 - r) * lighten); g = Math.round(g + (255 - g) * lighten); b = Math.round(b + (255 - b) * lighten); }
  return [r, g, b];
}

/**
 * Visual side-by-side export: both witnesses in full, in parallel columns, with
 * a central braid of type-coloured connectors between every locus. Landscape,
 * paginated. Aligned by base order so matched passages sit on the same row and
 * the connectors read horizontally; additions/deletions show a dash on the empty
 * side; the connector colour is the variant type (faint blue for matches).
 */
export function toBraidPDF(c: Collation): jsPDF {
  const { a, b, variants } = deriveView(c);
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 30;
  const gutterW = 50;
  const colW = (pageW - margin * 2 - gutterW) / 2;
  const leftX = margin, gutterX = leftX + colW, rightX = gutterX + gutterW;
  const pad = 4;
  const mono = c.mode === "source";
  const font = mono ? "courier" : "times";
  const size = mono ? 6.5 : 8;
  const lh = size * 1.32;
  const headH = 34;
  const bottom = pageH - margin - 6;

  const drawHeader = () => {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(25);
    doc.text(`${a.siglum} — ${a.title}`.slice(0, 90), leftX, margin);
    doc.text(`${b.siglum} — ${b.title}`.slice(0, 90), rightX, margin);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(130);
    doc.text(`${c.name || "Untitled collation"} · ${c.mode} mode · braided side-by-side`, leftX, margin + 11);
    doc.setDrawColor(225); doc.setLineWidth(0.5); doc.line(leftX, margin + headH - 6, rightX + colW, margin + headH - 6);
  };
  drawHeader();
  let y = margin + headH;

  for (const v of variants) {
    const aRaw = v.a ? a.text.slice(v.a.start, v.a.end).replace(/\s+$/, "") : "";
    const bRaw = v.b ? b.text.slice(v.b.start, v.b.end).replace(/\s+$/, "") : "";
    doc.setFont(font, "normal"); doc.setFontSize(size);
    const aLines: string[] = doc.splitTextToSize(aRaw || (v.type === "addition" ? "—" : ""), colW - pad * 2);
    const bLines: string[] = doc.splitTextToSize(bRaw || (v.type === "deletion" ? "—" : ""), colW - pad * 2);
    const rows = Math.max(aLines.length, bLines.length, 1);
    const rowH = rows * lh + 3;
    if (y + rowH > bottom) { doc.addPage(); drawHeader(); y = margin + headH; }

    if (v.type !== "match") {
      const tint = rgbOf(VARIANT_TYPE_COLORS[v.type], 0.84);
      doc.setFillColor(tint[0], tint[1], tint[2]);
      doc.rect(leftX - 2, y - size, colW + 4, rowH, "F");
      doc.rect(rightX - 2, y - size, colW + 4, rowH, "F");
    }
    doc.setFont(font, "normal"); doc.setFontSize(size); doc.setTextColor(35);
    aLines.forEach((ln, i) => doc.text(ln, leftX + pad, y + i * lh));
    bLines.forEach((ln, i) => doc.text(ln, rightX + pad, y + i * lh));

    // Braid connector across the gutter at the row's vertical centre.
    const cy = y - size + rowH / 2;
    const [cr, cg, cb] = rgbOf(VARIANT_TYPE_COLORS[v.type]);
    doc.setDrawColor(cr, cg, cb);
    doc.setLineWidth(v.type === "match" ? 0.4 : 1.2);
    const midX = (gutterX + rightX) / 2;
    doc.lines([[(midX - gutterX), -2, (midX - gutterX), 2, (rightX - gutterX), 0]], gutterX, cy, [1, 1], "S");

    y += rowH + 1.5;
  }

  doc.setFont("helvetica", "italic"); doc.setFontSize(7); doc.setTextColor(140);
  doc.text("Generated by Source Variorum — Computational Hermeneutics.", leftX, pageH - margin / 2);
  return doc;
}
