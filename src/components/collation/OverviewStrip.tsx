"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { PanelLeftClose } from "lucide-react";
import type { Variant, VariantType } from "@/types/collation";
import { VARIANT_TYPE_COLORS } from "@/types/collation";
import type { Hotspots } from "@/lib/collate/hotspots";
import { heat } from "./HotspotBar";

/**
 * VVV-style vertical overview strip (a "minimap"): a thin column down the left of
 * the collation showing, top-to-bottom, where the witnesses diverge across the
 * base text. Each non-match variant is a small band at its document position,
 * coloured by the same variant-type palette the panels use; the selected locus
 * glows in the version-variation yellow. A viewport box tracks the scroll
 * position, and clicking jumps to the nearest variant. Hideable.
 */
const VH = 1000; // virtual height units

export function OverviewStrip({
  variants,
  baseLength,
  visibleTypes,
  selectedId,
  onSelect,
  scrollRef,
  onHide,
  lengthB,
  hotspots,
  hotspotMode,
}: {
  variants: Variant[];
  baseLength: number;
  visibleTypes: Set<VariantType>;
  selectedId: string | null;
  onSelect: (id: string, scroll?: boolean) => void;
  scrollRef: RefObject<HTMLElement | null>;
  onHide: () => void;
  /** Length of witness B, to place additions (which have no base position) at
   *  their proportional point in the base coordinate space. */
  lengthB: number;
  /** Version-hotspot data (base vs all witnesses) for the hotspot mode. */
  hotspots: Hotspots | null;
  /** When true, show the aggregate hotspot heat instead of the pair's variants. */
  hotspotMode: boolean;
}) {
  const [vp, setVp] = useState({ top: 0, h: 1 });
  const [width, setWidth] = useState(30);
  useEffect(() => {
    try { const w = localStorage.getItem("source-variorum-strip-width"); if (w) setWidth(Math.min(160, Math.max(18, parseInt(w, 10) || 30))); } catch { /* ignore */ }
  }, []);
  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => setWidth(Math.min(160, Math.max(18, startW + (ev.clientX - startX))));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try { localStorage.setItem("source-variorum-strip-width", String(Math.min(160, Math.max(18, startW + (ev.clientX - startX))))); } catch { /* ignore */ }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const sh = el.scrollHeight || 1;
      setVp({ top: (el.scrollTop / sh) * VH, h: Math.max(8, (el.clientHeight / sh) * VH) });
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [scrollRef, variants]);

  const len = Math.max(1, baseLength);
  const lenB = Math.max(1, lengthB);

  // Bucket variants by base position into one band per bucket (dominant type,
  // opacity by density) so the strip reads as a clean column rather than a solid
  // block of thousands of overlapping bands. Buckets with no change stay clear.
  const NB = 150;
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
    const vbands: { y: number; h: number; color: string; opacity: number }[] = [];
    for (let b = 0; b < NB; b++) {
      let dom: VariantType | null = null, domLen = 0, total = 0;
      for (const t in acc[b]) { const l = acc[b][t as VariantType]!; total += l; if (l > domLen) { domLen = l; dom = t as VariantType; } }
      if (!dom) continue;
      const density = Math.min(1, total / bw);
      vbands.push({ y: (b / NB) * VH, h: VH / NB + 0.6, color: VARIANT_TYPE_COLORS[dom], opacity: 0.25 + 0.7 * density });
    }
    navPoints.sort((a, b) => a.y - b.y);
    return { vbands, navPoints, selectedY };
  }, [variants, visibleTypes, selectedId, len, lenB]);

  // Aggregate hotspot heat down the base (a thin column shown to the RIGHT of the
  // variant overview when enabled): each bucket coloured by how many of the other
  // witnesses diverge there.
  const showHeatCol = hotspotMode && hotspots != null && hotspots.others >= 2 && hotspots.baseLength > 0;
  const heatBuckets = useMemo(() => {
    if (!showHeatCol || !hotspots) return [];
    const N = 150;
    const { freq, others, baseLength } = hotspots;
    const out: { y: number; h: number; color: string }[] = [];
    for (let i = 0; i < N; i++) {
      const s = Math.floor((i / N) * baseLength);
      const e = Math.max(s + 1, Math.floor(((i + 1) / N) * baseLength));
      let sum = 0;
      for (let j = s; j < e && j < baseLength; j++) sum += freq[j];
      const intensity = sum / Math.max(1, e - s) / others; // 0..1
      if (intensity > 0.01) out.push({ y: (i / N) * VH, h: VH / N + 0.6, color: heat(intensity) });
    }
    return out;
  }, [showHeatCol, hotspots]);

  // Variant overview occupies the left zone; the hotspot heat the right column.
  const vw = showHeatCol ? 6.5 : 10;

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = ((e.clientY - rect.top) / rect.height) * VH;
    let best: string | null = null;
    let bd = Infinity;
    for (const p of navPoints) {
      const d = Math.abs(p.y - y);
      if (d < bd) { bd = d; best = p.id; }
    }
    if (best) onSelect(best, true);
  };

  return (
    <div className="shrink-0 border-r border-border bg-muted/20 flex flex-col items-stretch sticky top-0 self-start relative" style={{ height: "calc(100dvh - 84px)", width: `${width}px` }}>
      <button onClick={onHide} title="Hide overview strip" className="h-5 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted">
        <PanelLeftClose className="w-3 h-3" />
      </button>
      <div className="flex-1 min-h-0 cursor-pointer" onClick={onClick} title={showHeatCol ? "Overview (left) · version hotspots (right) — click to jump" : "Overview — click to jump"}>
        <svg viewBox={`0 0 10 ${VH}`} preserveAspectRatio="none" className="w-full h-full block">
          <rect x={0} y={0} width={10} height={VH} className="fill-card/40" />
          {/* Variant overview (bucketed) in the left zone. */}
          {vbands.map((b, i) => (
            <rect key={i} x={0} y={b.y} width={vw} height={b.h} fill={b.color} opacity={b.opacity} />
          ))}
          {selectedY != null && <rect x={0} y={Math.max(0, selectedY - 1)} width={vw} height={3} fill="var(--sv-variation)" />}
          {/* Hotspot heat as a thin column on the right. */}
          {showHeatCol && (
            <>
              <rect x={vw + 0.4} y={0} width={10 - (vw + 0.4)} height={VH} className="fill-card/60" />
              {heatBuckets.map((b, i) => (
                <rect key={`h${i}`} x={vw + 0.6} y={b.y} width={10 - (vw + 0.6)} height={b.h} fill={b.color} opacity={0.95} />
              ))}
            </>
          )}
          {/* viewport indicator */}
          <rect x={0.5} y={vp.top} width={9} height={vp.h} className="fill-foreground/5 stroke-foreground/40" strokeWidth={1.5} rx={1} />
        </svg>
      </div>
      {/* Drag handle (right edge) to widen the strip. */}
      <div onPointerDown={onResizeDown} title="Drag to resize" className="absolute top-0 right-0 h-full w-1.5 -mr-0.5 cursor-col-resize hover:bg-primary/30 z-20" />
    </div>
  );
}
