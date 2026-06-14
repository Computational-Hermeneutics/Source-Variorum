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
import { VARIANT_TYPE_LABELS } from "@/types/collation";
import { collate } from "@/lib/collate/collate";
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

/** Recompute the full derived view (variants + apparatus + metrics) from a collation. */
export function deriveView(c: Collation) {
  const [a, b] = pairOf(c);
  let variants = collate(a, b, { mode: c.mode });
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
      const witnesses: Witness[] = data.witnesses;
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
    out.push(`- **${w.siglum}** — ${w.title}${w.date ? ` (${w.date})` : ""}${base}`);
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
    line(`${w.siglum} — ${w.title}${w.date ? ` (${w.date})` : ""}${base}`, 10, "normal", 12);
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
