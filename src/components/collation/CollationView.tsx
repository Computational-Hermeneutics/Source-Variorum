"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X, Pencil, Maximize2, Minimize2, Copy, Check, Undo2, Redo2, ChevronsLeftRight, ChevronsRightLeft, Lock, LockOpen, Crosshair, Diff as DiffIcon, ArrowLeftRight, Spline, Download } from "lucide-react";
import { diffLines, createTwoFilesPatch } from "diff";
import type { ApparatusEntry, CollationMetrics, CollationMode, Variant, VariantType, Witness } from "@/types/collation";
import type { LineAnnotation } from "@/types/annotations";
import { VARIANT_TYPE_COLORS, variantLabel } from "@/types/collation";
import { LANGS, highlightRanges, tokenStyle } from "@/lib/highlight";
import { linkIdOf } from "@/lib/collate/manual";
import type { useProject } from "@/hooks/useProject";
import type { deriveView } from "@/lib/export/collation-export";
import { WitnessPanel } from "./WitnessPanel";
import { BraidGutter, type Ribbon } from "./BraidGutter";
import { Histogram } from "./Histogram";
import { OverviewStrip } from "./OverviewStrip";
import { HotspotBar } from "./HotspotBar";
import { MarkdownPad } from "./MarkdownPad";
import type { Hotspots } from "@/lib/collate/hotspots";
import type { EddyRow } from "@/lib/collate/eddy";

