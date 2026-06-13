"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Moon, Sun, X, Info, FileText, FilePlus, FolderOpen, Save, Download,
  ChevronDown, Undo2, Redo2, RotateCcw, Pencil, Type,
} from "lucide-react";
import type { Collation, CollationMode, Witness } from "@/types/collation";
import { CollationView } from "@/components/collation/CollationView";
import { SourceOrganiser } from "@/components/collation/SourceOrganiser";
import { useProject } from "@/hooks/useProject";
import { DEMOS, type Demo, type DemoWitness } from "@/data/demos";
import { APP_VERSION } from "@/lib/version";
import { normalizeNewlines } from "@/lib/utils";
import { deriveView, download, parseProjectFile, slugify, toJSON, toMarkdown, toPDF } from "@/lib/export/collation-export";

const CURRENT_KEY = "source-variorum-current";
const FONT_KEY = "source-variorum-fontsize";

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  }
}

function witnessFrom(w: DemoWitness, id: string, text: string): Witness {
  return { id, siglum: w.siglum, title: w.title, provenance: w.provenance, date: w.date, text };
}

async function resolveWitnessText(w: DemoWitness): Promise<string> {
  if (w.text != null) return normalizeNewlines(w.text);
  if (w.file) {
    const res = await fetch(`/${w.file}`);
    return normalizeNewlines(await res.text());
  }
  return "";
}

function makeCollation(name: string, mode: CollationMode, witnesses: Witness[]): Collation {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name,
    mode,
    witnesses,
    baseIndex: 0,
    leftId: witnesses[0]?.id ?? "a",
    rightId: witnesses[1]?.id ?? witnesses[0]?.id ?? "b",
    annotations: {},
    links: [],
    apparatusEdits: {},
    createdAt: now,
    updatedAt: now,
  };
}

function inlineCollation(demo: Demo): Collation {
  return makeCollation(demo.name, demo.mode, [
    witnessFrom(demo.witnessA, "a", normalizeNewlines(demo.witnessA.text ?? "")),
    witnessFrom(demo.witnessB, "b", normalizeNewlines(demo.witnessB.text ?? "")),
  ]);
}

async function collationFromDemo(demoId: string): Promise<Collation> {
  const demo = DEMOS.find((d) => d.id === demoId) ?? DEMOS[0];
  if (demo.witnesses && demo.witnesses.length >= 2) {
    const texts = await Promise.all(demo.witnesses.map(resolveWitnessText));
    const witnesses = demo.witnesses.map((w, i) => witnessFrom(w, `w${i}`, texts[i]));
    const c = makeCollation(demo.name, demo.mode, witnesses);
    const li = Math.max(0, demo.witnesses.indexOf(demo.witnessA));
    const ri = demo.witnesses.indexOf(demo.witnessB);
    return { ...c, leftId: witnesses[li].id, rightId: witnesses[ri >= 0 ? ri : Math.min(1, witnesses.length - 1)].id };
  }
  const [textA, textB] = await Promise.all([resolveWitnessText(demo.witnessA), resolveWitnessText(demo.witnessB)]);
  return makeCollation(demo.name, demo.mode, [witnessFrom(demo.witnessA, "a", textA), witnessFrom(demo.witnessB, "b", textB)]);
}

/** Short siglum derived from a filename stem (for multi-file import). */
function siglumFromName(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "").replace(/^.*[/\\]/, "");
  const m = stem.match(/(\d+(?:\.\d+)?[a-z]?)/i);
  return (m?.[1] ?? stem).slice(0, 8);
}

function blankCollation(mode: CollationMode): Collation {
  return makeCollation("Untitled collation", mode, [
    { id: uid(), siglum: "A", title: "Witness A", text: "" },
    { id: uid(), siglum: "B", title: "Witness B", text: "" },
  ]);
}

const DEFAULT_DEMO = DEMOS.find((d) => d.witnessA.text != null && d.witnessB.text != null) ?? DEMOS[0];

