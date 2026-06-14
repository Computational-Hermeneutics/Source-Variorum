"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X, Pencil, Highlighter, Maximize2, Minimize2, Copy, Check, Undo2, Redo2, ChevronsLeftRight, ChevronsRightLeft } from "lucide-react";
import type { ApparatusEntry, CollationMetrics, CollationMode, Variant, VariantType, Witness } from "@/types/collation";
import type { LineAnnotation } from "@/types/annotations";
import { VARIANT_TYPE_COLORS, variantLabel } from "@/types/collation";
import { LANGS } from "@/lib/highlight";
import { linkIdOf } from "@/lib/collate/manual";
import type { useProject } from "@/hooks/useProject";
import type { deriveView } from "@/lib/export/collation-export";
import { WitnessPanel } from "./WitnessPanel";
import { BraidGutter, type Ribbon } from "./BraidGutter";
import { Histogram } from "./Histogram";
import { OverviewStrip } from "./OverviewStrip";
import { HotspotBar } from "./HotspotBar";
import type { Hotspots } from "@/lib/collate/hotspots";
import type { EddyRow } from "@/lib/collate/eddy";

type Side = "a" | "b";
type Project = ReturnType<typeof useProject>;
type View = ReturnType<typeof deriveView>;
type ApparatusEdit = Pick<ApparatusEntry, "note" | "category">;

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `a${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  }
}

export function CollationView({
  project,
  view,
  fontSize,
  editSide,
  onEditSide,
  annotateSide,
  onAnnotateSide,
  advancedMode,
  visibleTypes,
  onToggleType,
  showDeepDive,
  onToggleDeepDive,
  langA,
  langB,
  onLangA,
  onLangB,
  showOverview,
  onCloseOverview,
  showApparatus,
  onCloseApparatus,
  hotspots,
  eddy,
  baseId,
  stripCols,
  stripVisible,
  onHideStrip,
  scrollLocked,
  search,
  isDark,
}: {
  project: Project;
  view: View;
  fontSize: number;
  editSide: Side | null;
  onEditSide: (s: Side | null) => void;
  annotateSide: Side | null;
  onAnnotateSide: (s: Side | null) => void;
  advancedMode: boolean;
  visibleTypes: Set<VariantType>;
  onToggleType: (t: VariantType) => void;
  showDeepDive: boolean;
  onToggleDeepDive: () => void;
  langA?: string;
  langB?: string;
  onLangA: (id: string) => void;
  onLangB: (id: string) => void;
  showOverview: boolean;
  onCloseOverview: () => void;
  showApparatus: boolean;
  onCloseApparatus: () => void;
  hotspots: Hotspots | null;
  eddy: EddyRow[];
  baseId: string;
  stripCols: { minimap: boolean; variants: boolean; hotspots: boolean };
  stripVisible: boolean;
  onHideStrip: () => void;
  scrollLocked: boolean;
  search?: string;
  isDark: boolean;
}) {
  const editMode = editSide !== null;
  const { collation } = project;
  const { a: witnessA, b: witnessB, variants, metrics } = view;
  const mode = collation.mode;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pendingAnn, setPendingAnn] = useState<{ witnessId: string; line: number } | null>(null);
  // Per-panel "expand": focus one panel, hiding the other column + the gutter.
  const [focusSide, setFocusSide] = useState<Side | null>(null);
  // Advanced-mode hand-linking: a picked character range per side.
  const [leftPick, setLeftPick] = useState<{ start: number; end: number } | null>(null);
  const [rightPick, setRightPick] = useState<{ start: number; end: number } | null>(null);

  // Braid column is draggable (handles on either side) and collapsible.
  const [braidWidth, setBraidWidth] = useState(120);
  const prevBraidRef = useRef(120);
  useEffect(() => {
    try { const w = localStorage.getItem("source-variorum-braid-width"); if (w != null) setBraidWidth(Math.max(8, Math.min(360, parseInt(w, 10) || 120))); } catch { /* ignore */ }
  }, []);
  const persistBraid = (w: number) => { try { localStorage.setItem("source-variorum-braid-width", String(w)); } catch { /* ignore */ } };
  const onBraidResize = (fromSide: "left" | "right") => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX; const startW = braidWidth;
    const clamp = (w: number) => Math.max(8, Math.min(360, w));
    const widthFrom = (ev: PointerEvent) => clamp(startW + (fromSide === "left" ? -(ev.clientX - startX) : ev.clientX - startX) * 2);
    const move = (ev: PointerEvent) => setBraidWidth(widthFrom(ev));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      persistBraid(widthFrom(ev));
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const toggleBraid = () => setBraidWidth((w) => {
    if (w > 12) { prevBraidRef.current = w; persistBraid(8); return 8; }
    const n = prevBraidRef.current > 12 ? prevBraidRef.current : 120; persistBraid(n); return n;
  });
  const braidOpen = braidWidth >= 40;

  const anchorsRef = useRef<Map<string, HTMLElement>>(new Map());
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Each panel scrolls in its own container. When locked, scrolling one mirrors
  // the other by position ratio.
  const panelARef = useRef<HTMLDivElement>(null);
  const panelBRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [ribbons, setRibbons] = useState<Ribbon[]>([]);
  const [gutterSize, setGutterSize] = useState({ width: 0, height: 0 });

  // Content-relative top offset of every anchor on each side, cached so the
  // ribbon recompute does pure arithmetic instead of per-tick layout reads.
  const offsetsRef = useRef<{ a: Map<string, number>; b: Map<string, number> }>({ a: new Map(), b: new Map() });
  // The braid is frozen (hidden) while a panel is actively scrolling and redrawn
  // once scrolling settles — keeps scrolling smooth on long witnesses.
  const [scrolling, setScrolling] = useState(false);
  const scrollingRef = useRef(false);
  const scrollEndRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildOffsets = useCallback(() => {
    const pa = panelARef.current, pb = panelBRef.current;
    const a = new Map<string, number>(), b = new Map<string, number>();
    if (pa) { const base = pa.getBoundingClientRect().top - pa.scrollTop; for (const [k, el] of anchorsRef.current) if (k.endsWith(":a")) a.set(k.slice(0, -2), el.getBoundingClientRect().top - base); }
    if (pb) { const base = pb.getBoundingClientRect().top - pb.scrollTop; for (const [k, el] of anchorsRef.current) if (k.endsWith(":b")) b.set(k.slice(0, -2), el.getBoundingClientRect().top - base); }
    offsetsRef.current = { a, b };
  }, []);

  const recomputeRibbons = useCallback(() => {
    const wrapper = wrapperRef.current, gutter = gutterRef.current, pa = panelARef.current, pb = panelBRef.current;
    if (!wrapper || !gutter || !pa || !pb) return;
    const H = wrapper.clientHeight;
    const aScroll = pa.scrollTop, bScroll = pb.scrollTop;
    const oa = offsetsRef.current.a, ob = offsetsRef.current.b;
    const next: Ribbon[] = [];
    for (const v of variants) {
      const ca = oa.get(v.id), cb = ob.get(v.id);
      if (ca == null || cb == null) continue;
      const yA = ca - aScroll, yB = cb - bScroll;
      // Draw a ribbon when at least one end is on-screen, so a diagonal still
      // leaves the viewport toward an off-screen counterpart (the braid's point).
      const visA = yA >= -24 && yA <= H + 24;
      const visB = yB >= -24 && yB <= H + 24;
      if (!visA && !visB) continue;
      next.push({ id: v.id, type: v.type, yA, yB, length: v.length });
    }
    setRibbons(next);
    setGutterSize({ width: gutter.clientWidth, height: H });
  }, [variants]);

  // Locked = the two panels scroll together by position, so both start at line 1
  // and each source's own top (e.g. its header macro) stays visible. The braid's
  // sloped ribbons show how the content actually corresponds.
  const syncCounterpart = useCallback((from: Side) => {
    const src = from === "a" ? panelARef.current : panelBRef.current;
    const dst = from === "a" ? panelBRef.current : panelARef.current;
    if (!src || !dst) return;
    syncingRef.current = true;
    dst.scrollTop = src.scrollTop;
    requestAnimationFrame(() => { syncingRef.current = false; });
  }, []);

  const onPanelScroll = useCallback((from: Side) => () => {
    if (scrollLocked && !syncingRef.current) syncCounterpart(from);
    if (!scrollingRef.current) { scrollingRef.current = true; setScrolling(true); }
    if (scrollEndRef.current) clearTimeout(scrollEndRef.current);
    scrollEndRef.current = setTimeout(() => {
      scrollingRef.current = false; setScrolling(false);
      buildOffsets(); recomputeRibbons();
    }, 120);
  }, [scrollLocked, syncCounterpart, buildOffsets, recomputeRibbons]);

  const registerAnchor = useCallback((id: string, side: Side, el: HTMLElement | null) => {
    const key = `${id}:${side}`;
    if (el) anchorsRef.current.set(key, el);
    else anchorsRef.current.delete(key);
  }, []);

  useLayoutEffect(() => {
    if (editMode) return; // braid is hidden while editing text
    const recompute = () => { buildOffsets(); recomputeRibbons(); };
    recompute();
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(recompute);
    ro.observe(wrapper);
    const t = setTimeout(recompute, 250);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [buildOffsets, recomputeRibbons, editMode, fontSize]);

  const scrollToLine = useCallback(
    (side: Side, line: number) => {
      const v = variants.find((x) => {
        const sp = side === "a" ? x.a : x.b;
        return sp && sp.startLine <= line && line <= sp.endLine;
      });
      if (v) anchorsRef.current.get(`${v.id}:${side}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [variants]
  );

  // `scroll` is true only when the selection comes from the apparatus list or a
  // ribbon (where the locus may be off-screen). A plain click on the text just
  // highlights it in place — no jump.
  const onSelect = useCallback((id: string | null, scroll = true) => {
    setSelectedId(id);
    if (id && scroll) {
      const el = anchorsRef.current.get(`${id}:a`) ?? anchorsRef.current.get(`${id}:b`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, []);

  // A click in the text body highlights in place. When the panels are UNLOCKED,
  // it also scrolls the OTHER panel to bring the linked locus into view — a peek
  // at where the reading maps (when locked, the panels already move together).
  const onTextSelect = useCallback(
    (side: Side) => (id: string | null) => {
      setSelectedId(id);
      if (id && !scrollLocked) {
        const other: Side = side === "a" ? "b" : "a";
        anchorsRef.current.get(`${id}:${other}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    },
    [scrollLocked]
  );

  // ----- Advanced-mode hand-linking -----
  const variantById = useMemo(() => {
    const m = new Map<string, Variant>();
    for (const v of variants) m.set(v.id, v);
    return m;
  }, [variants]);

  const onPick = useCallback(
    (side: Side, vid: string, shift: boolean) => {
      const v = variantById.get(vid);
      const sp = v && (side === "a" ? v.a : v.b);
      if (!sp) return;
      const setter = side === "a" ? setLeftPick : setRightPick;
      setter((prev) =>
        shift && prev
          ? { start: Math.min(prev.start, sp.start), end: Math.max(prev.end, sp.end) }
          : { start: sp.start, end: sp.end }
      );
    },
    [variantById]
  );

  // Precise picking: an arbitrary character range from a native text selection
  // (CollateX-style boundary setting), not tied to segment boundaries.
  const onPickRange = useCallback((side: Side, start: number, end: number, shift: boolean) => {
    if (end <= start) return;
    const setter = side === "a" ? setLeftPick : setRightPick;
    setter((prev) =>
      shift && prev
        ? { start: Math.min(prev.start, start), end: Math.max(prev.end, end) }
        : { start, end }
    );
  }, []);

  const clearPicks = useCallback(() => {
    setLeftPick(null);
    setRightPick(null);
  }, []);

  const createLink = useCallback(
    (type: VariantType) => {
      if (!leftPick && !rightPick) return;
      project.addManualLink({
        id: uid(),
        type,
        a: leftPick ? { ...leftPick } : undefined,
        b: rightPick ? { ...rightPick } : undefined,
      });
      clearPicks();
    },
    [leftPick, rightPick, project, clearPicks]
  );

  const maxLength = useMemo(
    () => variants.reduce((m, v) => (v.type !== "match" ? Math.max(m, v.length) : m), 1),
    [variants]
  );

  const apparatus = useMemo(() => variants.filter((v) => v.type !== "match"), [variants]);

  const annotationsFor = (id: string): LineAnnotation[] => collation.annotations[id] ?? [];

  const requestAnnotate = (witnessId: string) => (line: number) => setPendingAnn({ witnessId, line });

  return (
    <div className="flex flex-1 min-h-0">
      {stripVisible && !editMode && (
        <OverviewStrip
          variants={variants}
          baseText={witnessA.text}
          baseLength={witnessA.text.length}
          lengthB={witnessB.text.length}
          visibleTypes={visibleTypes}
          selectedId={selectedId}
          onSelect={onSelect}
          scrollRef={panelARef}
          onHide={onHideStrip}
          hotspots={hotspots}
          colMinimap={stripCols.minimap}
          colVariants={stripCols.variants}
          colHotspots={stripCols.hotspots}
        />
      )}
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
      {/* A slim hint bar, shown only in edit / advanced mode (the variant legend
          now lives in the status bar; the change-overview is a modal). */}
      {(editMode || advancedMode) && (
        <div className="px-3 py-1 border-b border-border text-[10px] bg-muted/30 sticky top-0 z-20 text-muted-foreground">
          {editMode && <span className="text-amber-700 dark:text-amber-400">Editing — braid paused</span>}
          {advancedMode && !editMode && <span className="text-primary">Advanced — click a passage or drag to select an exact range on each side, then link</span>}
        </div>
      )}

      {/* Global change-overview (Juxta-style histogram), opened from the toolbar. */}
      {showOverview && (
        <ModalCard title="Change overview" subtitle="Where the witnesses diverge across the base text — click to jump" onClose={onCloseOverview}>
          {eddy.length >= 3 && (
            <div className="mb-4">
              <div className="text-[11px] text-muted-foreground mb-1.5">
                <strong>Version distinctiveness (Eddy)</strong> — each witness&apos;s mean lexical distance from all the others. Longest bar = the outlier.
              </div>
              <div className="space-y-1">
                {(() => {
                  const max = Math.max(...eddy.map((e) => e.eddy), 0.001);
                  return eddy.map((e, i) => (
                    <div key={e.id} className="flex items-center gap-2 text-[12px]">
                      <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}.</span>
                      <span className="w-44 shrink-0 truncate" title={e.title}>{e.title}{e.id === baseId ? " (base)" : ""}</span>
                      <span className="flex-1 min-w-0 h-3 rounded bg-muted/50 overflow-hidden">
                        <span className="block h-full rounded" style={{ width: `${(e.eddy / max) * 100}%`, background: i === 0 ? "var(--sv-variation)" : "var(--sv-match)" }} />
                      </span>
                      <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{e.eddy.toFixed(2)}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
          {hotspots && hotspots.others >= 2 && (
            <div className="mb-4">
              <div className="text-[11px] text-muted-foreground mb-1">
                <strong>Version hotspots</strong> — how many of the {hotspots.others} other witnesses diverge from the base ({witnessA.title}) at each point. Hot/tall = a passage the versions most contest.
              </div>
              <HotspotBar hotspots={hotspots} large />
            </div>
          )}
          <div className="text-[11px] text-muted-foreground mb-1"><strong>This pair</strong> — variants between the two open panels.</div>
          <Histogram
            variants={variants}
            baseLength={witnessA.text.length}
            visibleTypes={visibleTypes}
            selectedId={selectedId}
            onSelect={(id, scroll) => { onSelect(id, scroll); onCloseOverview(); }}
            large
          />
        </ModalCard>
      )}

      {/* Three-column braid. Clicking the background (not a span or ribbon)
          clears the current selection. In focus/expand mode one panel fills the
          width and the gutter + other panel are hidden. */}
      <div ref={wrapperRef} onClick={() => (advancedMode ? clearPicks() : onSelect(null))} className="relative grid flex-1 min-h-0" style={{ gridTemplateColumns: focusSide ? "1fr" : `1fr ${braidWidth}px 1fr` }}>
        {focusSide !== "b" && (
          <div ref={panelARef} data-sv-scroll="a" onScroll={onPanelScroll("a")} className="border-r border-border min-w-0 bg-card overflow-y-auto min-h-0">
            <WitnessHeader
              witness={witnessA} side="A" panel="a" project={project} which="left" mode={mode}
              annCount={annotationsFor(witnessA.id).length}
              editing={editSide === "a"} onToggleEdit={() => onEditSide(editSide === "a" ? null : "a")}
              annotating={annotateSide === "a"} onToggleAnnotate={() => onAnnotateSide(annotateSide === "a" ? null : "a")}
              focused={focusSide === "a"} onToggleFocus={() => setFocusSide(focusSide === "a" ? null : "a")}
              lang={langA} onLang={onLangA}
            />
            <WitnessPanel
              side="a"
              witness={witnessA}
              variants={variants}
              mode={mode}
              fontSize={fontSize}
              editMode={editSide === "a"}
              annotateMode={annotateSide === "a"}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelect={onTextSelect("a")}
              onHover={setHoveredId}
              onEditText={(text) => project.updateWitness(witnessA.id, { text })}
              onAnnotate={requestAnnotate(witnessA.id)}
              registerAnchor={registerAnchor}
              advancedMode={advancedMode}
              pick={leftPick}
              onPick={onPick}
              onPickRange={onPickRange}
              lang={langA}
              isDark={isDark}
              search={search}
            />
          </div>
        )}

        {!focusSide && (
          <div ref={gutterRef} className="relative bg-muted/10">
            {braidOpen ? (
              <>
                {!editMode && (
                  <div className="absolute inset-0 transition-opacity duration-150" style={{ opacity: scrolling ? 0 : 1 }}>
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
                )}
                {/* Resize handles on either side + a collapse button. */}
                <div onPointerDown={onBraidResize("left")} onClick={(e) => e.stopPropagation()} title="Drag to resize the braid" className="absolute top-0 left-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30 z-10" />
                <div onPointerDown={onBraidResize("right")} onClick={(e) => e.stopPropagation()} title="Drag to resize the braid" className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30 z-10" />
                <button onClick={(e) => { e.stopPropagation(); toggleBraid(); }} title="Hide the braid" className="absolute top-1 left-1/2 -translate-x-1/2 z-20 p-0.5 rounded bg-card/80 border border-border text-muted-foreground hover:text-foreground">
                  <ChevronsRightLeft className="w-3 h-3" />
                </button>
              </>
            ) : (
              <button onClick={(e) => { e.stopPropagation(); toggleBraid(); }} title="Show the braid" className="absolute inset-0 flex items-center justify-center text-muted-foreground hover:bg-muted/40">
                <ChevronsLeftRight className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {focusSide !== "a" && (
          <div ref={panelBRef} data-sv-scroll="b" onScroll={onPanelScroll("b")} className="border-l border-border min-w-0 bg-card overflow-y-auto min-h-0">
            <WitnessHeader
              witness={witnessB} side="B" panel="b" project={project} which="right" mode={mode}
              annCount={annotationsFor(witnessB.id).length}
              editing={editSide === "b"} onToggleEdit={() => onEditSide(editSide === "b" ? null : "b")}
              annotating={annotateSide === "b"} onToggleAnnotate={() => onAnnotateSide(annotateSide === "b" ? null : "b")}
              focused={focusSide === "b"} onToggleFocus={() => setFocusSide(focusSide === "b" ? null : "b")}
              lang={langB} onLang={onLangB}
            />
            <WitnessPanel
              side="b"
              witness={witnessB}
              variants={variants}
              mode={mode}
              fontSize={fontSize}
              editMode={editSide === "b"}
              annotateMode={annotateSide === "b"}
              selectedId={selectedId}
              hoveredId={hoveredId}
              onSelect={onTextSelect("b")}
              onHover={setHoveredId}
              onEditText={(text) => project.updateWitness(witnessB.id, { text })}
              onAnnotate={requestAnnotate(witnessB.id)}
              registerAnchor={registerAnchor}
              advancedMode={advancedMode}
              pick={rightPick}
              onPick={onPick}
              onPickRange={onPickRange}
              lang={langB}
              isDark={isDark}
              search={search}
            />
          </div>
        )}
      </div>

      {/* Apparatus + annotations live in a modal (View ▸ Critical apparatus, or
          the toolbar) so the two text panels keep the full height. */}
      {showApparatus && (
        <ModalCard title="Critical apparatus & notes" subtitle={`${apparatus.length} ${apparatus.length === 1 ? "entry" : "entries"} — click one to add a note`} onClose={onCloseApparatus}>
          <div className="-mx-4 -mb-4 max-h-[70vh] overflow-y-auto">
            <AnnotationsPanel
              witnessA={witnessA}
              witnessB={witnessB}
              annotationsA={annotationsFor(witnessA.id)}
              annotationsB={annotationsFor(witnessB.id)}
              onRemove={project.removeAnnotation}
              onJump={scrollToLine}
            />
            <ApparatusList
              entries={apparatus}
              mode={mode}
              selectedId={selectedId}
              apparatusEdits={collation.apparatusEdits}
              onEditNote={project.editNote}
              onSelect={onSelect}
              onHover={setHoveredId}
              onUnlink={(vid) => {
                const lid = linkIdOf(vid);
                if (lid) project.removeManualLink(lid);
              }}
            />
          </div>
        </ModalCard>
      )}

      <DeepDivePanel metrics={metrics} open={showDeepDive} onToggle={onToggleDeepDive} witnessA={witnessA} witnessB={witnessB} />

      {pendingAnn && (
        <AnnotationPopover
          line={pendingAnn.line}
          onCancel={() => setPendingAnn(null)}
          onSave={(content) => {
            const ann: LineAnnotation = {
              id: uid(),
              outputId: pendingAnn.witnessId,
              lineNumber: pendingAnn.line,
              lineContent: "",
              type: "observation",
              content,
              createdAt: new Date().toISOString(),
            };
            project.addAnnotation(pendingAnn.witnessId, ann);
            setPendingAnn(null);
          }}
        />
      )}

      {advancedMode && (
        <LinkBar
          mode={mode}
          leftPick={!!leftPick}
          rightPick={!!rightPick}
          onLink={createLink}
          onCancel={clearPicks}
        />
      )}
      </div>
    </div>
  );
}

/** Floating action bar for Advanced-mode hand-linking. */
function LinkBar({
  mode,
  leftPick,
  rightPick,
  onLink,
  onCancel,
}: {
  mode: CollationMode;
  leftPick: boolean;
  rightPick: boolean;
  onLink: (t: VariantType) => void;
  onCancel: () => void;
}) {
  const both = leftPick && rightPick;
  const btn = (t: VariantType, label: string) => (
    <button
      onClick={() => onLink(t)}
      className="inline-flex items-center gap-1 px-2 py-1 rounded border text-[12px] hover:bg-muted"
      style={{ borderColor: VARIANT_TYPE_COLORS[t] }}
    >
      <span className="w-2 h-2 rounded-full" style={{ background: VARIANT_TYPE_COLORS[t] }} />
      {label}
    </button>
  );
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-card border border-border rounded-lg shadow-xl px-3 py-2 flex items-center gap-2">
      {!leftPick && !rightPick ? (
        <span className="text-[12px] text-muted-foreground">Advanced: click a passage, or <strong>drag to select</strong> an exact range, on each side — then choose the link.</span>
      ) : (
        <>
          <span className="text-[12px] text-muted-foreground mr-0.5">
            {both ? "Link as" : leftPick ? "Left only" : "Right only"}:
          </span>
          {both && btn("substitution", "Substitution")}
          {both && btn("transposition", "Transposition")}
          {both && btn("variant", "Variant")}
          {both && btn("match", "Match")}
          {rightPick && !leftPick && btn("addition", "Addition")}
          {leftPick && !rightPick && btn("deletion", mode === "text" ? "Omission" : "Deletion")}
          <button onClick={onCancel} className="ml-1 px-2 py-1 rounded text-[12px] text-muted-foreground hover:bg-muted">Cancel</button>
        </>
      )}
    </div>
  );
}

/** Minimal modal shell for in-view dialogs (the change-overview). */
function ModalCard({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-20" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg w-full max-w-4xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight">{title}</h2>
            {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-muted" title="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function WitnessHeader({
  witness,
  side,
  panel,
  project,
  which,
  mode,
  annCount,
  editing,
  onToggleEdit,
  annotating,
  onToggleAnnotate,
  focused,
  onToggleFocus,
  lang,
  onLang,
}: {
  witness: Witness;
  side: "A" | "B";
  panel: Side;
  project: Project;
  which: "left" | "right";
  mode: CollationMode;
  annCount: number;
  editing: boolean;
  onToggleEdit: () => void;
  annotating: boolean;
  onToggleAnnotate: () => void;
  focused: boolean;
  onToggleFocus: () => void;
  lang?: string;
  onLang: (id: string) => void;
}) {
  const c = project.collation;
  const witnesses = c.witnesses;
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(witness.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    }).catch(() => {});
  };
  return (
    <div className="border-b border-border bg-card/70 backdrop-blur sticky top-0 z-10 px-1.5 py-1 flex items-center gap-1 flex-wrap">
      {/* Single-level: witness selector + per-panel toolbar + side label */}
      <select
        value={witness.id}
        onChange={(e) => (which === "left" ? project.setLeft(e.target.value) : project.setRight(e.target.value))}
        className="text-[10px] bg-transparent border border-border rounded px-1 py-0.5 min-w-[5rem] max-w-[42%] truncate font-medium"
        title={witness.title}
      >
        {witnesses.map((w) => (
          <option key={w.id} value={w.id}>
            {w.title}
          </option>
        ))}
      </select>
      <PanelToolbar
        panel={panel}
        mode={mode}
        editing={editing}
        onToggleEdit={onToggleEdit}
        annotating={annotating}
        onToggleAnnotate={onToggleAnnotate}
        focused={focused}
        onToggleFocus={onToggleFocus}
        lang={lang}
        onLang={onLang}
        copied={copied}
        onCopy={copy}
        project={project}
      />
      {annCount > 0 && <span className="text-[9px] text-muted-foreground" title={`${annCount} annotation(s)`}>✎{annCount}</span>}
      <span className="ml-auto text-[9px] text-muted-foreground uppercase tracking-wide shrink-0" title={which === "left" ? "Base / copy-text" : undefined}>{side}</span>
    </div>
  );
}

/** CCS-WB-style per-panel toolbar so each witness can be worked on individually:
 *  edit · annotate · language · expand · copy · undo/redo. */
function PanelToolbar({
  panel,
  mode,
  editing,
  onToggleEdit,
  annotating,
  onToggleAnnotate,
  focused,
  onToggleFocus,
  lang,
  onLang,
  copied,
  onCopy,
  project,
}: {
  panel: Side;
  mode: CollationMode;
  editing: boolean;
  onToggleEdit: () => void;
  annotating: boolean;
  onToggleAnnotate: () => void;
  focused: boolean;
  onToggleFocus: () => void;
  lang?: string;
  onLang: (id: string) => void;
  copied: boolean;
  onCopy: () => void;
  project: Project;
}) {
  const Tb = ({ on, onClick, title, children }: { on?: boolean; onClick: () => void; title: string; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={"inline-flex items-center justify-center w-6 h-6 rounded transition-colors " + (on ? "bg-primary text-primary-foreground" : "text-foreground/75 hover:bg-muted hover:text-foreground")}
    >
      {children}
    </button>
  );
  const Sep = () => <span className="w-px h-4 bg-border mx-0.5 shrink-0" />;
  return (
    <div className="flex items-center gap-0.5" data-panel={panel}>
      <Tb on={editing} onClick={onToggleEdit} title="Edit this witness text"><Pencil className="w-3 h-3" /></Tb>
      <Tb on={annotating} onClick={onToggleAnnotate} title="Annotate: click a line to add a note"><Highlighter className="w-3 h-3" /></Tb>
      {mode === "source" && (
        <select
          value={lang ?? "none"}
          onChange={(e) => onLang(e.target.value)}
          title="Syntax highlighting for this panel"
          className="h-6 rounded border border-border bg-card hover:bg-muted text-[10px] px-0.5 w-[5.5rem]"
        >
          <option value="none">No highlighting</option>
          <optgroup label="Modern">
            {LANGS.filter((l) => l.group === "modern").map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </optgroup>
          <optgroup label="Historical">
            {LANGS.filter((l) => l.group === "historical").map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </optgroup>
        </select>
      )}
      <Sep />
      <Tb on={copied} onClick={onCopy} title={copied ? "Copied" : "Copy this witness text"}>{copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}</Tb>
      <Tb on={focused} onClick={onToggleFocus} title={focused ? "Restore both panels" : "Expand this panel"}>{focused ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}</Tb>
      <Sep />
      <Tb onClick={project.undo} title="Undo"><Undo2 className="w-3 h-3" /></Tb>
      <Tb onClick={project.redo} title="Redo"><Redo2 className="w-3 h-3" /></Tb>
    </div>
  );
}

function AnnotationPopover({ line, onCancel, onSave }: { line: number; onCancel: () => void; onSave: (content: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div className="bg-card border border-border rounded-lg w-full max-w-sm p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-[12px] font-semibold mb-2">Annotate line {line}</div>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && text.trim()) onSave(text.trim());
            if (e.key === "Escape") onCancel();
          }}
          placeholder="Note… (⌘/Ctrl-Enter to save)"
          className="w-full h-24 bg-background border border-border rounded px-2 py-1.5 text-[12px] resize-y"
        />
        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onCancel} className="px-3 py-1 rounded border border-border text-[12px] hover:bg-muted">Cancel</button>
          <button onClick={() => text.trim() && onSave(text.trim())} disabled={!text.trim()} className="px-3 py-1 rounded bg-primary text-primary-foreground text-[12px] disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}

function AnnotationsPanel({
  witnessA,
  witnessB,
  annotationsA,
  annotationsB,
  onRemove,
  onJump,
}: {
  witnessA: Witness;
  witnessB: Witness;
  annotationsA: LineAnnotation[];
  annotationsB: LineAnnotation[];
  onRemove: (witnessId: string, annId: string) => void;
  onJump: (side: Side, line: number) => void;
}) {
  const total = annotationsA.length + annotationsB.length;
  if (total === 0) return null;
  const row = (w: Witness, side: Side, ann: LineAnnotation) => (
    <div key={ann.id} className="px-4 py-1.5 flex gap-2 items-baseline hover:bg-muted/40 text-[12px]">
      <button onClick={() => onJump(side, ann.lineNumber)} className="shrink-0 font-mono text-[10px] text-primary w-16 text-left hover:underline">
        {w.siglum} l.{ann.lineNumber}
      </button>
      <span className="flex-1">{ann.content}</span>
      <button onClick={() => onRemove(w.id, ann.id)} className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground" title="Delete annotation">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
  return (
    <div className="border-t border-border">
      <div className="px-4 py-2 text-[12px] font-semibold text-foreground/80 bg-muted/30 border-b border-border">
        Annotations · {total}
      </div>
      <div className="divide-y divide-border/60">
        {annotationsA.map((ann) => row(witnessA, "a", ann))}
        {annotationsB.map((ann) => row(witnessB, "b", ann))}
      </div>
    </div>
  );
}

function ApparatusList({
  entries,
  mode,
  selectedId,
  apparatusEdits,
  onEditNote,
  onSelect,
  onHover,
  onUnlink,
}: {
  entries: Variant[];
  mode: CollationMode;
  selectedId: string | null;
  apparatusEdits: Record<string, ApparatusEdit>;
  onEditNote: (variantId: string, note: string) => void;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onUnlink: (variantId: string) => void;
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
  const noted = entries.filter((v) => apparatusEdits[v.id]?.note?.trim()).length;
  return (
    <div className="border-t border-border">
      <div className="px-4 py-2 text-[12px] font-semibold text-foreground/80 bg-muted/30 border-b border-border flex items-center gap-2 sticky top-0 z-10">
        <span>Critical apparatus · {entries.length} {entries.length === 1 ? "entry" : "entries"}</span>
        {noted > 0 && <span className="text-[10px] font-normal text-muted-foreground">· {noted} noted</span>}
        <span className="ml-auto text-[10px] font-normal text-muted-foreground">click an entry to add a note</span>
      </div>
      <div className="divide-y divide-border/60">
        {entries.length === 0 && <div className="px-4 py-3 text-[12px] text-muted-foreground">No variants — the witnesses are identical.</div>}
        {entries.map((v) => {
          const selected = v.id === selectedId;
          const note = apparatusEdits[v.id]?.note ?? "";
          return (
            <div key={v.id} onMouseEnter={() => onHover(v.id)} onMouseLeave={() => onHover(null)} style={{ background: selected ? "color-mix(in srgb, var(--sv-sel) 12%, transparent)" : undefined }}>
              <div className="group w-full px-4 py-2 hover:bg-muted/40 flex gap-3 items-baseline">
                <button onClick={() => onSelect(selected ? null : v.id)} className="flex gap-3 items-baseline flex-1 text-left min-w-0">
                  <span className="shrink-0 w-2 h-2 rounded-full mt-1.5" style={{ background: VARIANT_TYPE_COLORS[v.type] }} title={variantLabel(v.type, mode)} />
                  <span className="shrink-0 text-[11px] text-muted-foreground font-mono w-20">{locus(v) || variantLabel(v.type, mode)}</span>
                  <span className="text-[12.5px] leading-snug flex-1 min-w-0">
                    {v.textA.trim() && <span>{lead(v.textA)}</span>}
                    {v.textA.trim() && v.textB.trim() && <span className="text-muted-foreground mx-1.5">]</span>}
                    {v.textB.trim() && <span className="text-foreground/70">{lead(v.textB)}</span>}
                  </span>
                </button>
                {v.manual && <span className="shrink-0 text-[9px] uppercase tracking-wide text-primary border border-primary/40 rounded px-1" title="Editor-made link">hand</span>}
                {note.trim() && !selected && <span className="shrink-0 text-[10px] text-muted-foreground italic max-w-[24%] truncate">“{note.trim()}”</span>}
                {v.manual && (
                  <button onClick={() => onUnlink(v.id)} className="shrink-0 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground" title="Unlink (remove this hand-made link)">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              {selected && (
                <div className="px-4 pb-3 pl-[4.5rem]">
                  <NoteEditor value={note} onChange={(val) => onEditNote(v.id, val)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Apparatus note box. Focuses on mount WITHOUT scrolling, so selecting a
 *  variant from the text never whisks the page down to the apparatus. */
function NoteEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Editor's note for this locus…"
      className="w-full bg-background border border-border rounded px-2 py-1.5 text-[12px] resize-y min-h-[3rem]"
    />
  );
}

function DeepDivePanel({
  metrics,
  open,
  onToggle,
  witnessA,
  witnessB,
}: {
  metrics: CollationMetrics;
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
  if (!open) return null;
  return (
    <ModalCard title="Deep dive" subtitle="Quantitative summary of the collation" onClose={onToggle}>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))" }}>
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
        {stat("Lengths (A→B)", `${witnessA.text.length} → ${witnessB.text.length} ch`)}
      </div>
    </ModalCard>
  );
}
