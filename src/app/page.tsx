"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun, X, RotateCcw, Spline } from "lucide-react";
import type { Collation, CollationMode, VariantType, Witness } from "@/types/collation";
import { VARIANT_TYPES, VARIANT_TYPE_COLORS, variantLabel } from "@/types/collation";
import { MenuBar, type Menu, type MenuEntry } from "@/components/MenuBar";
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
  return { id, siglum: w.siglum, title: w.title, provenance: w.provenance, date: w.date, text, original: text };
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
  const [advancedMode, setAdvancedMode] = useState(false);
  const [fontSize, setFontSize] = useState(13);
  const [visibleTypes, setVisibleTypes] = useState<Set<VariantType>>(() => new Set(VARIANT_TYPES));
  const [showDeepDive, setShowDeepDive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const scrollTop = () => mainRef.current?.scrollTo({ top: 0 });

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

  const toggleType = (t: VariantType) =>
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const menus: Menu[] = [
    {
      label: "File",
      entries: [
        { kind: "action", label: "New collation…", onClick: () => project.load(blankCollation(collation.mode)) },
        { kind: "action", label: "Rename collation…", onClick: () => { const n = prompt("Collation name:", collation.name)?.trim(); if (n) project.rename(n); } },
        { kind: "separator" },
        { kind: "action", label: "Open project…", shortcut: ".svar", onClick: () => fileInputRef.current?.click() },
        { kind: "action", label: "Save project", shortcut: ".svar", onClick: saveProject },
        { kind: "separator" },
        { kind: "header", label: "Export" },
        { kind: "action", label: "Markdown (.md)", onClick: () => download(`${slugify(collation.name)}.md`, toMarkdown(collation), "text/markdown") },
        { kind: "action", label: "PDF (.pdf)", onClick: () => toPDF(collation).save(`${slugify(collation.name)}.pdf`) },
        { kind: "action", label: "JSON (.json)", onClick: () => download(`${slugify(collation.name)}.json`, toJSON(collation), "application/json") },
      ],
    },
    {
      label: "Edit",
      entries: [
        { kind: "action", label: "Undo", shortcut: "⌘Z", onClick: project.undo, disabled: !project.canUndo },
        { kind: "action", label: "Redo", shortcut: "⌘⇧Z", onClick: project.redo, disabled: !project.canRedo },
        { kind: "separator" },
        { kind: "checkbox", label: "Edit witness text", checked: editMode, onToggle: () => { setEditMode((v) => !v); setAdvancedMode(false); } },
        { kind: "checkbox", label: "Advanced hand-braiding", checked: advancedMode, onToggle: () => { setAdvancedMode((v) => !v); setEditMode(false); } },
        { kind: "separator" },
        { kind: "action", label: "Revert to last saved", onClick: () => { if (confirm("Revert to last saved/loaded state? Unsaved changes will be lost.")) project.revert(); }, disabled: !project.isDirty },
      ],
    },
    {
      label: "View",
      entries: [
        { kind: "header", label: "Text size" },
        { kind: "action", label: "Larger", shortcut: "A+", onClick: () => setFont(1) },
        { kind: "action", label: "Smaller", shortcut: "A−", onClick: () => setFont(-1) },
        { kind: "action", label: "Reset", onClick: () => setFontSize(13) },
        { kind: "separator" },
        { kind: "header", label: "Show" },
        ...VARIANT_TYPES.map((t): MenuEntry => ({
          kind: "checkbox",
          label: variantLabel(t, collation.mode),
          checked: visibleTypes.has(t),
          onToggle: () => toggleType(t),
          color: VARIANT_TYPE_COLORS[t],
        })),
        { kind: "separator" },
        { kind: "checkbox", label: "Deep-dive panel", checked: showDeepDive, onToggle: () => setShowDeepDive((v) => !v) },
        { kind: "checkbox", label: "Dark mode", checked: isDark, onToggle: () => setIsDark((v) => !v) },
      ],
    },
    {
      label: "Help",
      entries: [{ kind: "action", label: "About Source Variorum", onClick: () => setShowAbout(true) }],
    },
  ];

  const importSources = useCallback(
    (sources: { siglum: string; title: string; text: string }[]) => {
      project.addWitnesses(sources.map((s) => ({ id: uid(), siglum: s.siglum, title: s.title, text: normalizeNewlines(s.text) })));
    },
    [project]
  );

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-30">
        <div className="px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2.5 mr-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <button onClick={scrollTop} title="Scroll to top" className="shrink-0">
              <img src="/sv-icon.svg" alt="Source Variorum" width={28} height={28} className="w-7 h-7" />
            </button>
            <div className="leading-tight">
              <button onClick={scrollTop} title="Scroll to top" className="text-[15px] font-semibold tracking-tight hover:text-primary text-left">Source Variorum</button>
              <a href="https://computational-hermeneutics.github.io" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/ch-mark.svg" alt="" width={11} height={11} className="w-[11px] h-[11px] opacity-70" />
                Part of Computational Hermeneutics
              </a>
            </div>
          </div>

          <MenuBar menus={menus} />

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {/* Mode (Code/Text) */}
            <div className="flex rounded border border-border overflow-hidden text-[12px]">
              {(["source", "text"] as CollationMode[]).map((m) => (
                <button key={m} onClick={() => project.setMode(m)} className={"px-2.5 py-1 transition-colors " + (collation.mode === m ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{m === "source" ? "Code" : "Text"}</button>
              ))}
            </div>

            {/* Auto / Advanced (hand-braiding) */}
            <div className="flex rounded border border-border overflow-hidden text-[12px]" title="Advanced: hand-edit the braid links">
              <button onClick={() => { setAdvancedMode(false); }} className={"px-2.5 py-1 " + (!advancedMode ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>Auto</button>
              <button onClick={() => { setAdvancedMode(true); setEditMode(false); }} className={"inline-flex items-center gap-1 px-2.5 py-1 " + (advancedMode ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}><Spline className="w-3.5 h-3.5" /> Advanced</button>
            </div>

            {project.isDirty && (
              <button onClick={() => { if (confirm("Revert to last saved/loaded state? Unsaved changes will be lost.")) project.revert(); }} className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border bg-card hover:bg-muted text-[11px] text-muted-foreground" title="Revert to last saved project">
                <RotateCcw className="w-3.5 h-3.5" /> Revert
              </button>
            )}

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
        <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto">
          <CollationView
            project={project}
            view={view}
            fontSize={fontSize}
            editMode={editMode}
            advancedMode={advancedMode}
            visibleTypes={visibleTypes}
            onToggleType={toggleType}
            showDeepDive={showDeepDive}
            onToggleDeepDive={() => setShowDeepDive((v) => !v)}
          />
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