export default function Home() {
  const project = useProject(useMemo(() => inlineCollation(DEFAULT_DEMO), []));
  const { collation } = project;
  const [isDark, setIsDark] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [fontSize, setFontSize] = useState(13);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hydrate working collation + font size on mount; otherwise load a default
  // sample (all sample texts are fetched from /public, so there is no inline one).
  useEffect(() => {
    let restored = false;
    try {
      const stored = localStorage.getItem(CURRENT_KEY);
      if (stored) {
        const parsed = parseProjectFile(stored);
        if (parsed && parsed.witnesses.some((w) => w.text.trim())) {
          project.load(parsed);
          restored = true;
        }
      }
      const fs = localStorage.getItem(FONT_KEY);
      if (fs) setFontSize(Math.min(22, Math.max(9, parseInt(fs, 10) || 13)));
    } catch {
      /* ignore */
    }
    if (!restored) collationFromDemo(DEFAULT_DEMO.id).then(project.load).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_KEY, toJSON(collation));
    } catch {
      /* ignore quota */
    }
  }, [collation]);

  useEffect(() => {
    try {
      localStorage.setItem(FONT_KEY, String(fontSize));
    } catch {
      /* ignore */
    }
  }, [fontSize]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  // Undo/redo keyboard shortcuts (skip when typing in a field — let native undo work).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) project.redo();
        else project.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [project]);

  const view = useMemo(() => deriveView(collation), [collation]);

  const loadDemo = (id: string) => {
    collationFromDemo(id).then(project.load).catch(() => alert("Could not load that demo's source files."));
  };

  const onLoadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const parsed = parseProjectFile(await file.text());
    if (parsed) project.load(parsed);
    else alert("That file is not a valid Source Variorum project (.svar / JSON).");
  };

  const saveProject = () => {
    download(`${slugify(collation.name)}.svar`, toJSON(collation), "application/json");
    project.markSaved();
  };

  const setFont = (delta: number) => setFontSize((s) => Math.min(22, Math.max(9, s + delta)));

  const importSources = useCallback(
    (sources: { siglum: string; title: string; text: string }[]) => {
      project.addWitnesses(sources.map((s) => ({ id: uid(), siglum: s.siglum, title: s.title, text: normalizeNewlines(s.text) })));
    },
    [project]
  );

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-30">
        <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2.5 mr-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sv-icon.svg" alt="Source Variorum" width={28} height={28} className="w-7 h-7" />
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight">Source Variorum</div>
              <a href="https://computational-hermeneutics.github.io" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/ch-mark.svg" alt="" width={11} height={11} className="w-[11px] h-[11px] opacity-70" />
                Part of Computational Hermeneutics
              </a>
            </div>
          </div>

          <FileMenu
            name={collation.name}
            onRename={project.rename}
            onNew={() => project.load(blankCollation(collation.mode))}
            onLoad={() => fileInputRef.current?.click()}
            onSave={saveProject}
            onExportMd={() => download(`${slugify(collation.name)}.md`, toMarkdown(collation), "text/markdown")}
            onExportJson={() => download(`${slugify(collation.name)}.json`, toJSON(collation), "application/json")}
            onExportPdf={() => toPDF(collation).save(`${slugify(collation.name)}.pdf`)}
          />

          {/* Undo / redo / revert */}
          <div className="flex items-center rounded border border-border overflow-hidden">
            <IconBtn title="Undo (⌘Z)" disabled={!project.canUndo} onClick={project.undo}><Undo2 className="w-3.5 h-3.5" /></IconBtn>
            <IconBtn title="Redo (⌘⇧Z)" disabled={!project.canRedo} onClick={project.redo}><Redo2 className="w-3.5 h-3.5" /></IconBtn>
          </div>
          {project.isDirty && (
            <button onClick={() => { if (confirm("Revert to last saved/loaded state? Unsaved changes will be lost.")) project.revert(); }} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border bg-card hover:bg-muted text-[11px] text-muted-foreground" title="Revert to last saved project">
              <RotateCcw className="w-3.5 h-3.5" /> Revert
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <button onClick={() => setEditMode((v) => !v)} className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded border text-[12px] " + (editMode ? "bg-amber-500/20 border-amber-500 text-amber-800 dark:text-amber-300" : "border-border bg-card hover:bg-muted")} title="Edit witness text">
              <Pencil className="w-3.5 h-3.5" /> {editMode ? "Editing" : "Edit"}
            </button>

            {/* Font size */}
            <div className="flex items-center rounded border border-border overflow-hidden">
              <IconBtn title="Smaller text" onClick={() => setFont(-1)}><span className="text-[11px]">A−</span></IconBtn>
              <span className="px-1 text-[10px] text-muted-foreground tabular-nums w-7 text-center"><Type className="w-3 h-3 inline -mt-0.5" /></span>
              <IconBtn title="Larger text" onClick={() => setFont(1)}><span className="text-[14px]">A+</span></IconBtn>
            </div>

            <div className="flex rounded border border-border overflow-hidden text-[12px]">
              {(["source", "text"] as CollationMode[]).map((m) => (
                <button key={m} onClick={() => project.setMode(m)} className={"px-2.5 py-1 capitalize transition-colors " + (collation.mode === m ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{m}</button>
              ))}
            </div>

            <button onClick={() => setShowAbout(true)} className="p-1.5 rounded border border-border bg-card hover:bg-muted" title="About"><Info className="w-3.5 h-3.5" /></button>
            <button onClick={() => setIsDark((v) => !v)} className="p-1.5 rounded border border-border bg-card hover:bg-muted" title="Toggle theme">{isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}</button>
          </div>
        </div>
      </header>

      <input ref={fileInputRef} type="file" accept=".svar,.json,application/json" className="hidden" onChange={onLoadFile} />

      {showAdd && (
        <AddSourcePanel
          mode={collation.mode}
          onClose={() => setShowAdd(false)}
          onAdd={(w) => { project.addWitness(w); setShowAdd(false); }}
          onAddMany={(sources) => { importSources(sources); setShowAdd(false); }}
        />
      )}

      <div className="flex-1 flex min-h-0">
        <SourceOrganiser project={project} demos={DEMOS} onLoadDemo={loadDemo} onAddSource={() => setShowAdd(true)} onImport={importSources} />
        <main className="flex-1 min-w-0">
          <CollationView project={project} view={view} fontSize={fontSize} editMode={editMode} />
        </main>
      </div>

      <footer className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground flex items-center gap-2">
        <span>Source Variorum v{APP_VERSION}</span>
        <span className="opacity-50">·</span>
        <span>by David M. Berry</span>
        <span className="opacity-50">·</span>
        <a href="https://computational-hermeneutics.github.io" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ch-mark.svg" alt="" width={12} height={12} className="w-3 h-3 opacity-70" />
          Computational Hermeneutics
        </a>
      </footer>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  );
}

function IconBtn({ children, title, onClick, disabled }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} className="px-1.5 py-1 bg-card hover:bg-muted disabled:opacity-30 disabled:hover:bg-card flex items-center justify-center">
      {children}
    </button>
  );
}

