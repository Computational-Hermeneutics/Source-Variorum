"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FilePlus, Upload, FolderPlus, Folder, ChevronRight, ChevronDown,
  MoreVertical, Pencil, Trash2, RotateCcw, X, Check,
} from "lucide-react";
import type { Witness } from "@/types/collation";
import type { useProject } from "@/hooks/useProject";

type Project = ReturnType<typeof useProject>;
const COLLAPSE_KEY = "source-variorum-collapsed-folders";

export function SourceOrganiser({
  project,
  onAddSource,
  onImport,
}: {
  project: Project;
  onAddSource: () => void;
  onImport: (sources: { siglum: string; title: string; text: string }[]) => void;
}) {
  const c = project.collation;
  const trash = c.trash ?? [];
  const importRef = useRef<HTMLInputElement>(null);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw)));
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
      <div className="px-2.5 py-1.5 border-b border-border flex items-center gap-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mr-auto">Sources · {c.witnesses.length}</span>
        <ToolBtn title="Add a source" onClick={onAddSource}><FilePlus className="w-3.5 h-3.5" /></ToolBtn>
        <ToolBtn title="Import files…" onClick={() => importRef.current?.click()}><Upload className="w-3.5 h-3.5" /></ToolBtn>
        <ToolBtn title="New folder" onClick={newFolder}><FolderPlus className="w-3.5 h-3.5" /></ToolBtn>
        <input ref={importRef} type="file" multiple className="hidden" onChange={onImportFiles} accept=".txt,.md,.mac,.lst,.s,.asm,.c,.js,.ts,.py,text/*" />
      </div>

      <div className="flex-1 overflow-y-auto">
        {root.map((w) => (
          <SourceRow key={w.id} witness={w} project={project} folders={folders} />
        ))}

        {folders.map((f) => {
          const items = inFolder(f);
          const isCollapsed = collapsed.has(f);
          return (
            <div key={f}>
              <div className="group flex items-center gap-1 px-2 py-1 bg-muted/40 border-y border-border/60">
                <button onClick={() => toggleCollapse(f)} className="flex items-center gap-1 flex-1 min-w-0 text-left">
                  {isCollapsed ? <ChevronRight className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
                  <Folder className="w-3 h-3 shrink-0 text-muted-foreground" />
                  <span className="text-[11px] font-medium truncate">{f}</span>
                  <span className="text-[10px] text-muted-foreground">{items.length}</span>
                </button>
                <button onClick={() => { if (confirm(`Delete folder "${f}"? Its sources move to the root.`)) project.deleteFolder(f); }} className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground" title="Delete folder (keep sources)">
                  <X className="w-3 h-3" />
                </button>
              </div>
              {!isCollapsed && items.map((w) => <SourceRow key={w.id} witness={w} project={project} folders={folders} indent />)}
            </div>
          );
        })}
      </div>

      {/* Trash */}
      <TrashSection trash={trash} project={project} />
    </aside>
  );
}

function ToolBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
      {children}
    </button>
  );
}

function SourceRow({ witness, project, folders, indent }: { witness: Witness; project: Project; folders: string[]; indent?: boolean }) {
  const c = project.collation;
  const w = witness;
  const isLeft = c.leftId === w.id;
  const isRight = c.rightId === w.id;
  const isBase = c.witnesses[c.baseIndex]?.id === w.id;
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sig, setSig] = useState(w.siglum);
  const [title, setTitle] = useState(w.title);

  const saveRename = () => {
    project.updateWitness(w.id, { siglum: sig.trim() || w.siglum, title: title.trim() || w.title });
    setEditing(false);
  };

  return (
    <div className={"group border-b border-border/60 hover:bg-muted/40 " + (indent ? "pl-4" : "")}>
      <div className="px-2.5 py-2">
        {editing ? (
          <div className="flex items-center gap-1">
            <input value={sig} onChange={(e) => setSig(e.target.value)} className="w-12 bg-background border border-primary rounded px-1 py-0.5 text-[11px] font-mono" />
            <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus className="flex-1 min-w-0 bg-background border border-primary rounded px-1 py-0.5 text-[11px]" onKeyDown={(e) => { if (e.key === "Enter") saveRename(); if (e.key === "Escape") setEditing(false); }} />
            <button onClick={saveRename} className="p-0.5 rounded hover:bg-muted text-green-600" title="Save"><Check className="w-3 h-3" /></button>
            <button onClick={() => setEditing(false)} className="p-0.5 rounded hover:bg-muted text-muted-foreground" title="Cancel"><X className="w-3 h-3" /></button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px] px-1 rounded bg-primary/10 text-primary font-semibold shrink-0">{w.siglum}</span>
            <span className="text-[12px] truncate flex-1" title={w.title}>{w.title}</span>
            <div className="relative">
              <button onClick={() => setMenu((v) => !v)} className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted text-muted-foreground" title="Actions">
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 w-40 z-50 bg-card border border-border rounded-md shadow-lg py-1 text-[12px]">
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
        )}
        <div className="flex items-center gap-1 mt-1.5">
          <PanelBtn active={isLeft} disabled={isRight} onClick={() => project.setLeft(w.id)} title="Show in left panel">L</PanelBtn>
          <PanelBtn active={isRight} disabled={isLeft} onClick={() => project.setRight(w.id)} title="Show in right panel">R</PanelBtn>
          <button onClick={() => project.setBase(w.id)} className={"px-1.5 py-0.5 rounded text-[10px] border " + (isBase ? "bg-secondary/40 border-secondary" : "border-border bg-card hover:bg-muted")} title="Mark as base / copy-text">base</button>
          {w.date && <span className="ml-auto text-[10px] text-muted-foreground truncate">{w.date}</span>}
        </div>
      </div>
    </div>
  );
}

function PanelBtn({ children, active, disabled, onClick, title }: { children: React.ReactNode; active: boolean; disabled: boolean; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={"px-1.5 py-0.5 rounded text-[10px] border " + (active ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card hover:bg-muted disabled:opacity-30")}>
      {children}
    </button>
  );
}

function TrashSection({ trash, project }: { trash: Witness[]; project: Project }) {
  const [open, setOpen] = useState(false);
  if (trash.length === 0) return null;
  return (
    <div className="border-t border-border">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-muted/40 text-[11px] text-muted-foreground">
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Trash2 className="w-3 h-3" />
        <span>Trash</span>
        <span className="ml-auto px-1.5 py-0.5 text-[9px] bg-destructive/10 text-destructive rounded-full">{trash.length}</span>
      </button>
      {open && (
        <div className="max-h-[24vh] overflow-y-auto">
          {trash.map((w) => (
            <div key={w.id} className="group flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-muted/40 text-[12px]">
              <span className="font-mono text-[10px] px-1 rounded bg-muted text-muted-foreground shrink-0">{w.siglum}</span>
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
