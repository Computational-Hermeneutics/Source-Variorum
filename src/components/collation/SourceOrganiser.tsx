"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FilePlus, Upload, FolderPlus, Folder, File, BookOpen, ChevronRight, ChevronDown,
  MoreVertical, Pencil, Trash2, RotateCcw, X, Check, Copy, Info, FileText,
} from "lucide-react";
import { createPortal } from "react-dom";
import { MarkdownPad } from "./MarkdownPad";

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `w${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  }
}
import type { Witness } from "@/types/collation";
import { isComparable, WITNESS_FOLDER } from "@/types/collation";
import { LANGS } from "@/lib/highlight";
import type { Demo } from "@/data/demos";
import type { useProject } from "@/hooks/useProject";
import { looksLikeXml, teiToPlainText } from "@/lib/import/tei";

type Project = ReturnType<typeof useProject>;
const COLLAPSE_KEY = "source-variorum-collapsed-folders";
const FZ_KEY = "source-variorum-sidebar-fontsize";
const SIDEBAR_W_KEY = "source-variorum-sidebar-width";

export function SourceOrganiser({
  project,
  demos,
  onLoadDemo,
  onAddSource,
  onImport,
  hidden,
  onHidden,
}: {
  project: Project;
  demos: Demo[];
  onLoadDemo: (id: string) => void;
  onAddSource: () => void;
  onImport: (sources: { siglum: string; title: string; text: string }[]) => void;
  hidden: boolean;
  onHidden: (v: boolean) => void;
}) {
  const c = project.collation;
  const trash = c.trash ?? [];
  const importRef = useRef<HTMLInputElement>(null);
  const [samplesOpen, setSamplesOpen] = useState(false);

  // Tiny by default; the toolbar A−/A+ nudges it. Persisted.
  const [fz, setFz] = useState(11);
  const stepFz = (d: number) =>
    setFz((s) => {
      const next = Math.min(16, Math.max(9, s + d));
      try {
        localStorage.setItem(FZ_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  // Folders default to CLOSED (we track which the user expanded), except the
  // Witnesses working set, which starts open.
  const [expanded, setExpanded] = useState<Set<string>>(new Set([WITNESS_FOLDER]));
  const [width, setWidth] = useState(240);
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [folderDraft, setFolderDraft] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) setExpanded(new Set(JSON.parse(raw)));
      const f = localStorage.getItem(FZ_KEY);
      if (f) setFz(Math.min(16, Math.max(9, parseInt(f, 10) || 11)));
      const w = localStorage.getItem(SIDEBAR_W_KEY);
      if (w) setWidth(Math.min(480, Math.max(170, parseInt(w, 10) || 240)));
    } catch {
      /* ignore */
    }
  }, []);

  // Drag the right edge to resize; persist the final width.
  const onResizeDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => setWidth(Math.min(480, Math.max(170, startW + (ev.clientX - startX))));
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try { localStorage.setItem(SIDEBAR_W_KEY, String(Math.min(480, Math.max(170, startW + (ev.clientX - startX))))); } catch { /* ignore */ }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startRenameFolder = (f: string) => { setEditingFolder(f); setFolderDraft(f); };
  const commitRenameFolder = () => {
    if (editingFolder && folderDraft.trim() && folderDraft.trim() !== editingFolder) project.renameFolder(editingFolder, folderDraft.trim());
    setEditingFolder(null);
  };
  const toggleCollapse = (f: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });

  const folders = useMemo(() => {
    const ordered = [...(c.folders ?? [])];
    for (const w of c.witnesses) if (w.folder && !ordered.includes(w.folder)) ordered.push(w.folder);
    return ordered;
  }, [c.folders, c.witnesses]);

  const root = c.witnesses.filter((w) => !w.folder);
  const inFolder = (f: string) => c.witnesses.filter((w) => w.folder === f);

  const onImportFiles = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (!files.length) return;
      const sources = await Promise.all(
        files.map(async (f) => {
          const raw = await f.text();
          const text = looksLikeXml(raw, f.name) ? teiToPlainText(raw) : raw;
          return { siglum: siglumOf(f.name), title: f.name, text };
        })
      );
      onImport(sources);
    },
    [onImport]
  );

  const newFolder = () => {
    // Create an "Untitled folder" straight away and drop into rename, no modal.
    const existing = new Set(c.folders ?? []);
    let name = "Untitled folder";
    let i = 2;
    while (existing.has(name)) name = `Untitled folder ${i++}`;
    project.createFolder(name);
    startRenameFolder(name);
  };

  if (hidden) {
    return (
      <aside className="w-7 shrink-0 border-r border-border bg-muted/20 flex flex-col items-center pt-2">
        <button onClick={() => onHidden(false)} title="Show sources" className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
          <ChevronRight className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="shrink-0 border-r border-border bg-muted/20 flex flex-col relative" style={{ width: `${width}px` }}>
      {/* Drag handle (right edge) to resize. */}
      <div
        onPointerDown={onResizeDown}
        title="Drag to resize"
        className="absolute top-0 right-0 h-full w-1.5 -mr-0.5 cursor-col-resize hover:bg-primary/30 z-20"
      />
      {/* Toolbar */}
      <div className="px-2 py-1.5 border-b border-border flex items-center gap-0.5">
        <ToolBtn title="Add a source" onClick={onAddSource}><FilePlus className="w-4 h-4" /></ToolBtn>
        <ToolBtn title="Import files…" onClick={() => importRef.current?.click()}><Upload className="w-4 h-4" /></ToolBtn>
        <div className="relative">
          <ToolBtn title="Load a sample collation" onClick={() => setSamplesOpen((v) => !v)}><BookOpen className="w-4 h-4" /></ToolBtn>
          {samplesOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSamplesOpen(false)} />
              <div className="absolute left-0 mt-1 w-64 z-50 bg-card border border-border rounded-md shadow-lg py-1 text-[12px]">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Sample collations</div>
                {demos.map((d) => (
                  <button key={d.id} className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => { onLoadDemo(d.id); setSamplesOpen(false); }}>
                    <div className="font-medium truncate">{d.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{d.blurb}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <ToolBtn title="New folder" onClick={newFolder}><FolderPlus className="w-4 h-4" /></ToolBtn>
        <div className="ml-auto flex items-center">
          <button onClick={() => stepFz(-1)} title="Smaller file-list text" className="px-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground text-[10px]">A−</button>
          <button onClick={() => stepFz(1)} title="Larger file-list text" className="px-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground text-[13px]">A+</button>
          <button onClick={() => onHidden(true)} title="Hide sources panel" className="ml-0.5 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"><ChevronRight className="w-3.5 h-3.5 rotate-180" /></button>
        </div>
        <input ref={importRef} type="file" multiple className="hidden" onChange={onImportFiles} accept=".txt,.md,.xml,.tei,.mac,.lst,.s,.asm,.c,.js,.ts,.py,text/*" />
      </div>

      <div className="flex-1 overflow-y-auto py-1" style={{ fontSize: `${fz}px` }}>
        {root.map((w) => (
          <SourceRow key={w.id} witness={w} project={project} folders={folders} fz={fz} />
        ))}

        {folders.map((f) => {
          const items = inFolder(f);
          const isCollapsed = !expanded.has(f);
          return (
            <div key={f}>
              <div className="group flex items-center gap-1 px-2 py-1">
                <button onClick={() => toggleCollapse(f)} className="shrink-0 text-muted-foreground hover:text-foreground" title={isCollapsed ? "Expand" : "Collapse"}>
                  {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                <Folder className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                {editingFolder === f ? (
                  <input
                    autoFocus
                    value={folderDraft}
                    onChange={(e) => setFolderDraft(e.target.value)}
                    onBlur={commitRenameFolder}
                    onKeyDown={(e) => { if (e.key === "Enter") commitRenameFolder(); if (e.key === "Escape") setEditingFolder(null); }}
                    className="flex-1 min-w-0 bg-background border border-primary rounded px-1 py-0.5 uppercase tracking-wide"
                    style={{ fontSize: `${fz}px` }}
                  />
                ) : (
                  <button onDoubleClick={() => startRenameFolder(f)} onClick={() => toggleCollapse(f)} className="flex-1 min-w-0 text-left uppercase tracking-wide truncate text-muted-foreground hover:text-foreground" title="Double-click to rename" style={{ fontSize: `${fz}px` }}>{f}</button>
                )}
                <button onClick={() => startRenameFolder(f)} className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground" title="Rename folder">
                  <Pencil className="w-3 h-3" />
                </button>
                <button onClick={() => { if (confirm(`Delete folder "${f}"? Its sources move to the root.`)) project.deleteFolder(f); }} className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground" title="Delete folder (keep sources)">
                  <X className="w-3 h-3" />
                </button>
              </div>
              {!isCollapsed && items.map((w) => <SourceRow key={w.id} witness={w} project={project} folders={folders} fz={fz} indent />)}
            </div>
          );
        })}
      </div>

      <TrashSection trash={trash} project={project} />
    </aside>
  );
}

function ToolBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
      {children}
    </button>
  );
}

function SourceRow({ witness, project, folders, fz, indent }: { witness: Witness; project: Project; folders: string[]; fz: number; indent?: boolean }) {
  const c = project.collation;
  const w = witness;
  const isLeft = c.leftId === w.id;
  const isRight = c.rightId === w.id;
  const shown = isLeft || isRight;
  const annCount = (c.annotations[w.id] ?? []).length;
  const edited = w.original !== undefined && w.text !== w.original;
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [sig, setSig] = useState(w.siglum);
  const [title, setTitle] = useState(w.title);

  const saveRename = () => {
    project.updateWitness(w.id, { siglum: sig.trim() || w.siglum, title: title.trim() || w.title });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={"px-2 py-1 " + (indent ? "pl-5" : "")}>
        <div className="flex items-center gap-1">
          <input value={sig} onChange={(e) => setSig(e.target.value)} className="w-12 bg-background border border-primary rounded px-1 py-0.5 text-[11px] font-mono" placeholder="Sig" />
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus className="flex-1 min-w-0 bg-background border border-primary rounded px-1 py-0.5 text-[11px]" onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setEditing(false); }} />
          <button onClick={saveRename} className="p-0.5 rounded hover:bg-muted text-green-600" title="Save"><Check className="w-3 h-3" /></button>
          <button onClick={() => setEditing(false)} className="p-0.5 rounded hover:bg-muted text-muted-foreground" title="Cancel"><X className="w-3 h-3" /></button>
        </div>
      </div>
    );
  }

  const comparable = isComparable(w, c.witnesses);
  return (
    <div
      onClick={() => (comparable ? project.setRight(w.id) : setViewing(true))}
      title={comparable ? `${w.title}${w.author ? ` — ${w.author}` : ""}${w.date ? ` (${w.date})` : ""}` : `${w.title} — reference (opens in the reader)`}
      className={
        "group flex items-center gap-1.5 pr-1.5 py-1 cursor-pointer border-l-2 " +
        (indent ? "pl-4 " : "pl-2 ") +
        (!comparable ? "opacity-70 border-transparent hover:bg-muted/40 " : isRight ? "bg-primary/10 border-primary " : isLeft ? "border-primary/50 " : "border-transparent hover:bg-muted/50 ")
      }
    >
      {comparable ? <File className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /> : <BookOpen className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
      <div className="flex-1 min-w-0">
        <div className={"truncate " + (shown ? "text-foreground" : "")} style={{ fontSize: `${fz}px` }}>{w.title}</div>
        {(w.author || w.date) && <div className="truncate text-[8px] leading-tight text-muted-foreground">{[w.date, w.author && (w.author.length > 18 ? w.author.slice(0, 18) + "…" : w.author)].filter(Boolean).join(" · ")}</div>}
      </div>
      {!comparable && <span className="text-[8px] uppercase tracking-wide text-muted-foreground" title="Reference — not loaded into the compare panels">ref</span>}
      {isLeft && <span className="text-[8px] uppercase tracking-wide text-muted-foreground" title="Base / copy-text (left panel)">base</span>}
      {edited && <span className="text-[8px] uppercase tracking-wide text-amber-600 dark:text-amber-400" title="Edited — differs from the original; revert via ⋮">edited</span>}
      {annCount > 0 && <span className="text-[9px] px-1 rounded bg-secondary/30 text-secondary-foreground" title={`${annCount} annotation(s)`}>✎{annCount}</span>}
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setMenu((v) => !v)} className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground" title="Actions">
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <div className="absolute right-0 top-full mt-1 w-44 z-50 bg-card border border-border rounded-md shadow-lg py-1 text-[12px]">
              <button className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2" onClick={() => { setSig(w.siglum); setTitle(w.title); setEditing(true); setMenu(false); }}>
                <Pencil className="w-3 h-3 text-muted-foreground" /> Rename
              </button>
              <button className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2" onClick={() => { setViewing(true); setMenu(false); }}>
                <FileText className="w-3 h-3 text-muted-foreground" /> Open in viewer…
              </button>
              <button className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2" onClick={() => { project.toggleReference(w.id); setMenu(false); }}>
                <BookOpen className="w-3 h-3 text-muted-foreground" /> {isComparable(w, c.witnesses) ? "Make reference (reader only)" : "Add to Witnesses (compare)"}
              </button>
              <button className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2" onClick={() => { setDetails(true); setMenu(false); }}>
                <Info className="w-3 h-3 text-muted-foreground" /> Details &amp; metadata…
              </button>
              <button className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2" onClick={() => { project.duplicateWitness(w.id, uid()); setMenu(false); }}>
                <Copy className="w-3 h-3 text-muted-foreground" /> Duplicate (working copy)
              </button>
              {edited && (
                <button className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-amber-700 dark:text-amber-400" onClick={() => { if (confirm(`Revert "${w.title}" to its original text? Edits will be lost.`)) project.revertWitness(w.id); setMenu(false); }}>
                  <RotateCcw className="w-3 h-3" /> Revert to original
                </button>
              )}
              <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Move to</div>
              {w.folder && (
                <button className="w-full text-left px-3 py-1 hover:bg-muted flex items-center gap-2" onClick={() => { project.moveToFolder(w.id, ""); setMenu(false); }}>
                  <Folder className="w-3 h-3 text-muted-foreground" /> Root
                </button>
              )}
              {folders.filter((f) => f !== w.folder).map((f) => (
                <button key={f} className="w-full text-left px-3 py-1 hover:bg-muted flex items-center gap-2" onClick={() => { project.moveToFolder(w.id, f); setMenu(false); }}>
                  <Folder className="w-3 h-3 text-muted-foreground" /> {f}
                </button>
              ))}
              <button className="w-full text-left px-3 py-1 hover:bg-muted flex items-center gap-2 text-muted-foreground" onClick={() => { const n = prompt("New folder name:")?.trim(); if (n) project.moveToFolder(w.id, n); setMenu(false); }}>
                <FolderPlus className="w-3 h-3" /> New folder…
              </button>
              <div className="border-t border-border my-1" />
              <button className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 text-destructive disabled:opacity-40" disabled={c.witnesses.length <= 2} title={c.witnesses.length <= 2 ? "Keep at least two sources" : "Send to trash"} onClick={() => { project.trashWitness(w.id); setMenu(false); }}>
                <Trash2 className="w-3 h-3" /> Send to trash
              </button>
            </div>
          </>
        )}
      </div>
      {details && <WitnessDetailsModal witness={w} onClose={() => setDetails(false)} onSave={(patch) => { project.updateWitness(w.id, patch); setDetails(false); }} />}
      {viewing && <SourceViewerModal witness={w} onClose={() => setViewing(false)} onSave={(text) => project.updateWitness(w.id, { text })} />}
    </div>
  );
}

/** View / lightly edit any source's text in a modal WITHOUT loading it into a
 *  compare panel — so reference material can live in the working folder and be
 *  read or annotated independently of the braid. Markdown ⇄ rich-text toggle. */
function SourceViewerModal({ witness, onClose, onSave }: { witness: Witness; onClose: () => void; onSave: (text: string) => void }) {
  const [draft, setDraft] = useState(witness.text);
  const dirty = draft !== witness.text;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-16" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg w-full max-w-3xl shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight truncate">{witness.title}</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{witness.siglum}{witness.author ? ` · ${witness.author}` : ""}{witness.date ? ` · ${witness.date}` : ""} · viewer (does not change the compare panels)</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-muted" title="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-4">
          <MarkdownPad value={draft} onChange={setDraft} codeMode defaultLang={witness.lang} initialView={witness.lang && witness.lang !== "markdown" ? "code" : "rich"} />
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={onClose} className="px-3 py-1 rounded border border-border text-[12px] hover:bg-muted">Close</button>
            <button onClick={() => { onSave(draft); onClose(); }} disabled={!dirty} className="px-3 py-1 rounded bg-primary text-primary-foreground text-[12px] disabled:opacity-50">Save changes</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Edit a witness's bibliographic metadata: siglum, title, author, date, plus
 *  arbitrary custom key/value fields. */
function WitnessDetailsModal({ witness, onClose, onSave }: { witness: Witness; onClose: () => void; onSave: (patch: Partial<Witness>) => void }) {
  const [sig, setSig] = useState(witness.siglum);
  const [title, setTitle] = useState(witness.title);
  const [author, setAuthor] = useState(witness.author ?? "");
  const [date, setDate] = useState(witness.date ?? "");
  const [provenance, setProvenance] = useState(witness.provenance ?? "");
  const [lang, setLang] = useState(witness.lang ?? "none");
  const [language, setLanguage] = useState(witness.language ?? "");
  const [reference, setReference] = useState(witness.reference === true || (!!witness.folder && witness.folder !== WITNESS_FOLDER));
  const [rows, setRows] = useState<{ k: string; v: string }[]>(() => Object.entries(witness.metadata ?? {}).map(([k, v]) => ({ k, v })));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const save = () => {
    const metadata: Record<string, string> = {};
    for (const r of rows) { const k = r.k.trim(); if (k) metadata[k] = r.v.trim(); }
    onSave({
      siglum: sig.trim() || witness.siglum,
      title: title.trim() || witness.title,
      author: author.trim() || undefined,
      date: date.trim() || undefined,
      provenance: provenance.trim() || undefined,
      lang: lang === "none" ? undefined : lang,
      language: language.trim() || undefined,
      reference: reference || undefined,
      // In = the Witnesses (comparable) folder; reference keeps its own folder or
      // drops to the top level.
      folder: reference ? (witness.folder && witness.folder !== WITNESS_FOLDER ? witness.folder : undefined) : WITNESS_FOLDER,
      metadata: Object.keys(metadata).length ? metadata : undefined,
    });
  };
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <label className="flex items-center gap-2 text-[12px]">
      <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
      {children}
    </label>
  );
  const inputCls = "flex-1 min-w-0 bg-background border border-border rounded px-2 py-1 text-[12px]";
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-border">
          <h2 className="text-[15px] font-semibold leading-tight">Source details</h2>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-muted" title="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-2.5">
          <Field label="Siglum"><input value={sig} onChange={(e) => setSig(e.target.value)} className={inputCls + " font-mono max-w-[6rem]"} /></Field>
          <Field label="Title"><input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} /></Field>
          <Field label="Author"><input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="editor / translator" className={inputCls} /></Field>
          <Field label="Date / year"><input value={date} onChange={(e) => setDate(e.target.value)} placeholder="e.g. 1623" className={inputCls} /></Field>
          <label className="flex items-start gap-2 text-[12px]">
            <span className="w-20 shrink-0 text-muted-foreground pt-1">Provenance</span>
            <textarea value={provenance} onChange={(e) => setProvenance(e.target.value)} placeholder="where this source came from" className={inputCls + " h-14 resize-y"} />
          </label>
          <Field label="Code lang">
            <select value={lang} onChange={(e) => setLang(e.target.value)} title="Syntax-highlighting language (set this if the source is code)" className={inputCls}>
              <option value="none">— not code / plain —</option>
              <optgroup label="Modern">{LANGS.filter((l) => l.group === "modern").map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</optgroup>
              <optgroup label="Historical">{LANGS.filter((l) => l.group === "historical").map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</optgroup>
            </select>
          </Field>
          <Field label="Language"><input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="natural language, e.g. en · grc · de" className={inputCls + " max-w-[10rem]"} /></Field>
          <label className="flex items-center gap-2 text-[12px]">
            <span className="w-20 shrink-0 text-muted-foreground">Reference</span>
            <input type="checkbox" checked={reference} onChange={(e) => setReference(e.target.checked)} className="accent-primary" />
            <span className="text-[11px] text-muted-foreground">reader only — not loaded into a compare panel</span>
          </label>
          <div className="pt-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Custom fields</div>
            <div className="space-y-1.5">
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input value={r.k} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} placeholder="key" className="w-28 bg-background border border-border rounded px-1.5 py-1 text-[11px]" />
                  <input value={r.v} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} placeholder="value" className="flex-1 min-w-0 bg-background border border-border rounded px-1.5 py-1 text-[11px]" />
                  <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="p-1 rounded hover:bg-muted text-muted-foreground" title="Remove"><X className="w-3 h-3" /></button>
                </div>
              ))}
              <button onClick={() => setRows((rs) => [...rs, { k: "", v: "" }])} className="text-[11px] text-primary hover:underline">+ add field</button>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded border border-border text-[12px] hover:bg-muted">Cancel</button>
          <button onClick={save} className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-[12px] font-medium">Save</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function TrashSection({ trash, project }: { trash: Witness[]; project: Project }) {
  const [open, setOpen] = useState(false);
  const empty = trash.length === 0;
  return (
    <div className="border-t border-border">
      <button onClick={() => !empty && setOpen((v) => !v)} className={"w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-muted-foreground " + (empty ? "cursor-default opacity-60" : "hover:bg-muted/40")}>
        {empty ? <ChevronRight className="w-3 h-3 opacity-40" /> : open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Trash2 className="w-3.5 h-3.5" />
        <span>Trash</span>
        {!empty && <span className="ml-auto px-1.5 py-0.5 text-[9px] bg-destructive/10 text-destructive rounded-full">{trash.length}</span>}
      </button>
      {open && !empty && (
        <div className="max-h-[24vh] overflow-y-auto">
          {trash.map((w) => (
            <div key={w.id} className="group flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-muted/40 text-[12px]">
              <File className="w-3 h-3 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1 text-muted-foreground" title={w.title}>{w.title}</span>
              <button onClick={() => project.restoreWitness(w.id)} className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-foreground" title="Restore"><RotateCcw className="w-3 h-3" /></button>
              <button onClick={() => { if (confirm(`Permanently delete "${w.title}"?`)) project.deleteForever(w.id); }} className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-destructive" title="Delete permanently"><X className="w-3 h-3" /></button>
            </div>
          ))}
          <button onClick={() => { if (confirm("Empty the trash? This permanently deletes all trashed sources.")) project.emptyTrash(); }} className="w-full text-left px-2.5 py-1.5 text-[11px] text-destructive hover:bg-muted/40">
            Empty trash
          </button>
        </div>
      )}
    </div>
  );
}

function siglumOf(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "").replace(/^.*[/\\]/, "");
  const m = stem.match(/(\d+(?:\.\d+)?[a-z]?)/i);
  return (m?.[1] ?? stem).slice(0, 8);
}