function AddSourcePanel({
  mode,
  onClose,
  onAdd,
  onAddMany,
}: {
  mode: CollationMode;
  onClose: () => void;
  onAdd: (w: Witness) => void;
  onAddMany: (sources: { siglum: string; title: string; text: string }[]) => void;
}) {
  const [sig, setSig] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    // Multiple files → import each as a witness directly (siglum from filename).
    if (files.length > 1) {
      const sources = await Promise.all(
        files.map(async (f) => ({ siglum: siglumFromName(f.name), title: f.name, text: await f.text() }))
      );
      onAddMany(sources);
      return;
    }
    const f = files[0];
    setText(normalizeNewlines(await f.text()));
    if (!title) setTitle(f.name);
    if (!sig) setSig(siglumFromName(f.name));
  };
  const fetchUrl = async () => {
    if (!url) return;
    setBusy(true);
    try {
      const res = await fetch(url);
      setText(normalizeNewlines(await res.text()));
    } catch {
      alert("Could not fetch that URL (CORS or network). Paste or upload instead.");
    } finally {
      setBusy(false);
    }
  };
  const add = () => {
    onAdd({ id: uid(), siglum: sig || "?", title: title || "Untitled witness", text: normalizeNewlines(text) });
  };

  return (
    <div className="border-b border-border bg-muted/20 px-4 py-3">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[12px] font-semibold">Add source ({mode})</span>
        <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-muted" title="Close"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <input value={sig} onChange={(e) => setSig(e.target.value)} className="w-20 bg-background border border-border rounded px-2 py-1 text-[12px] font-mono" placeholder="Siglum" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 bg-background border border-border rounded px-2 py-1 text-[12px]" placeholder="Title" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1 bg-background border border-border rounded px-2 py-1 text-[11px]" placeholder="Fetch from URL…" />
        <button onClick={fetchUrl} disabled={busy} className="px-2 py-1 rounded border border-border bg-card hover:bg-muted text-[11px] disabled:opacity-50">{busy ? "…" : "Fetch"}</button>
        <label className="px-2 py-1 rounded border border-border bg-card hover:bg-muted text-[11px] cursor-pointer whitespace-nowrap" title="Choose one file to edit before adding, or several to import them all at once">File(s)<input type="file" multiple className="hidden" onChange={onFile} accept=".txt,.md,.mac,.lst,.s,.asm,.c,.js,.ts,.py,text/*" /></label>
      </div>
      <div className="text-[10px] text-muted-foreground mb-1">Tip: select multiple files to import them all as separate sources at once.</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="w-full h-32 bg-background border border-border rounded px-2 py-1.5 text-[12px] font-mono resize-y" placeholder="Paste source text…" />
      <div className="flex justify-end mt-2">
        <button onClick={add} disabled={!text.trim()} className="px-4 py-1.5 rounded bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-50">Add to project</button>
      </div>
    </div>
  );
}