type Side = "a" | "b";
type LockMode = "one" | "user" | "off";
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
  search?: string;
  isDark: boolean;
}) {
  const editMode = editSide !== null;
  const { collation } = project;
  const { a: witnessA, b: witnessB, variants, metrics } = view;
  const mode = collation.mode;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pendingAnn, setPendingAnn] = useState<{ witnessId: string; line: number; editId?: string; initial?: string } | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [apparatusTab, setApparatusTab] = useState<"notebook" | "apparatus">("apparatus");
  // Braid-analysis = the ribbons + the variant tints. Toggle off for plain reading.
  const [showAnalysis, setShowAnalysis] = useState(true);
  useEffect(() => { try { if (localStorage.getItem("source-variorum-analysis") === "0") setShowAnalysis(false); } catch { /* ignore */ } }, []);
  const toggleAnalysis = () => setShowAnalysis((v) => { const n = !v; try { localStorage.setItem("source-variorum-analysis", n ? "1" : "0"); } catch { /* ignore */ } return n; });
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
  // Each panel scrolls in its own container.
  const panelARef = useRef<HTMLDivElement>(null);
  const panelBRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const gutterRef = useRef<HTMLDivElement>(null);

  // Scroll lock has three modes:
  //   "one"  — both panels pinned to the same scrollTop (both start at line 1)
  //   "user" — locked at an offset the reader chose (unlock, align by hand, lock)
  //   "off"  — independent scrolling
  const [lockMode, setLockMode] = useState<LockMode>("one");
  const userOffsetRef = useRef(0); // B.scrollTop − A.scrollTop, captured for "user"
  useEffect(() => { try { const m = localStorage.getItem("source-variorum-lock-mode"); if (m === "one" || m === "off") setLockMode(m); } catch { /* ignore */ } }, []);
  const setLock = (mode: LockMode) => {
    const a = panelARef.current, b = panelBRef.current;
    if (mode === "user") userOffsetRef.current = a && b ? b.scrollTop - a.scrollTop : 0; // capture the current hand-set alignment
    if (mode === "one" && a && b) { syncingRef.current = true; b.scrollTop = a.scrollTop; requestAnimationFrame(() => { syncingRef.current = false; }); }
    try { localStorage.setItem("source-variorum-lock-mode", mode === "user" ? "off" : mode); } catch { /* ignore */ }
    setLockMode(mode);
  };

  const syncCounterpart = useCallback((from: Side) => {
    const a = panelARef.current, b = panelBRef.current;
    if (!a || !b) return;
    const offset = lockMode === "user" ? userOffsetRef.current : 0;
    syncingRef.current = true;
    if (from === "a") b.scrollTop = Math.max(0, a.scrollTop + offset);
    else a.scrollTop = Math.max(0, b.scrollTop - offset);
    requestAnimationFrame(() => { syncingRef.current = false; });
  }, [lockMode]);

  const onPanelScroll = useCallback((from: Side) => () => {
    if (lockMode !== "off" && !syncingRef.current) syncCounterpart(from);
  }, [lockMode, syncCounterpart]);

  const registerAnchor = useCallback((id: string, side: Side, el: HTMLElement | null) => {
    const key = `${id}:${side}`;
    if (el) anchorsRef.current.set(key, el);
    else anchorsRef.current.delete(key);
  }, []);

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

  // A click in the text body highlights the locus and scrolls the other panel so
  // the linked passage lines up with the clicked one (a navigation peek; the sync
  // is suppressed so the clicked panel itself stays put). Available in every lock
  // mode — the reader can then hit "Lock here" to keep that alignment.
  const onTextSelect = useCallback(
    (side: Side) => (id: string | null) => {
      setSelectedId(id);
      if (!id) return;
      const other: Side = side === "a" ? "b" : "a";
      const se = anchorsRef.current.get(`${id}:${side}`);
      const de = anchorsRef.current.get(`${id}:${other}`);
      const src = side === "a" ? panelARef.current : panelBRef.current;
      const dst = other === "a" ? panelARef.current : panelBRef.current;
      if (se && de && src && dst) {
        const srcViewOffset = se.getBoundingClientRect().top - src.getBoundingClientRect().top;
        const dstAbs = de.getBoundingClientRect().top - dst.getBoundingClientRect().top + dst.scrollTop;
        syncingRef.current = true;
        dst.scrollTop = Math.max(0, dstAbs - srcViewOffset);
        requestAnimationFrame(() => { syncingRef.current = false; });
      }
    },
    []
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

  const requestAnnotate = (witnessId: string) => (line: number) => {
    const existing = annotationsFor(witnessId).find((a) => a.lineNumber === line);
    setPendingAnn({ witnessId, line, editId: existing?.id, initial: existing?.content });
  };
  const annLinesA = useMemo(() => new Set(annotationsFor(witnessA.id).map((a) => a.lineNumber)), [collation.annotations, witnessA.id]);
  const annLinesB = useMemo(() => new Set(annotationsFor(witnessB.id).map((a) => a.lineNumber)), [collation.annotations, witnessB.id]);

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
              analysis={showAnalysis}
              annotatedLines={annLinesA}
              onOpenAnnotation={requestAnnotate(witnessA.id)}
            />
          </div>
        )}

        {!focusSide && (
          <div ref={gutterRef} className="relative bg-muted/10">
            {braidOpen && !editMode && showAnalysis && (
              <div className="absolute inset-0">
                <BraidLayer
                  variants={variants}
                  anchorsRef={anchorsRef}
                  panelARef={panelARef}
                  panelBRef={panelBRef}
                  wrapperRef={wrapperRef}
                  gutterRef={gutterRef}
                  visibleTypes={visibleTypes}
                  selectedId={selectedId}
                  hoveredId={hoveredId}
                  maxLength={maxLength}
                  onSelect={onSelect}
                  onHover={setHoveredId}
                  fontSize={fontSize}
                />
              </div>
            )}
            {braidOpen && (
              <>
                <div onPointerDown={onBraidResize("left")} onClick={(e) => e.stopPropagation()} title="Drag to resize the braid" className="absolute top-0 left-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30 z-10" />
                <div onPointerDown={onBraidResize("right")} onClick={(e) => e.stopPropagation()} title="Drag to resize the braid" className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/30 z-10" />
              </>
            )}
            {!braidOpen && (
              <button onClick={(e) => { e.stopPropagation(); toggleBraid(); }} title="Show the braid" className="absolute inset-0 hover:bg-muted/40" aria-label="Show the braid" />
            )}
            {/* Always visible: collapse/expand + the three-way scroll lock. */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5">
              <button onClick={(e) => { e.stopPropagation(); toggleBraid(); }} title={braidOpen ? "Hide the braid" : "Show the braid"} className="p-0.5 rounded bg-card/90 border border-border text-muted-foreground hover:text-foreground shadow-sm">
                {braidOpen ? <ChevronsRightLeft className="w-3 h-3" /> : <ChevronsLeftRight className="w-3 h-3" />}
              </button>
              <div className="flex flex-col items-stretch rounded border border-border overflow-hidden bg-card/90 shadow-sm">
                {([
                  ["one", <Lock className="w-3 h-3" key="l" />, "Lock 1:1 — both panels start at line 1"],
                  ["user", <Crosshair className="w-3 h-3" key="c" />, "Lock here — keep the panels at their current alignment"],
                  ["off", <LockOpen className="w-3 h-3" key="o" />, "Unlock — scroll the panels independently"],
                ] as [LockMode, React.ReactNode, string][]).map(([mode, icon, title]) => (
                  <button
                    key={mode}
                    onClick={(e) => { e.stopPropagation(); setLock(mode); }}
                    title={title}
                    className={"p-0.5 flex items-center justify-center transition-colors " + (lockMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                  >
                    {icon}
                  </button>
                ))}
              </div>
              <button onClick={(e) => { e.stopPropagation(); project.swapSides(); }} title="Swap the two panels (A ⇄ B)" className="p-0.5 rounded bg-card/90 border border-border text-muted-foreground hover:text-foreground shadow-sm">
                <ArrowLeftRight className="w-3 h-3" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); toggleAnalysis(); }} title={showAnalysis ? "Hide braid analysis (ribbons + variant tints) for plain reading" : "Show braid analysis (ribbons + variant tints)"} className={"p-0.5 rounded bg-card/90 border hover:bg-muted shadow-sm " + (showAnalysis ? "border-primary/50 text-primary" : "border-border text-muted-foreground")}>
                <Spline className="w-3 h-3" />
              </button>
              <button onClick={(e) => { e.stopPropagation(); setShowDiff(true); }} title="Standard diff — unified +/− line view of the two witnesses" className="p-0.5 rounded bg-card/90 border border-border text-muted-foreground hover:text-foreground shadow-sm">
                <DiffIcon className="w-3 h-3" />
              </button>
            </div>
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
              analysis={showAnalysis}
              annotatedLines={annLinesB}
              onOpenAnnotation={requestAnnotate(witnessB.id)}
            />
          </div>
        )}
      </div>

      {/* Apparatus + annotations live in a modal (View ▸ Critical apparatus, or
          the toolbar) so the two text panels keep the full height. */}
      {showApparatus && (
        <ModalCard title="Annotations" subtitle={`${apparatus.length} apparatus ${apparatus.length === 1 ? "entry" : "entries"} · line notes · Markdown notebook`} onClose={onCloseApparatus}>
          <div className="flex rounded border border-border overflow-hidden text-[11px] w-max mb-3">
            <button onClick={() => setApparatusTab("apparatus")} className={"px-2.5 py-1 " + (apparatusTab === "apparatus" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>Apparatus ({apparatus.length})</button>
            <button onClick={() => setApparatusTab("notebook")} className={"px-2.5 py-1 " + (apparatusTab === "notebook" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>Notebook</button>
          </div>
          {apparatusTab === "notebook" ? (
            <MarkdownPad
              value={collation.notes ?? ""}
              onChange={project.setNotes}
              autoFocus
              placeholder={"# Notes on this collation\n\nFree-form Markdown — observations, editorial rationale, questions. Saved with the project (.svar) and toggled to rich text with the button above."}
            />
          ) : (
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
          )}
        </ModalCard>
      )}

      {showDiff && <DiffModal witnessA={witnessA} witnessB={witnessB} mode={mode} lang={langA} isDark={isDark} onClose={() => setShowDiff(false)} />}

      <DeepDivePanel metrics={metrics} open={showDeepDive} onToggle={onToggleDeepDive} witnessA={witnessA} witnessB={witnessB} />

      {pendingAnn && (
        <AnnotationPopover
          line={pendingAnn.line}
          initial={pendingAnn.initial}
          canDelete={!!pendingAnn.editId}
          onCancel={() => setPendingAnn(null)}
          onDelete={() => { if (pendingAnn.editId) project.removeAnnotation(pendingAnn.witnessId, pendingAnn.editId); setPendingAnn(null); }}
          onSave={(content) => {
            // Editing replaces the existing note on this line.
            if (pendingAnn.editId) project.removeAnnotation(pendingAnn.witnessId, pendingAnn.editId);
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

type DiffRow = { kind: "add" | "del" | "ctx" | "skip"; aNo?: number; bNo?: number; text: string };

/** Per-line syntax highlight for the diff (offset 0; one line at a time). */
function hlLine(text: string, lang: string | undefined, isDark: boolean): React.ReactNode {
  if (!lang || lang === "none" || !text) return text || "​";
  const tokens = highlightRanges(text, lang);
  if (!tokens.length) return text;
  const out: React.ReactNode[] = [];
  let cursor = 0, key = 0;
  for (const tk of tokens) {
    if (tk.from >= text.length) break;
    const s = Math.max(0, tk.from), e = Math.min(text.length, tk.to);
    if (s > cursor) out.push(text.slice(cursor, s));
    if (e > s) { const st = tokenStyle(tk.tag, isDark); out.push(st ? <span key={key++} style={st}>{text.slice(s, e)}</span> : text.slice(s, e)); cursor = e; }
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return out.length ? out : text;
}

/** Standard unified diff (git-style) of the two witnesses: +/− lines with line
 *  numbers, long unchanged runs collapsed to context. A familiar second reading
 *  of the same comparison the braid shows. */
function DiffModal({ witnessA, witnessB, mode, lang, isDark, onClose }: { witnessA: Witness; witnessB: Witness; mode: CollationMode; lang?: string; isDark: boolean; onClose: () => void }) {
  const rows = useMemo<DiffRow[]>(() => {
    const parts = diffLines(witnessA.text, witnessB.text);
    const out: DiffRow[] = [];
    const CTX = 3; // lines of context kept around each change
    let aNo = 1, bNo = 1;
    parts.forEach((p, i) => {
      const lines = p.value.replace(/\n$/, "").split("\n");
      if (p.added) { for (const t of lines) out.push({ kind: "add", bNo: bNo++, text: t }); }
      else if (p.removed) { for (const t of lines) out.push({ kind: "del", aNo: aNo++, text: t }); }
      else {
        const first = i === 0, last = i === parts.length - 1;
        lines.forEach((t, j) => {
          const nearChange = (!first && j < CTX) || (!last && j >= lines.length - CTX);
          if (lines.length <= CTX * 2 + 1 || nearChange) out.push({ kind: "ctx", aNo: aNo, bNo: bNo, text: t });
          else if (j === CTX) out.push({ kind: "skip", text: `⋯ ${lines.length - CTX * 2} unchanged lines ⋯` });
          aNo++; bNo++;
        });
      }
    });
    return out;
  }, [witnessA.text, witnessB.text]);

  const adds = rows.filter((r) => r.kind === "add").length;
  const dels = rows.filter((r) => r.kind === "del").length;
  const mono = mode === "source";
  const patch = useMemo(() => createTwoFilesPatch(witnessA.siglum || "A", witnessB.siglum || "B", witnessA.text, witnessB.text, witnessA.title, witnessB.title), [witnessA, witnessB]);
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(patch).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); }).catch(() => {}); };
  const dl = () => {
    const blob = new Blob([patch], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${(witnessA.siglum || "A")}-${(witnessB.siglum || "B")}.diff`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <ModalCard title="Standard diff" subtitle={`${witnessA.siglum} → ${witnessB.siglum} · ${dels} removed, ${adds} added`} onClose={onClose}>
      <div className="flex items-center gap-1.5 mb-2 -mt-1">
        <button onClick={copy} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[11px] hover:bg-muted">{copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {copied ? "Copied" : "Copy diff"}</button>
        <button onClick={dl} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-[11px] hover:bg-muted"><Download className="w-3 h-3" /> Download .diff</button>
      </div>
      <div className="-mx-4 -mb-4 max-h-[68vh] overflow-auto">
        <table className="w-full border-collapse" style={{ fontFamily: mono ? "var(--code-font-family)" : "inherit", fontSize: "11.5px" }}>
          <tbody>
            {rows.map((r, i) => {
              if (r.kind === "skip") return (
                <tr key={i}><td colSpan={3} className="px-3 py-1 text-center text-[10px] text-muted-foreground bg-muted/40 select-none">{r.text}</td></tr>
              );
              const bg = r.kind === "add" ? "bg-[#3f7d5b]/12" : r.kind === "del" ? "bg-[#9c3b3b]/12" : "";
              const sign = r.kind === "add" ? "+" : r.kind === "del" ? "−" : " ";
              const signColor = r.kind === "add" ? "text-[#3f7d5b]" : r.kind === "del" ? "text-[#9c3b3b]" : "text-muted-foreground/40";
              return (
                <tr key={i} className={bg}>
                  <td className="w-9 px-1 text-right tabular-nums text-[9px] text-muted-foreground/50 select-none align-top">{r.aNo ?? ""}</td>
                  <td className="w-9 px-1 text-right tabular-nums text-[9px] text-muted-foreground/50 select-none align-top border-r border-border">{r.bNo ?? ""}</td>
                  <td className="px-2 align-top whitespace-pre-wrap break-words"><span className={"select-none mr-1.5 " + signColor}>{sign}</span>{mono ? hlLine(r.text, lang, isDark) : (r.text || "​")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ModalCard>
  );
}

/** The braid ribbons, isolated into their own component so scroll-driven ribbon
 *  updates re-render only this layer — never the (potentially thousands of rows)
 *  text panels. Reads anchor positions once per layout into an offset cache, then
 *  recomputes ribbon endpoints cheaply (pure arithmetic) on every scroll frame. */
function BraidLayer({
  variants,
  anchorsRef,
  panelARef,
  panelBRef,
  wrapperRef,
  gutterRef,
  visibleTypes,
  selectedId,
  hoveredId,
  maxLength,
  onSelect,
  onHover,
  fontSize,
}: {
  variants: Variant[];
  anchorsRef: React.RefObject<Map<string, HTMLElement>>;
  panelARef: React.RefObject<HTMLDivElement | null>;
  panelBRef: React.RefObject<HTMLDivElement | null>;
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  gutterRef: React.RefObject<HTMLDivElement | null>;
  visibleTypes: Set<VariantType>;
  selectedId: string | null;
  hoveredId: string | null;
  maxLength: number;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  fontSize: number;
}) {
  const [ribbons, setRibbons] = useState<Ribbon[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const offs = useRef<{ a: Map<string, number>; b: Map<string, number> }>({ a: new Map(), b: new Map() });
  const raf = useRef<number | null>(null);

  const build = useCallback(() => {
    const pa = panelARef.current, pb = panelBRef.current, anchors = anchorsRef.current;
    const a = new Map<string, number>(), b = new Map<string, number>();
    if (pa && anchors) { const base = pa.getBoundingClientRect().top - pa.scrollTop; for (const [k, el] of anchors) if (k.endsWith(":a")) a.set(k.slice(0, -2), el.getBoundingClientRect().top - base); }
    if (pb && anchors) { const base = pb.getBoundingClientRect().top - pb.scrollTop; for (const [k, el] of anchors) if (k.endsWith(":b")) b.set(k.slice(0, -2), el.getBoundingClientRect().top - base); }
    offs.current = { a, b };
  }, [anchorsRef, panelARef, panelBRef]);

  const compute = useCallback(() => {
    const wrapper = wrapperRef.current, gutter = gutterRef.current, pa = panelARef.current, pb = panelBRef.current;
    if (!wrapper || !gutter || !pa || !pb) return;
    const H = wrapper.clientHeight, aS = pa.scrollTop, bS = pb.scrollTop;
    const oa = offs.current.a, ob = offs.current.b;
    const next: Ribbon[] = [];
    for (const v of variants) {
      const ca = oa.get(v.id), cb = ob.get(v.id);
      if (ca == null || cb == null) continue;
      const yA = ca - aS, yB = cb - bS;
      // Draw a ribbon when at least one end is on-screen, so a diagonal still
      // leaves the viewport toward an off-screen counterpart (the braid's point).
      const visA = yA >= -24 && yA <= H + 24, visB = yB >= -24 && yB <= H + 24;
      if (!visA && !visB) continue;
      next.push({ id: v.id, type: v.type, yA, yB, length: v.length });
    }
    setRibbons(next);
    setSize({ width: gutter.clientWidth, height: H });
  }, [variants, wrapperRef, gutterRef, panelARef, panelBRef]);

  // Rebuild the offset cache + recompute on layout-affecting changes.
  useLayoutEffect(() => {
    const refresh = () => { build(); compute(); };
    refresh();
    const wrapper = wrapperRef.current;
    const ro = new ResizeObserver(refresh);
    if (wrapper) ro.observe(wrapper);
    const t = setTimeout(refresh, 250);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, [build, compute, fontSize, variants, wrapperRef]);

  // Recompute (cheap, no rebuild) on scroll — rAF-throttled, this layer only.
  useEffect(() => {
    const pa = panelARef.current, pb = panelBRef.current;
    const onScroll = () => { if (raf.current == null) raf.current = requestAnimationFrame(() => { raf.current = null; compute(); }); };
    pa?.addEventListener("scroll", onScroll, { passive: true });
    pb?.addEventListener("scroll", onScroll, { passive: true });
    return () => { pa?.removeEventListener("scroll", onScroll); pb?.removeEventListener("scroll", onScroll); };
  }, [compute, panelARef, panelBRef]);

  return (
    <BraidGutter
      width={size.width}
      height={size.height}
      ribbons={ribbons}
      maxLength={maxLength}
      selectedId={selectedId}
      hoveredId={hoveredId}
      visibleTypes={visibleTypes}
      onSelect={onSelect}
      onHover={onHover}
    />
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
        className="text-[10px] bg-transparent border border-border rounded px-1 py-0.5 min-w-[5rem] max-w-[42%] truncate"
        title={witness.title}
      >
        {witnesses.filter((w) => !w.reference || w.id === witness.id).map((w) => (
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

function AnnotationPopover({ line, initial, canDelete, onCancel, onSave, onDelete }: { line: number; initial?: string; canDelete?: boolean; onCancel: () => void; onSave: (content: string) => void; onDelete?: () => void }) {
  const [text, setText] = useState(initial ?? "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onCancel}>
      <div className="bg-card border border-border rounded-lg w-full max-w-sm p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-[12px] font-semibold mb-2">{canDelete ? "Edit note" : "Annotate"} · line {line}</div>
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
          {canDelete && <button onClick={onDelete} className="mr-auto px-3 py-1 rounded border border-border text-[12px] text-destructive hover:bg-muted">Delete</button>}
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
