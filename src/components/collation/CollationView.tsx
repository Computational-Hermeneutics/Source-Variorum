"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X, Pencil, Highlighter, Maximize2, Minimize2, Copy, Check, Undo2, Redo2 } from "lucide-react";
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

  const anchorsRef = useRef<Map<string, HTMLElement>>(new Map());
  const wrapperRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [ribbons, setRibbons] = useState<Ribbon[]>([]);
  const [gutterSize, setGutterSize] = useState({ width: 0, height: 0 });

  const registerAnchor = useCallback((id: string, side: Side, el: HTMLElement | null) => {
    const key = `${id}:${side}`;
    if (el) anchorsRef.current.set(key, el);
    else anchorsRef.current.delete(key);
  }, []);

  const measure = useCallback(() => {
    const wrapper = wrapperRef.current;
    const gutter = gutterRef.current;
    if (!wrapper || !gutter) return;
    const wRect = wrapper.getBoundingClientRect();
    const next: Ribbon[] = [];
    for (const v of variants) {
      const elA = anchorsRef.current.get(`${v.id}:a`);
      const elB = anchorsRef.current.get(`${v.id}:b`);
      if (!elA || !elB) continue;
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
    if (editMode) return; // braid is hidden while editing text
    measure();
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(wrapper);
    const t = setTimeout(measure, 250);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [measure, editMode, fontSize]);

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
    <div className="flex flex-col">
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
      <div ref={wrapperRef} onClick={() => (advancedMode ? clearPicks() : onSelect(null))} className="relative grid" style={{ gridTemplateColumns: focusSide ? "1fr" : "1fr 120px 1fr" }}>
        {focusSide !== "b" && (
          <div className="border-r border-border min-w-0 bg-card">
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
              onSelect={onSelect}
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
            />
          </div>
        )}

        {!focusSide && (
          <div ref={gutterRef} className="relative bg-muted/10">
            {!editMode && (
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
            )}
          </div>
        )}

        {focusSide !== "a" && (
          <div className="border-l border-border min-w-0 bg-card">
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
              onSelect={onSelect}
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
            />
          </div>
        )}
      </div>

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
    <div className="border-b border-border bg-card/60 sticky top-[37px] z-10">
      {/* Row 1: witness selector + badges */}
      <div className="px-3 pt-2 pb-1.5 flex items-center gap-2">
        <select
          value={witness.id}
          onChange={(e) => (which === "left" ? project.setLeft(e.target.value) : project.setRight(e.target.value))}
          className="text-[12px] bg-transparent border border-border rounded px-1.5 py-0.5 max-w-[60%] truncate font-medium"
          title={witness.title}
        >
          {witnesses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.title}
            </option>
          ))}
        </select>
        {which === "left" && <span className="text-[9px] uppercase tracking-wide text-muted-foreground border border-border px-1 rounded" title="The left witness is the base / copy-text: apparatus lemmas are drawn from it">base</span>}
        {annCount > 0 && <span className="text-[10px] text-muted-foreground" title={`${annCount} annotation(s)`}>✎ {annCount}</span>}
        {witness.date && <span className="text-[11px] text-muted-foreground truncate hidden md:inline">{witness.date}</span>}
        <span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wide shrink-0">{side}</span>
      </div>
      {/* Row 2: per-panel toolbar */}
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
      className={"inline-flex items-center justify-center w-7 h-7 rounded border text-[11px] transition-colors " + (on ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card hover:bg-muted")}
    >
      {children}
    </button>
  );
  return (
    <div className="px-3 pb-1.5 flex items-center gap-1.5" data-panel={panel}>
      <Tb on={editing} onClick={onToggleEdit} title="Edit this witness text"><Pencil className="w-3.5 h-3.5" /></Tb>
      <Tb on={annotating} onClick={onToggleAnnotate} title="Annotate: click a line to add a note"><Highlighter className="w-3.5 h-3.5" /></Tb>
      {mode === "source" && (
        <select
          value={lang ?? "none"}
          onChange={(e) => onLang(e.target.value)}
          title="Syntax highlighting for this panel"
          className="h-7 rounded border border-border bg-card hover:bg-muted text-[11px] px-1 max-w-[8.5rem]"
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
      <span className="flex-1" />
      <Tb on={copied} onClick={onCopy} title={copied ? "Copied" : "Copy this witness text"}>{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}</Tb>
      <Tb on={focused} onClick={onToggleFocus} title={focused ? "Restore both panels" : "Expand this panel"}>{focused ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}</Tb>
      <Tb onClick={project.undo} title="Undo"><Undo2 className="w-3.5 h-3.5" /></Tb>
      <Tb onClick={project.redo} title="Redo"><Redo2 className="w-3.5 h-3.5" /></Tb>
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
      <div className="divide-y divide-border/60 max-h-[28vh] overflow-y-auto">
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
      <div className="px-4 py-2 text-[12px] font-semibold text-foreground/80 bg-muted/30 border-b border-border flex items-center gap-2">
        <span>Critical apparatus · {entries.length} {entries.length === 1 ? "entry" : "entries"}</span>
        {noted > 0 && <span className="text-[10px] font-normal text-muted-foreground">· {noted} noted</span>}
        <span className="ml-auto text-[10px] font-normal text-muted-foreground">click an entry to add a note</span>
      </div>
      <div className="divide-y divide-border/60 max-h-[40vh] overflow-y-auto">
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
  return (
    <div className="border-t border-border">
      <button onClick={onToggle} className="w-full px-4 py-2 text-left text-[12px] font-semibold text-foreground/80 bg-muted/30 hover:bg-muted/50 flex items-center gap-2">
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
          {stat("Lengths (A→B)", `${witnessA.text.length} → ${witnessB.text.length} ch`)}
        </div>
      )}
    </div>
  );
}
