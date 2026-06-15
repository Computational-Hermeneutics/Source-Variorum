"use client";

import { useMemo, useRef, useState } from "react";
import { Copy, Download, Check } from "lucide-react";
import type { Stemma, StemmaNode } from "@/lib/collate/stemma";
import { canvasToBlob, copyImageBlob, downloadBlob, serializeSvg, svgToCanvas } from "@/lib/export/viz";

/**
 * Renders a stemma as a horizontal UPGMA dendrogram (root left, witnesses right;
 * the x-axis is dissimilarity — the deeper a fork, the more the two sides
 * differ), with the full distance matrix as a heatmap below.
 */
export function StemmaTree({ stemma }: { stemma: Stemma }) {
  const { root, labels, matrix } = stemma;
  const svgRef = useRef<SVGSVGElement>(null);
  const [copied, setCopied] = useState(false);

  const copyPng = async () => {
    if (!svgRef.current) return;
    const cv = await svgToCanvas(svgRef.current);
    const blob = await canvasToBlob(cv);
    if (blob && await copyImageBlob(blob)) { setCopied(true); setTimeout(() => setCopied(false), 1400); }
  };
  const downloadPng = async () => {
    if (!svgRef.current) return;
    const blob = await canvasToBlob(await svgToCanvas(svgRef.current));
    if (blob) downloadBlob(blob, "stemma.png");
  };
  const downloadSvg = () => {
    if (!svgRef.current) return;
    downloadBlob(new Blob([serializeSvg(svgRef.current)], { type: "image/svg+xml" }), "stemma.svg");
  };

  const layout = useMemo(() => {
    if (!root) return null;
    // Size the label gutter to the (truncated) titles so nothing is clipped.
    const trunc = (s: string, n = 30) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
    const maxChars = Math.max(8, ...labels.map((l) => l.siglum.length + 2 + trunc(l.title).length));
    const ROW = 24, PADX = 12, PADY = 14, TREE_W = 280, LABEL_W = Math.min(360, Math.round(maxChars * 6.6) + 24);
    // leaf order (DFS) → y rows
    const leaves: { node: Extract<StemmaNode, { kind: "leaf" }>; y: number }[] = [];
    const collect = (n: StemmaNode) => {
      if (n.kind === "leaf") { leaves.push({ node: n, y: PADY + leaves.length * ROW + ROW / 2 }); return; }
      collect(n.children[0]); collect(n.children[1]);
    };
    collect(root);
    const yOf = new Map<StemmaNode, number>();
    leaves.forEach((l) => yOf.set(l.node, l.y));
    let maxH = 0;
    const walkH = (n: StemmaNode) => { if (n.kind === "node") { maxH = Math.max(maxH, n.height); walkH(n.children[0]); walkH(n.children[1]); } };
    walkH(root);
    const denom = maxH || 1;
    const xRight = PADX + TREE_W;            // leaves sit here (height 0)
    const xOf = (h: number) => xRight - (h / denom) * TREE_W;
    const segs: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const y = (n: StemmaNode): number => {
      if (n.kind === "leaf") return yOf.get(n)!;
      const y1 = y(n.children[0]); const y2 = y(n.children[1]);
      const ym = (y1 + y2) / 2; yOf.set(n, ym);
      const x = xOf(n.height);
      // vertical riser + two horizontal arms to the children
      segs.push({ x1: x, y1, x2: x, y2 });
      for (const ch of n.children) {
        const cx = ch.kind === "leaf" ? xRight : xOf(ch.height);
        segs.push({ x1: x, y1: yOf.get(ch)!, x2: cx, y2: yOf.get(ch)! });
      }
      return ym;
    };
    y(root);
    const height = PADY * 2 + leaves.length * ROW;
    return { leaves, segs, xRight, height, width: PADX + TREE_W + LABEL_W, maxH };
  }, [root]);

  if (!root || !layout) {
    return <p className="text-[12px] text-muted-foreground">Add at least two comparable witnesses to draw a stemma.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <button onClick={copyPng} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border bg-card hover:bg-muted text-[12px]" title="Copy the tree as an image">{copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}{copied ? "Copied" : "Copy"}</button>
        <button onClick={downloadPng} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border bg-card hover:bg-muted text-[12px]" title="Download PNG"><Download className="w-3.5 h-3.5" />PNG</button>
        <button onClick={downloadSvg} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border bg-card hover:bg-muted text-[12px]" title="Download SVG (vector)"><Download className="w-3.5 h-3.5" />SVG</button>
      </div>
      <div className="overflow-x-auto">
        <svg ref={svgRef} width={layout.width} height={layout.height} className="text-foreground">
          {layout.segs.map((s, i) => (
            <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="hsl(var(--primary))" strokeWidth={1.5} strokeLinecap="round" />
          ))}
          {layout.leaves.map((l) => (
            <g key={l.node.id}>
              <title>{l.node.siglum} — {l.node.title}</title>
              <circle cx={layout.xRight} cy={l.y} r={3} fill="hsl(var(--primary))" />
              <text x={layout.xRight + 8} y={l.y + 3.5} fontSize={12} fill="currentColor">
                <tspan fontWeight={600}>{l.node.siglum}</tspan>
                <tspan dx={6} fillOpacity={0.7}>{l.node.title.length > 30 ? l.node.title.slice(0, 29) + "…" : l.node.title}</tspan>
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p className="text-[11px] text-muted-foreground">
        UPGMA average-linkage tree over the {labels.length} comparable witnesses. Distance = 1 − Sørensen–Dice (character bigrams) on the normalised text — the same primitive the braid uses. Witnesses that read alike join low (near the right); a deep fork marks a witness or group that diverges from the rest. For an ordered version lineage this approximates the descent of the text. Tokenizer settings (Settings ▸ engines) change the distances.
      </p>

      <Matrix labels={labels} matrix={matrix} />
    </div>
  );
}

/** Compact dissimilarity heatmap (lighter = closer, darker = more divergent). */
function Matrix({ labels, matrix }: { labels: { id: string; siglum: string }[]; matrix: number[][] }) {
  if (labels.length < 2) return null;
  const max = Math.max(0.01, ...matrix.flat());
  const cell = 22;
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Distance matrix</div>
      <div className="overflow-x-auto">
        <table className="border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="w-8" />
              {labels.map((l) => <th key={l.id} className="px-1 font-medium text-muted-foreground align-bottom" style={{ height: 40 }}><div className="rotate-180 [writing-mode:vertical-lr] mx-auto">{l.siglum}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {labels.map((l, i) => (
              <tr key={l.id}>
                <td className="pr-1.5 text-right font-medium text-muted-foreground whitespace-nowrap">{l.siglum}</td>
                {labels.map((_, j) => {
                  const v = matrix[i][j];
                  const t = i === j ? 0 : v / max;
                  return (
                    <td key={j} style={{ width: cell, height: cell, background: i === j ? "transparent" : `color-mix(in srgb, hsl(var(--primary)) ${Math.round(t * 85)}%, transparent)` }} title={i === j ? l.siglum : `${labels[i].siglum} ↔ ${labels[j].siglum}: ${(v * 100).toFixed(0)}% apart`} className="text-center">
                      {i === j ? <span className="text-muted-foreground/40">·</span> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
