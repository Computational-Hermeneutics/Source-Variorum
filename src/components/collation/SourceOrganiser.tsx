"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FilePlus, Upload, FolderPlus, Folder, File, BookOpen, ChevronRight, ChevronDown,
  MoreVertical, Pencil, Trash2, RotateCcw, X, Check, ArrowLeftToLine, ArrowRightToLine,
} from "lucide-react";
import type { Witness } from "@/types/collation";
import type { Demo } from "@/data/demos";
import type { useProject } from "@/hooks/useProject";

type Project = ReturnType<typeof useProject>;
const COLLAPSE_KEY = "source-variorum-collapsed-folders";
const FZ_KEY = "source-variorum-sidebar-fontsize";

export function SourceOrganiser({
  project,
  demos,
  onLoadDemo,
  onAddSource,
  onImport,
}: {
  project: Project;
  demos: Demo[];
  onLoadDemo: (id: string) => void;
  onAddSource: () => void;
  onImport: (sources: { siglum: string; title: string; text: string }[]) => void;
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

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw)));
      const f = localStorage.getItem(FZ_KEY);
      if (f) setFz(Math.min(16, Math.max(9, parseInt(f, 10) || 11)));
    } catch {
      /* ignore */
    }
  }, []);
  const toggleCollapse = (f: string) =>
    setCollapsed((prev) => {
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
        files.map(async (f) => ({ siglum: siglumOf(f.name), title: f.name, text: await f.text() }))
      );
      onImport(sources);
    },
    [onImport]
  );

  const newFolder = () => {
    const name = prompt("Folder name:")?.trim();
    if (name) project.createFolder(name);
  };

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-muted/20 flex flex-col">
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
        </div>
        <input ref={importRef} type="file" multiple className="hidden" onChange={onImportFiles} accept=".txt,.md,.mac,.lst,.s,.asm,.c,.js,.ts,.py,text/*" />
      </div>

      <div className="flex-1 overflow-y-auto py-1" style={{ fontSize: `${fz}px` }}>
        {root.map((w) => (
          <SourceRow key={w.id} witness={w} project={project} folders={folders} fz={fz} />
        ))}

        {folders.map((f) => {
          const items = inFolder(f);
          const isCollapsed = collapsed.has(f);
          return (
            <div key={f}>
              <div className="group flex items-center gap-1 px-2 py-1">
                <button onClick={() => toggleCollapse(f)} className="flex items-center gap-1 flex-1 min-w-0 text-left text-muted-foreground hover:text-foreground">
                  {isCollapsed ? <ChevronRight className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
                  <Folder className="w-3.5 h-3.5 shrink-0" />
                  <span className="uppercase tracking-wide truncate" style={{ fontSize: `${fz}px` }}>{f}</span>
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
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
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

  return (
    <div
      onClick={() => project.setRight(w.id)}
      title={`${w.title}${w.date ? ` (${w.date})` : ""}\nClick to compare on the right; ⋮ for more`}
      className={
        "group flex items-center gap-1.5 pr-1.5 py-1 cursor-pointer border-l-2 " +
        (indent ? "pl-4 " : "pl-2 ") +
        (isRight ? "bg-primary/10 border-primary " : isLeft ? "border-primary/50 " : "border-transparent hover:bg-muted/50 ")
      }
    >
      <File className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      <span className={"truncate flex-1 " + (shown ? "text-foreground" : "")} style={{ fontSize: `${fz}px` }}>{w.title}</span>
      {isLeft && <span className="text-[8px] uppercase tracking-wide text-muted-foreground" title="Base / copy-text (left panel)">base</span>}
      {annCount > 0 && <span className="text-[9px] px-1 rounded bg-secondary/30 text-secondary-foreground" title={`${annCount} annotation(s)`}>✎{annCount}</span>}
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setMenu((v) => !v)} className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground" title="Actions">
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <div className="absolute right-0 top-full mt-1 w-44 z-50 bg-card border border-border rounded-md shadow-lg py-1 text-[12px]">
              <button className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2" onClick={() => { project.setLeft(w.id); setMenu(false); }}>
                <ArrowLeftToLine className="w-3 h-3 text-muted-foreground" /> Show on left (base)
              </button>
              <button className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2" onClick={() => { project.setRight(w.id); setMenu(false); }}>
                <ArrowRightToLine className="w-3 h-3 text-muted-foreground" /> Show on right
              </button>
              <div className="border-t border-border my-1" />
              <button className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2" onClick={() => { setSig(w.siglum); setTitle(w.title); setEditing(true); setMenu(false); }}>
                <Pencil className="w-3 h-3 text-muted-foreground" /> Rename
              </button>
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
    </div>
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
