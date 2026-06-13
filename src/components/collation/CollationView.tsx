"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CollationMode, Variant, VariantType, Witness } from "@/types/collation";
import { VARIANT_TYPES, VARIANT_TYPE_COLORS, VARIANT_TYPE_LABELS } from "@/types/collation";
import { collate } from "@/lib/collate/collate";
import { computeCollationMetrics } from "@/lib/collate/metrics";
import { WitnessPanel } from "./WitnessPanel";
import { BraidGutter, type Ribbon } from "./BraidGutter";

type Side = "a" | "b";

export function CollationView({
  witnessA,
  witnessB,
  mode,
  moveThreshold = 0.7,
}: {
  witnessA: Witness;
  witnessB: Witness;
  mode: CollationMode;
  moveThreshold?: number;
}) {
  const variants = useMemo(
    () => collate(witnessA, witnessB, { mode, moveThreshold }),
    [witnessA, witnessB, mode, moveThreshold]
  );
  const metrics = useMemo(
    () => computeCollationMetrics(variants, witnessA, witnessB),
    [variants, witnessA, witnessB]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [visibleTypes, setVisibleTypes] = useState<Set<VariantType>>(
    () => new Set(VARIANT_TYPES)
  );
  const [showDeepDive, setShowDeepDive] = useState(false);

  // Anchor registry: key `${vid}:${side}` → element.
  const anchorsRef = useRef<Map<string, HTMLElement>>(new Map());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [ribbons, setRibbons] = useState<Ribbon[]>([]);
  const [gutterSize, setGutterSize] = useState({ width: 0, height: 0 });

  const registerAnchor = useCallback(
    (id: string, side: Side, el: HTMLElement | null) => {
      const key = `${id}:${side}`;
      if (el) anchorsRef.current.set(key, el);
      else anchorsRef.current.delete(key);
    },
    []
  );

  const measure = useCallback(() => {
    const wrapper = wrapperRef.current;
    const gutter = gutterRef.current;
    if (!wrapper || !gutter) return;
    const wRect = wrapper.getBoundingClientRect();
    const next: Ribbon[] = [];
    for (const v of variants) {
      const elA = anchorsRef.current.get(`${v.id}:a`);
      const elB = anchorsRef.current.get(`${v.id}:b`);
      if (!elA || !elB) continue; // additions/deletions have only one side: no ribbon
      const rA = elA.getBoundingClientRect();
      const rB = elB.getBoundingClientRect();
      next.push({
        id: v.id,
        type: v.type,
        yA: rA.top - wRect.top + rA.height / 2,
        yB: rB.top - wRect.top + rB.height / 2,
        length: v.length,
      });
    }
    setRibbons(next);
    setGutterSize({ width: gutter.clientWidth, height: wrapper.scrollHeight });
  }, [variants]);

  useLayoutEffect(() => {
    measure();
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(wrapper);
    // Re-measure once fonts have settled (web-font swap shifts line heights).
    const t = setTimeout(measure, 250);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [measure]);

  // Scroll the selected variant into view so its correspondence is on screen.
  const onSelect = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) {
      const el = anchorsRef.current.get(`${id}:a`) ?? anchorsRef.current.get(`${id}:b`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, []);

  const maxLength = useMemo(
    () => variants.reduce((m, v) => (v.type !== "match" ? Math.max(m, v.length) : m), 1),
    [variants]
  );

  const toggleType = (t: VariantType) =>
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const apparatus = useMemo(
    () => variants.filter((v) => v.type !== "match"),
    [variants]
  );

  return (
    <div className="flex flex-col">
      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 border-b border-border text-[11px] bg-muted/30 sticky top-0 z-20">
        <span className="text-muted-foreground mr-1">Show:</span>
        {VARIANT_TYPES.map((t) => {
          const on = visibleTypes.has(t);
          const count = metrics.counts[t];
          return (
            <button
              key={t}
              onClick={() => toggleType(t)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors"
              style={{
                borderColor: VARIANT_TYPE_COLORS[t],
                background: on ? `color-mix(in srgb, ${VARIANT_TYPE_COLORS[t]} 18%, transparent)` : "transparent",
                color: on ? "var(--foreground)" : "var(--muted-foreground)",
                opacity: on ? 1 : 0.55,
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: VARIANT_TYPE_COLORS[t] }}
              />
              {VARIANT_TYPE_LABELS[t]} ({count})
            </button>
          );
        })}
      </div>

      {/* Three-column braid */}
      <div ref={wrapperRef} className="relative grid" style={{ gridTemplateColumns: "1fr 120px 1fr" }}>
        {/* Witness A */}
        <div className="border-r border-border min-w-0">
          <WitnessHeader witness={witnessA} side="A" />
          <WitnessPanel
            side="a"
            witness={witnessA}
            variants={variants}
            mode={mode}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={onSelect}
            onHover={setHoveredId}
            registerAnchor={registerAnchor}
          />
        </div>

        {/* Braid gutter */}
        <div ref={gutterRef} className="relative bg-muted/10">
          <div className="absolute inset-0">
            <BraidGutter
              width={gutterSize.width}
              height={gutterSize.height}
              ribbons={ribbons}
              maxLength={maxLength}
              selectedId={selectedId}
              hoveredId={hoveredId}
              visibleTypes={visibleTypes}
              onSelect={onSelect}
              onHover={setHoveredId}
            />
          </div>
        </div>

        {/* Witness B */}
        <div className="border-l border-border min-w-0">
          <WitnessHeader witness={witnessB} side="B" />
          <WitnessPanel
            side="b"
            witness={witnessB}
            variants={variants}
            mode={mode}
            selectedId={selectedId}
            hoveredId={hoveredId}
            onSelect={onSelect}
            onHover={setHoveredId}
            registerAnchor={registerAnchor}
          />
        </div>
      </div>

      {/* Apparatus */}
      <ApparatusList
        entries={apparatus}
        witnessA={witnessA}
        witnessB={witnessB}
        mode={mode}
        selectedId={selectedId}
        onSelect={onSelect}
        onHover={setHoveredId}
      />

      {/* Deep dive */}
      <DeepDivePanel
        metrics={metrics}
        open={showDeepDive}
        onToggle={() => setShowDeepDive((v) => !v)}
        witnessA={witnessA}
        witnessB={witnessB}
      />
    </div>
  );
}

function WitnessHeader({ witness, side }: { witness: Witness; side: "A" | "B" }) {
  return (
    <div className="px-4 py-2 border-b border-border bg-card/60 flex items-baseline gap-2 sticky top-[37px] z-10">
      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
        {witness.siglum}
      </span>
      <span className="text-[13px] font-medium truncate">{witness.title}</span>
      {witness.date && <span className="text-[11px] text-muted-foreground">{witness.date}</span>}
      <span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wide">{side}</span>
    </div>
  );
}

function ApparatusList({
  entries,
  witnessA,
  witnessB,
  mode,
  selectedId,
  onSelect,
  onHover,
}: {
  entries: Variant[];
  witnessA: Witness;
  witnessB: Witness;
  mode: CollationMode;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
}) {
  const locus = (v: Variant) => {
    const sp = v.a ?? v.b;
    if (!sp || mode !== "source") return "";
    return sp.startLine === sp.endLine ? `l. ${sp.startLine}` : `ll. ${sp.startLine}–${sp.endLine}`;
  };
  const lead = (s: string) => {
    const w = s.trim().split(/\s+/).filter(Boolean);
    return w.slice(0, 7).join(" ") + (w.length > 7 ? " …" : "");
  };
  return (
    <div className="border-t border-border">
      <div className="px-4 py-2 text-[12px] font-semibold text-foreground/80 bg-muted/30 border-b border-border">
        Critical apparatus · {entries.length} {entries.length === 1 ? "entry" : "entries"}
      </div>
      <div className="divide-y divide-border/60 max-h-[40vh] overflow-y-auto">
        {entries.length === 0 && (
          <div className="px-4 py-3 text-[12px] text-muted-foreground">No variants — the witnesses are identical.</div>
        )}
        {entries.map((v) => (
          <button
            key={v.id}
            onClick={() => onSelect(v.id === selectedId ? null : v.id)}
            onMouseEnter={() => onHover(v.id)}
            onMouseLeave={() => onHover(null)}
            className="w-full text-left px-4 py-2 hover:bg-muted/40 flex gap-3 items-baseline"
            style={{ background: v.id === selectedId ? "color-mix(in srgb, var(--sv-sel) 12%, transparent)" : undefined }}
          >
            <span
              className="shrink-0 w-2 h-2 rounded-full mt-1.5"
              style={{ background: VARIANT_TYPE_COLORS[v.type] }}
              title={VARIANT_TYPE_LABELS[v.type]}
            />
            <span className="shrink-0 text-[11px] text-muted-foreground font-mono w-20">{locus(v) || VARIANT_TYPE_LABELS[v.type]}</span>
            <span className="text-[12.5px] leading-snug">
              {v.textA.trim() && (
                <span>
                  <span className="font-mono text-[10px] text-primary mr-1">{witnessA.siglum}</span>
                  {lead(v.textA)}
                </span>
              )}
              {v.textA.trim() && v.textB.trim() && <span className="text-muted-foreground mx-1.5">]</span>}
              {v.textB.trim() && (
                <span>
                  <span className="font-mono text-[10px] text-primary mr-1">{witnessB.siglum}</span>
                  {lead(v.textB)}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DeepDivePanel({
  metrics,
  open,
  onToggle,
  witnessA,
  witnessB,
}: {
  metrics: ReturnType<typeof computeCollationMetrics>;
  open: boolean;
  onToggle: () => void;
  witnessA: Witness;
  witnessB: Witness;
}) {
  const stat = (label: string, value: string) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-[14px] font-medium tabular-nums">{value}</span>
    </div>
  );
  return (
    <div className="border-t border-border">
      <button
        onClick={onToggle}
        className="w-full px-4 py-2 text-left text-[12px] font-semibold text-foreground/80 bg-muted/30 hover:bg-muted/50 flex items-center gap-2"
      >
        <span className="text-muted-foreground">{open ? "▾" : "▸"}</span>
        Deep dive · quantitative summary
      </button>
      {open && (
        <div className="px-4 py-4 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))" }}>
          {stat("Verbatim", `${metrics.verbatimPercent.toFixed(1)}%`)}
          {stat("Moved blocks", String(metrics.movedBlocks))}
          {stat("Moved length", `${metrics.movedLength} ch`)}
          {stat("Longest move", `${metrics.longestMove} ch`)}
          {stat("Jaccard", metrics.jaccard.toFixed(3))}
          {stat("Dice", metrics.dice.toFixed(3))}
          {stat("Cosine", metrics.cosine.toFixed(3))}
          {stat("Substitutions", String(metrics.counts.substitution))}
          {stat("Variants", String(metrics.counts.variant))}
          {stat("Additions", String(metrics.counts.addition))}
          {stat("Deletions", String(metrics.counts.deletion))}
          {stat(`${witnessA.siglum} → ${witnessB.siglum}`, `${witnessA.text.length} → ${witnessB.text.length} ch`)}
        </div>
      )}
    </div>
  );
}