function FileMenu({
  name, onRename, onNew, onLoad, onSave, onExportMd, onExportJson, onExportPdf,
}: {
  name: string; onRename: (s: string) => void; onNew: () => void; onLoad: () => void; onSave: () => void; onExportMd: () => void; onExportJson: () => void; onExportPdf: () => void;
}) {
  const [open, setOpen] = useState(false);
  const item = "w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted flex items-center gap-2";
  const close = (fn: () => void) => () => { fn(); setOpen(false); };
  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-border bg-card hover:bg-muted text-[12px]">
        <FileText className="w-3.5 h-3.5" /> File <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-1 w-60 z-50 bg-card border border-border rounded-md shadow-lg py-1.5">
            <div className="px-3 pb-2 pt-1">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Collation name</label>
              <input value={name} onChange={(e) => onRename(e.target.value)} className="w-full mt-1 bg-background border border-border rounded px-2 py-1 text-[12px]" />
            </div>
            <div className="border-t border-border my-1" />
            <button className={item} onClick={close(onNew)}><FilePlus className="w-3.5 h-3.5 text-muted-foreground" /> New collation…</button>
            <button className={item} onClick={close(onLoad)}><FolderOpen className="w-3.5 h-3.5 text-muted-foreground" /> Open project (.svar)…</button>
            <button className={item} onClick={close(onSave)}><Save className="w-3.5 h-3.5 text-muted-foreground" /> Save project (.svar)</button>
            <div className="border-t border-border my-1" />
            <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Export</div>
            <button className={item} onClick={close(onExportMd)}><Download className="w-3.5 h-3.5 text-muted-foreground" /> Markdown (.md)</button>
            <button className={item} onClick={close(onExportPdf)}><Download className="w-3.5 h-3.5 text-muted-foreground" /> PDF (.pdf)</button>
            <button className={item} onClick={close(onExportJson)}><Download className="w-3.5 h-3.5 text-muted-foreground" /> JSON (.json)</button>
          </div>
        </>
      )}
    </div>
  );
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg max-w-lg w-full p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sv-icon.svg" alt="" width={36} height={36} className="w-9 h-9 shrink-0" />
          <div>
            <h2 className="text-[18px] font-semibold leading-tight">Source Variorum</h2>
            <p className="text-[11px] text-muted-foreground">A braided collation workbench · v{APP_VERSION} · by David M. Berry</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-muted" title="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3 text-[13px] leading-relaxed text-foreground/85">
          <p>A <em>variorum</em> (from <em>cum notis variorum</em>) collates all known variants of a text so a reader can track how textual decisions were made. Source Variorum brings that apparatus of textual criticism to computational close reading, in two modes — source code and prose.</p>
          <p>Load several witnesses into a project, pick any two for the left and right panels, and read the <strong>braid</strong> between them: ribbons connecting matching passages, including text that has <strong>moved</strong>. Variants are typed and gathered into an editable critical apparatus. Edit witness text to correct errors, annotate with ⌘/Ctrl-click, and save or export the project.</p>
          <p className="text-[12px] text-muted-foreground">Design lineage: Juxta, the Versioning Machine, and dotplot alignment views. Local-first, no model calls.</p>
        </div>
        <div className="mt-5 pt-4 border-t border-border flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ch-mark.svg" alt="" width={16} height={16} className="w-4 h-4 opacity-80" />
          <span className="text-[12px] text-muted-foreground">Part of the <a href="https://computational-hermeneutics.github.io" target="_blank" rel="noreferrer" className="text-primary hover:underline">Computational Hermeneutics</a> family</span>
        </div>
      </div>
    </div>
  );
}
