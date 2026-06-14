"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { PanelLeftClose } from "lucide-react";
import type { Variant, VariantType } from "@/types/collation";
import { VARIANT_TYPE_COLORS } from "@/types/collation";
import type { Hotspots } from "@/lib/collate/hotspots";
import { heat } from "./HotspotBar";

/**
 * Vertical overview strip: a map / orientation aid down the left of the
 * collation. Three independent layers, each toggled from the View menu:
 *   • Panel minimap   — a tiny IDE-style shape of the base text (where am I);
 *                       the darker, dominant background.
 *   • Variant map     — where the two open witnesses differ (dominant type),
 *                       drawn faintly over the minimap.
 *   • Version hotspots — where ALL witnesses diverge (Viv heat), 3+ witnesses;
 *                       a thin heat line on the left, before the minimap.
 * Bars are drawn sparse (length ∝ amount of change) so the strip reads as a map
 * rather than a solid block. A viewport box tracks scroll; click jumps to the
 * nearest variant.
 */
const VH = 1000; // virtual height units
const GAP = 0.4; // gap between columns (viewBox units)

export function OverviewStrip({
  variants,
  baseText,
  baseLength,
  visibleTypes,
  selectedId,
  onSelect,
  scrollRef,
  onHide,
  lengthB,
  hotspots,
  colMinimap,
  colVariants,
  colHotspots,
}: {
  variants: Variant[];
  baseText: string;
  baseLength: number;
  visibleTypes: Set<VariantType>;
  selectedId: string | null;
  onSelect: (id: string, scroll?: boolean) => void;
  scrollRef: RefObject<HTMLElement | null>;
  onHide: () => void;
  lengthB: number;
  hotspots: Hotspots | null;
  colMinimap: boolean;
  colVariants: boolean;
  colHotspots: boolean;
}) {
  const [vp, setVp] = useState({ top: 0, h: 1 });
  const [width, setWidth] = useState(34);
  useEffect(() => {
    try { const w = localStorage.getItem("source-variorum-strip-width"); if (w) setWidth(Math.min(220, Math.max(18, parseInt(w, 10) || 34))); } catch { /* ignore */ }
  }, []);
  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => setWidth(Math.min(220, Math.max(18, startW + (ev.clientX - startX))));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try { localStorage.setItem("source-variorum-strip-width", String(Math.min(220, Math.max(18, startW + (ev.clientX - startX))))); } catch { /* ignore */ }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const sh = el.scrollHeight || 1;
      // Enforce a minimum handle height so the indicator stays visible even on
      // very long witnesses (where the true proportion is a sliver), and keep it
      // within the strip.
      const h = Math.max(28, (el.clientHeight / sh) * VH);
      const top = Math.min(VH - h, (el.scrollTop / sh) * VH);
      setVp({ top, h });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [scrollRef, variants]);

  const len = Math.max(1, baseLength);
  const lenB = Math.max(1, lengthB);
  const showHeat = colHotspots && hotspots != null && hotspots.others >= 2 && hotspots.baseLength > 0;

  // ----- Code minimap: per-(sampled)-line shape of the base text -----
  const mini = useMemo(() => {
    if (!colMinimap) return { rows: [] as { y: number; x: number; w: number }[], h: 1 };
    const lines = baseText.split("\n");
    const n = lines.length || 1;
    const ROWS = Math.min(n, 480);
    let maxLen = 24;
    for (const l of lines) maxLen = Math.max(maxLen, l.trim().length);
    const rows: { y: number; x: number; w: number }[] = [];
    for (let r = 0; r < ROWS; r++) {
      const line = lines[Math.floor((r / ROWS) * n)] ?? "";
      const tl = line.trim().length;
      if (tl === 0) continue; // blank line → a gap in the map
      const indent = Math.min(0.45, (line.length - line.trimStart().length) / 50);
      rows.push({ y: (r / ROWS) * VH, x: indent, w: Math.min(1 - indent, (tl / maxLen) * (1 - indent)) });
    }
    return { rows, h: VH / ROWS + 0.5 };
  }, [colMinimap, baseText]);

  // ----- Variant map: bucketed, bar length ∝ change density -----
  const NB = 220;
  const { vbands, navPoints, selectedY } = useMemo(() => {
    const bw = len / NB;
    const acc: Array<Partial<Record<VariantType, number>>> = Array.from({ length: NB }, () => ({}));
    const navPoints: { y: number; id: string }[] = [];
    let selectedY: number | null = null;
    for (const v of variants) {
      if (v.type === "match" || !visibleTypes.has(v.type)) continue;
      const s = v.a ? v.a.start : v.b ? (v.b.start / lenB) * len : 0;
      const e = v.a ? v.a.end : s + 1;
      navPoints.push({ y: (s / len) * VH, id: v.id });
      if (v.id === selectedId) selectedY = (s / len) * VH;
      const b0 = Math.max(0, Math.floor(s / bw));
      const b1 = Math.min(NB - 1, Math.floor(Math.max(s, e - 1) / bw));
      const per = (e - s) / (b1 - b0 + 1);
      for (let b = b0; b <= b1; b++) acc[b][v.type] = (acc[b][v.type] ?? 0) + per;
    }
    const vbands: { y: number; h: number; w: number; color: string }[] = [];
    for (let b = 0; b < NB; b++) {
      let dom: VariantType | null = null, domLen = 0, total = 0;
      for (const t in acc[b]) { const l = acc[b][t as VariantType]!; total += l; if (l > domLen) { domLen = l; dom = t as VariantType; } }
      if (!dom) continue;
      const density = Math.min(1, total / bw);
      vbands.push({ y: (b / NB) * VH, h: (VH / NB) * 0.7, w: 0.22 + 0.78 * density, color: VARIANT_TYPE_COLORS[dom] });
    }
    navPoints.sort((a, b) => a.y - b.y);
    return { vbands, navPoints, selectedY };
  }, [variants, visibleTypes, selectedId, len, lenB]);

  // ----- Hotspot map: bucketed, bar length ∝ divergence intensity -----
  const heatBuckets = useMemo(() => {
    if (!showHeat || !hotspots) return [];
    const N = 150;
    const { freq, others, baseLength } = hotspots;
    const out: { y: number; h: number; w: number; color: string; op: number }[] = [];
    for (let i = 0; i < N; i++) {
      const s = Math.floor((i / N) * baseLength);
      const e = Math.max(s + 1, Math.floor(((i + 1) / N) * baseLength));
      let sum = 0;
      for (let j = s; j < e && j < baseLength; j++) sum += freq[j];
      const intensity = sum / Math.max(1, e - s) / others; // 0..1
      // Low-divergence buckets fade out so the genuine hotspots read clearly.
      if (intensity > 0.01) out.push({ y: (i / N) * VH, h: VH / N + 0.6, w: 0.15 + 0.85 * intensity, color: heat(intensity), op: 0.25 + 0.7 * intensity });
    }
    return out;
  }, [showHeat, hotspots]);

  // ----- Layout: a thin hotspot heat line on the LEFT, a small gap, then the
  // "main" zone — the panel minimap (darker, dominant background) with the
  // variant map drawn faintly over it. -----
  const hasMain = colMinimap || colVariants;
  if (!hasMain && !showHeat) return null;
  const HEAT_W = 1.3; // thin hotspot line
  const heatX = 0;
  const heatW = HEAT_W;
  const mainX = showHeat ? HEAT_W + GAP : 0;
  const mainW = hasMain ? 10 - mainX : 0;

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = ((e.clientY - rect.top) / rect.height) * VH;
    let best: string | null = null;
    let bd = Infinity;
    for (const p of navPoints) { const d = Math.abs(p.y - y); if (d < bd) { bd = d; best = p.id; } }
    if (best) onSelect(best, true);
  };

  return (
    <div className="shrink-0 border-r border-border bg-muted/20 flex flex-col items-stretch relative h-full" style={{ width: `${width}px` }}>
      <button onClick={onHide} title="Hide overview strip" className="h-5 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted">
        <PanelLeftClose className="w-3 h-3" />
      </button>
      <div className="flex-1 min-h-0 cursor-pointer" onClick={onClick} title="Overview — click to jump">
        <svg viewBox={`0 0 10 ${VH}`} preserveAspectRatio="none" className="w-full h-full block">
          {hasMain && <rect x={mainX} y={0} width={mainW} height={VH} className="fill-card/40" />}
          {/* Panel minimap — a faint code-shape texture for orientation only, so
              it sits quietly behind the variant signal. */}
          {colMinimap && mini.rows.map((r, i) => (
            <rect key={`m${i}`} x={mainX + r.x * mainW} y={r.y} width={Math.max(0.25, r.w * mainW)} height={mini.h} className="fill-foreground" opacity={colVariants ? 0.14 : 0.26} />
          ))}
          {/* Variant map — thin coloured ticks growing from the right edge, so the
              change signal reads as its own histogram beside the faint minimap. */}
          {colVariants && vbands.map((b, i) => (
            <rect key={`v${i}`} x={mainX + mainW - b.w * mainW} y={b.y} width={b.w * mainW} height={b.h} fill={b.color} opacity={0.8} rx={0.15} />
          ))}
          {colVariants && selectedY != null && <rect x={mainX} y={Math.max(0, selectedY - 1)} width={mainW} height={3} fill="var(--sv-variation)" />}
          {/* Version hotspots — a thin heat line on the left, before the minimap. */}
          {showHeat && <rect x={heatX} y={0} width={heatW} height={VH} className="fill-card/30" />}
          {showHeat && heatBuckets.map((b, i) => (
            <rect key={`h${i}`} x={heatX} y={b.y} width={b.w * heatW} height={b.h} fill={b.color} opacity={b.op} />
          ))}
          {/* Viewport indicator across the whole strip — a primary-tinted band,
              clearly visible but not as harsh as solid black. */}
          <rect x={0.5} y={vp.top} width={9} height={vp.h} fill="var(--primary)" fillOpacity={0.22} stroke="var(--primary)" strokeOpacity={1} strokeWidth={2} rx={1.2} />
        </svg>
      </div>
      <div onPointerDown={onResizeDown} title="Drag to resize" className="absolute top-0 right-0 h-full w-1.5 -mr-0.5 cursor-col-resize hover:bg-primary/30 z-20" />
    </div>
  );
}
