"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CollationMode, Witness } from "@/types/collation";
import type { NormalizeOptions } from "@/lib/collate/similarity";
import { computeDotplot } from "@/lib/collate/dotplot";

/**
 * Dotplot of witness A (x, top) against witness B (y, left): a point wherever a
 * unit (line/sentence) matches. Diagonals = shared runs; off-diagonal streaks =
 * moved blocks or repeats; gaps = added/dropped text. The square plot scales to
 * the modal width (and grows when the modal is expanded).
 */
export function Dotplot({ a, b, mode, normOpts, expanded = false }: { a: Witness; b: Witness; mode: CollationMode; normOpts: NormalizeOptions; expanded?: boolean }) {
  const [hideCommon, setHideCommon] = useState(true);
  const data = useMemo(() => computeDotplot(a, b, mode, normOpts, hideCommon), [a, b, mode, normOpts, hideCommon]);
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(540);

  // Square plot scaled to the modal width: max-w-4xl (896px) normally, 96vw when
  // expanded. Recomputes on expand and on window resize. Clamped, kept square.
  useEffect(() => {
    const measure = () => {
      const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
      const modalW = expanded ? vw * 0.96 : Math.min(896, vw - 32);
      const inner = modalW - 48 /* px-6 padding */ - 28 /* B-axis gutter + gaps */;
      setSize(Math.max(280, Math.min(1200, Math.round(inner))));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [expanded]);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const SIZE = size;
    const dpr = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    cv.width = SIZE * dpr; cv.height = SIZE * dpr; ctx.scale(dpr, dpr);
    const primary = `hsl(${getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "352 47% 33%"})`;
    const border = `hsl(${getComputedStyle(document.documentElement).getPropertyValue("--border").trim() || "0 0% 85%"})`;
    ctx.clearRect(0, 0, SIZE, SIZE);
    // frame + faint identity diagonal
    ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(SIZE, SIZE); ctx.globalAlpha = 0.25; ctx.stroke(); ctx.globalAlpha = 1;
    // points
    const { nA, nB, points } = data;
    if (nA && nB) {
      const sx = SIZE / nA, sy = SIZE / nB;
      const d = Math.max(1.2, Math.min(sx, sy));
      ctx.fillStyle = primary; ctx.globalAlpha = 0.7;
      for (let k = 0; k < points.length; k += 2) {
        ctx.fillRect(points[k] * sx, points[k + 1] * sy, d, d);
      }
      ctx.globalAlpha = 1;
    }
  }, [data, size]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground">{data.count.toLocaleString()}</span> matching {data.unitLabel}
          {data.truncated && " (capped)"} · A = <span className="font-medium">{a.siglum}</span> ({data.nA} {data.unitLabel}) across the top, B = <span className="font-medium">{b.siglum}</span> ({data.nB}) down the side.
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground cursor-pointer select-none">
          <input type="checkbox" checked={hideCommon} onChange={(e) => setHideCommon(e.target.checked)} className="accent-primary" />
          Hide common {data.unitLabel}
        </label>
      </div>
      <div className="flex gap-1.5">
        <div className="flex items-center"><span className="text-[10px] text-muted-foreground [writing-mode:vertical-lr] rotate-180" title={b.title}>B · {b.siglum} →</span></div>
        <div className="min-w-0">
          <div className="text-[10px] text-muted-foreground mb-0.5" title={a.title}>A · {a.siglum} →</div>
          <canvas ref={ref} style={{ width: size, height: size }} className="rounded border border-border bg-card" />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        A point marks where a {data.unitLabel === "lines" ? "line" : "sentence"} of A matches one of B (exact, after normalisation). The <strong>diagonal</strong> is shared text in the same order; an <strong>off-diagonal</strong> streak is a moved block (transposition) or an internal repeat; <strong>gaps</strong> are additions/deletions. &ldquo;Hide common {data.unitLabel}&rdquo; drops boilerplate (blank lines, <code>term</code>, very frequent units) so the structure reads clearly. Tokenizer settings (Settings ▸ engines) change what counts as a match.
      </p>
    </div>
  );
}
