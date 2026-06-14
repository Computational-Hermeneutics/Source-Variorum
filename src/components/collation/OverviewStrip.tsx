"use client";

import { useEffect, useState, type RefObject } from "react";
import { PanelLeftClose } from "lucide-react";
import type { Variant, VariantType } from "@/types/collation";
import { VARIANT_TYPE_COLORS } from "@/types/collation";

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
}: {
  variants: Variant[];
  baseLength: number;
  visibleTypes: Set<VariantType>;
  selectedId: string | null;
  onSelect: (id: string, scroll?: boolean) => void;
  scrollRef: RefObject<HTMLElement | null>;
  onHide: () => void;
}) {
  const [vp, setVp] = useState({ top: 0, h: 1 });
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
  const bands = variants
    .filter((v) => v.type !== "match" && visibleTypes.has(v.type))
    .map((v) => {
      const pos = v.a ? v.a.start : 0;
      const span = v.a ? v.a.end - v.a.start : 1;
      return {
        id: v.id,
        y: (pos / len) * VH,
        h: Math.max(2.5, (span / len) * VH),
        color: v.id === selectedId ? "var(--sv-variation)" : VARIANT_TYPE_COLORS[v.type],
        selected: v.id === selectedId,
      };
    });

  const navPoints = bands.map((b) => ({ y: b.y, id: b.id })).sort((a, b) => a.y - b.y);

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
    <div className="shrink-0 w-7 border-r border-border bg-muted/20 flex flex-col items-stretch sticky top-0 self-start" style={{ height: "calc(100dvh - 84px)" }}>
      <button onClick={onHide} title="Hide overview strip" className="h-5 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted">
        <PanelLeftClose className="w-3 h-3" />
      </button>
      <div className="flex-1 min-h-0 cursor-pointer" onClick={onClick} title="Overview — click to jump">
        <svg viewBox={`0 0 10 ${VH}`} preserveAspectRatio="none" className="w-full h-full block">
          <rect x={0} y={0} width={10} height={VH} className="fill-card/40" />
          {bands.map((b) => (
            <rect key={b.id} x={b.selected ? 0 : 1.5} y={b.y} width={b.selected ? 10 : 7} height={b.h} fill={b.color} opacity={b.selected ? 1 : 0.8} />
          ))}
          {/* viewport indicator */}
          <rect x={0.5} y={vp.top} width={9} height={vp.h} className="fill-foreground/5 stroke-foreground/40" strokeWidth={1.5} rx={1} />
        </svg>
      </div>
    </div>
  );
}
