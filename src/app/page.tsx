"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun, X, RotateCcw, Spline, BarChart3 } from "lucide-react";
import type { Collation, CollationMode, VariantType, Witness } from "@/types/collation";
import { VARIANT_TYPES, VARIANT_TYPE_COLORS, variantLabel } from "@/types/collation";
import { MenuBar, type Menu, type MenuEntry } from "@/components/MenuBar";
import { CollationView } from "@/components/collation/CollationView";
import { SourceOrganiser } from "@/components/collation/SourceOrganiser";
import { useProject } from "@/hooks/useProject";
import { DEMOS, type Demo, type DemoWitness } from "@/data/demos";
import { APP_VERSION } from "@/lib/version";
import { LANGS, detectLang } from "@/lib/highlight";
import { DEFAULT_NORMALIZE, type NormalizeOptions } from "@/lib/collate/similarity";
import { normalizeNewlines } from "@/lib/utils";
import { deriveView, download, parseProjectFile, slugify, toJSON, toMarkdown, toPDF, toTEI } from "@/lib/export/collation-export";

const CURRENT_KEY = "source-variorum-current";
const FONT_KEY = "source-variorum-fontsize";
const LANG_KEY = "source-variorum-lang";
const USER_KEY = "source-variorum-user";
const TOKENIZER_KEY = "source-variorum-tokenizer";

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
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // Per-panel edit / annotate: only the named side enters that mode (so one
  // witness can be edited while the other is read). null = neither.
  const [editSide, setEditSide] = useState<"a" | "b" | null>(null);
  const [annotateSide, setAnnotateSide] = useState<"a" | "b" | null>(null);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [fontSize, setFontSize] = useState(13);
  // `lang` is the default code language (Settings). Per-panel language is derived
  // during render: a per-witness override (set from the panel toolbar) wins, else
  // auto-detect from the witness filename, else the default.
  const [lang, setLang] = useState<string>("none");
  const [langOverrides, setLangOverrides] = useState<Record<string, string>>({});
  const langTouched = useRef(false);
  const [userName, setUserName] = useState("");
  const [tokenizer, setTokenizer] = useState<NormalizeOptions>(DEFAULT_NORMALIZE);
  const [visibleTypes, setVisibleTypes] = useState<Set<VariantType>>(() => new Set(VARIANT_TYPES));
  const [showDeepDive, setShowDeepDive] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
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
      const lg = localStorage.getItem(LANG_KEY);
      if (lg) { setLang(lg); langTouched.current = true; }
      const un = localStorage.getItem(USER_KEY);
      if (un) setUserName(un);
      const tk = localStorage.getItem(TOKENIZER_KEY);
      if (tk) setTokenizer({ ...DEFAULT_NORMALIZE, ...JSON.parse(tk) });
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

  // The Settings "default code language": persisted, and used to seed a panel
  // whose witness filename does not auto-detect a language.
  const chooseLang = (id: string) => { langTouched.current = true; setLang(id); try { localStorage.setItem(LANG_KEY, id); } catch { /* ignore */ } };
  const changeUserName = (name: string) => { setUserName(name); try { localStorage.setItem(USER_KEY, name); } catch { /* ignore */ } };

  // Undo/redo keyboard shortcuts (skip when typing in a field — let native undo work).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return;
      if (e.key === "?") {
        e.preventDefault();
        setShowHelp(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) project.redo();
        else project.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [project]);

  const view = useMemo(() => deriveView(collation, tokenizer), [collation, tokenizer]);

  const setTokenizerOpt = (key: keyof NormalizeOptions, val: boolean) => {
    setTokenizer((prev) => {
      const next = { ...prev, [key]: val };
      try { localStorage.setItem(TOKENIZER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Per-panel code language (derived): a per-witness override wins, else the
  // filename's auto-detected language, else the Settings default.
  const langFor = (w: Witness | undefined): string => (w ? langOverrides[w.id] ?? detectLang(w.title) ?? lang : lang);
  const langA = langFor(view.a);
  const langB = langFor(view.b);
  const chooseLangA = (id: string) => { if (view.a) setLangOverrides((o) => ({ ...o, [view.a!.id]: id })); };
  const chooseLangB = (id: string) => { if (view.b) setLangOverrides((o) => ({ ...o, [view.b!.id]: id })); };

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
        { kind: "action", label: "TEI P5 (.xml)", shortcut: "app/rdg", onClick: () => download(`${slugify(collation.name)}.xml`, toTEI(collation), "application/tei+xml") },
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
        { kind: "checkbox", label: "Edit base witness", checked: editSide !== null, onToggle: () => { setEditSide((v) => (v ? null : "a")); setAdvancedMode(false); } },
        { kind: "checkbox", label: "Advanced hand-braiding", checked: advancedMode, onToggle: () => { setAdvancedMode((v) => !v); setEditSide(null); } },
        { kind: "separator" },
        { kind: "action", label: "Revert to last saved", onClick: () => { if (confirm("Revert to last saved/loaded state? Unsaved changes will be lost.")) project.revert(); }, disabled: !project.isDirty },
      ],
    },
    {
      label: "View",
      entries: [
        { kind: "header", label: "Mode" },
        { kind: "checkbox", label: "Code", checked: collation.mode === "source", onToggle: () => project.setMode("source") },
        { kind: "checkbox", label: "Text", checked: collation.mode === "text", onToggle: () => project.setMode("text") },
        { kind: "separator" },
        { kind: "action", label: "Change overview…", onClick: () => setShowOverview(true) },
        { kind: "checkbox", label: "Deep-dive panel", checked: showDeepDive, onToggle: () => setShowDeepDive((v) => !v) },
        { kind: "separator" },
        { kind: "header", label: "Text size" },
        { kind: "action", label: "Larger", shortcut: "A+", onClick: () => setFont(1) },
        { kind: "action", label: "Smaller", shortcut: "A−", onClick: () => setFont(-1) },
        { kind: "action", label: "Reset", onClick: () => setFontSize(13) },
        { kind: "separator" },
        { kind: "header", label: "Show variants" },
        ...VARIANT_TYPES.map((t): MenuEntry => ({
          kind: "checkbox",
          label: variantLabel(t, collation.mode),
          checked: visibleTypes.has(t),
          onToggle: () => toggleType(t),
          color: VARIANT_TYPE_COLORS[t],
        })),
        { kind: "separator" },
        { kind: "checkbox", label: "Dark mode", checked: isDark, onToggle: () => setIsDark((v) => !v) },
      ],
    },
    {
      label: "Help",
      entries: [
        { kind: "action", label: "Help…", shortcut: "?", onClick: () => setShowHelp(true) },
        { kind: "action", label: "Settings…", onClick: () => setShowSettings(true) },
        { kind: "separator" },
        { kind: "action", label: "About Source Variorum", onClick: () => setShowAbout(true) },
      ],
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
        <div className="px-3 py-1.5 flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-2 mr-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <button onClick={scrollTop} title="Scroll to top" className="shrink-0">
              <img src="/sv-icon.svg" alt="Source Variorum" width={24} height={24} className="w-6 h-6" />
            </button>
            <button onClick={scrollTop} title="Scroll to top" className="text-[14px] font-semibold tracking-tight hover:text-primary text-left leading-tight">Source Variorum</button>
          </div>

          <MenuBar menus={menus} />

          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            {/* Compact mode pill (also in View menu + Settings). */}
            <button
              onClick={() => project.setMode(collation.mode === "source" ? "text" : "source")}
              title="Toggle Code / Text mode (also in View menu and Settings)"
              className="px-2 py-1 rounded border border-border bg-card hover:bg-muted text-[11px] font-medium"
            >
              {collation.mode === "source" ? "Code" : "Text"}
            </button>

            {/* Auto / Advanced (hand-braiding) — a cross-panel mode kept global. */}
            <div className="flex rounded border border-border overflow-hidden text-[11px]" title="Advanced: hand-edit the braid links">
              <button onClick={() => { setAdvancedMode(false); }} className={"px-2 py-1 " + (!advancedMode ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>Auto</button>
              <button onClick={() => { setAdvancedMode(true); setEditSide(null); }} className={"inline-flex items-center gap-1 px-2 py-1 " + (advancedMode ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}><Spline className="w-3 h-3" /> Advanced</button>
            </div>

            <button onClick={() => setShowOverview(true)} className="p-1.5 rounded border border-border bg-card hover:bg-muted" title="Change overview"><BarChart3 className="w-3.5 h-3.5" /></button>

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
            editSide={editSide}
            onEditSide={setEditSide}
            annotateSide={annotateSide}
            onAnnotateSide={setAnnotateSide}
            advancedMode={advancedMode}
            visibleTypes={visibleTypes}
            onToggleType={toggleType}
            showDeepDive={showDeepDive}
            onToggleDeepDive={() => setShowDeepDive((v) => !v)}
            langA={langA}
            langB={langB}
            onLangA={chooseLangA}
            onLangB={chooseLangB}
            showOverview={showOverview}
            onCloseOverview={() => setShowOverview(false)}
            isDark={isDark}
          />
        </main>
      </div>

      <footer className="border-t border-border px-3 py-1 text-[10px] text-muted-foreground flex items-center gap-x-3 gap-y-0.5 flex-wrap">
        {/* Variation legend + counts — click a type to show/hide it in the braid. */}
        <div className="flex items-center gap-x-2.5 gap-y-0.5 flex-wrap">
          {VARIANT_TYPES.map((t) => {
            const on = visibleTypes.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                style={{ opacity: on ? 1 : 0.35 }}
                title={on ? `${variantLabel(t, collation.mode)} — shown (click to hide)` : `${variantLabel(t, collation.mode)} — hidden (click to show)`}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: VARIANT_TYPE_COLORS[t] }} />
                {variantLabel(t, collation.mode)} {view.metrics.counts[t]}
              </button>
            );
          })}
        </div>
        <span className="ml-auto inline-flex items-center gap-2 shrink-0">
          <span>v{APP_VERSION}</span>
          <span className="opacity-50">·</span>
          <a href="https://computational-hermeneutics.github.io" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ch-mark.svg" alt="" width={12} height={12} className="w-3 h-3 opacity-70" />
            Computational Hermeneutics
          </a>
        </span>
      </footer>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          isDark={isDark}
          onToggleDark={() => setIsDark((v) => !v)}
          fontSize={fontSize}
          onFont={setFont}
          onResetFont={() => setFontSize(13)}
          userName={userName}
          onUserName={changeUserName}
          lang={lang}
          onLang={chooseLang}
          mode={collation.mode}
          onMode={project.setMode}
          tokenizer={tokenizer}
          onTokenizer={setTokenizerOpt}
          onResetData={() => {
            if (!confirm("Clear all saved data (the autosaved working project and preferences) and reload? This cannot be undone.")) return;
            try {
              localStorage.removeItem(CURRENT_KEY);
              localStorage.removeItem(FONT_KEY);
            } catch {
              /* ignore */
            }
            location.reload();
          }}
        />
      )}
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


function ModalShell({ title, subtitle, onClose, children, footer }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg max-w-lg w-full max-h-[85vh] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-6 pt-5 pb-3 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold leading-tight">{title}</h2>
            {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-muted" title="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-6 py-4 overflow-y-auto text-[13px] leading-relaxed text-foreground/85">{children}</div>
        {footer && <div className="px-6 py-3 border-t border-border">{footer}</div>}
      </div>
    </div>
  );
}


function HelpModal({ onClose }: { onClose: () => void }) {
  const Key = ({ children }: { children: React.ReactNode }) => (
    <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-[11px] font-mono">{children}</kbd>
  );
  return (
    <ModalShell title="Help" subtitle="How to use Source Variorum" onClose={onClose}>
      <div className="space-y-4">
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">The braid</h3>
          <p>Two witnesses sit side by side with a central <strong>braid</strong> of ribbons connecting matching passages, including text that has <strong>moved</strong> between them. The left panel is the <strong>base</strong> (copy-text). Click any passage or ribbon to highlight the shared reading in both panels and fade the rest; click empty space to clear.</p>
        </section>
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Two modes</h3>
          <p><strong>Code</strong> is line- and token-aware in monospace; <strong>Text</strong> is sentence- and word-aware in proportional type. Switch with the <strong>Code / Text</strong> toggle (top right) or in the source actions.</p>
        </section>
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Building a collation</h3>
          <ul className="list-disc pl-5 space-y-1">
            <li>Add sources from the <strong>Sources</strong> sidebar (one, several files at once, or a sample), file them into folders, rename, or send to trash.</li>
            <li>Click a source to open it in the right panel against the left; the per-panel dropdowns set either side explicitly.</li>
            <li><strong>Edit witness text</strong> (Edit menu) to correct or normalise; every source keeps its pristine <strong>original</strong> and can be <strong>reverted</strong> or <strong>duplicated</strong> as a working copy.</li>
          </ul>
        </section>
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Auto &amp; Advanced</h3>
          <p>The collation is computed live. In <strong>Advanced</strong> mode you hand-braid: pick a passage on the left and one on the right, then choose substitution / transposition / addition / omission / match. Hand-made links override the auto braid and are marked in the apparatus.</p>
        </section>
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Apparatus, notes &amp; export</h3>
          <p>Every divergence is gathered into an editable <strong>critical apparatus</strong>. <Key>⌘</Key>/<Key>Ctrl</Key>-click any passage to attach a marginal note. Save / open projects as <code>.svar</code>, or export to Markdown, PDF, or JSON (File menu).</p>
        </section>
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Shortcuts</h3>
          <ul className="space-y-1">
            <li><Key>⌘Z</Key> / <Key>⌘⇧Z</Key> — undo / redo</li>
            <li><Key>?</Key> — open this help</li>
            <li><Key>Esc</Key> — close a dialog or clear a selection</li>
          </ul>
        </section>
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Inspiration</h3>
          <p className="text-[12px] text-muted-foreground">Source Variorum draws on Juxta and the Versioning Machine, and is inspired in part by the <strong>Version Variation Visualization (VVV) / Translation Arrays</strong> project at Swansea University (Cheesman, Laramee, Flanagan, Thiel and colleagues) — including its strong highlight colour for version variation and its <em>Eddy</em>/<em>Viv</em> divergence metrics (ShakerVis, <em>Information Visualization</em> 14(4), 2013).</p>
        </section>
      </div>
    </ModalShell>
  );
}


type SettingsTab = "user" | "appearance" | "code" | "text";
const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "user", label: "User" },
  { id: "appearance", label: "Appearance" },
  { id: "code", label: "Code" },
  { id: "text", label: "Text" },
];

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={"relative inline-flex h-5 w-9 items-center rounded-full transition-colors " + (on ? "bg-primary" : "bg-muted border border-border")}
    >
      <span className={"inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " + (on ? "translate-x-4" : "translate-x-0.5")} />
    </button>
  );
}

function SettingsRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0 flex items-center gap-2">{children}</div>
    </div>
  );
}

function SettingsModal({
  onClose,
  isDark,
  onToggleDark,
  fontSize,
  onFont,
  onResetFont,
  userName,
  onUserName,
  lang,
  onLang,
  mode,
  onMode,
  tokenizer,
  onTokenizer,
  onResetData,
}: {
  onClose: () => void;
  isDark: boolean;
  onToggleDark: () => void;
  fontSize: number;
  onFont: (delta: number) => void;
  onResetFont: () => void;
  userName: string;
  onUserName: (name: string) => void;
  lang: string;
  onLang: (id: string) => void;
  mode: CollationMode;
  onMode: (m: CollationMode) => void;
  tokenizer: NormalizeOptions;
  onTokenizer: (key: keyof NormalizeOptions, val: boolean) => void;
  onResetData: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("user");
  return (
    <ModalShell
      title="Settings"
      subtitle="Preferences are stored in this browser"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground flex-1">Saved data — the autosaved working project and your preferences.</span>
          <button onClick={onResetData} className="px-3 py-1.5 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 text-[12px] shrink-0">Clear &amp; reload…</button>
        </div>
      }
    >
      <div className="flex gap-5 min-h-[16rem]">
        {/* Left tab rail */}
        <nav className="shrink-0 w-28 flex flex-col gap-0.5">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={"text-left px-2.5 py-1.5 rounded text-[13px] " + (tab === t.id ? "bg-primary text-primary-foreground font-medium" : "hover:bg-muted text-foreground/80")}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Panel content */}
        <div className="flex-1 min-w-0">
          {tab === "user" && (
            <div className="divide-y divide-border">
              <SettingsRow label="Your name" hint="Signs annotations and apparatus notes (like CCS-WB).">
                <input
                  value={userName}
                  onChange={(e) => onUserName(e.target.value)}
                  placeholder="e.g. DMB"
                  className="w-44 bg-background border border-border rounded px-2 py-1 text-[12px]"
                />
              </SettingsRow>
              <div className="py-2.5 text-[11px] text-muted-foreground">More editorial-identity settings (initials, ORCID, signing style) will live here.</div>
            </div>
          )}

          {tab === "appearance" && (
            <div className="divide-y divide-border">
              <SettingsRow label="Mode" hint="Code (line/token, monospace) or Text (sentence/word, prose).">
                <div className="flex rounded border border-border overflow-hidden text-[12px]">
                  {(["source", "text"] as CollationMode[]).map((m) => (
                    <button key={m} onClick={() => onMode(m)} className={"px-3 py-1 " + (mode === m ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>{m === "source" ? "Code" : "Text"}</button>
                  ))}
                </div>
              </SettingsRow>
              <SettingsRow label="Theme" hint="Light or dark">
                <button onClick={onToggleDark} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-card hover:bg-muted text-[12px]">
                  {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                  {isDark ? "Dark" : "Light"}
                </button>
              </SettingsRow>
              <SettingsRow label="Panel text size" hint={`Reading panels · ${fontSize}px`}>
                <button onClick={() => onFont(-1)} className="w-7 h-7 rounded border border-border bg-card hover:bg-muted text-[12px]" title="Smaller">A−</button>
                <span className="w-9 text-center tabular-nums text-[12px]">{fontSize}px</span>
                <button onClick={() => onFont(1)} className="w-7 h-7 rounded border border-border bg-card hover:bg-muted text-[12px]" title="Larger">A+</button>
                <button onClick={onResetFont} className="ml-1 px-2 h-7 rounded border border-border bg-card hover:bg-muted text-[11px] text-muted-foreground" title="Reset to 13px">Reset</button>
              </SettingsRow>
            </div>
          )}

          {tab === "code" && (
            <div className="divide-y divide-border">
              <SettingsRow label="Default syntax language" hint="Used for code-mode witnesses when not auto-detected.">
                <select value={lang} onChange={(e) => onLang(e.target.value)} className="rounded border border-border bg-card hover:bg-muted text-[12px] px-1.5 py-1 max-w-[10rem]">
                  <option value="none">No highlighting</option>
                  {LANGS.map((l) => (
                    <option key={l.id} value={l.id}>{l.label}</option>
                  ))}
                </select>
              </SettingsRow>
              <div className="py-2.5 text-[11px] text-muted-foreground">Per-panel language override and more code options will live here.</div>
            </div>
          )}

          {tab === "text" && (
            <div className="divide-y divide-border">
              <div className="pb-2 text-[11px] text-muted-foreground">When aligning witnesses, treat these trivial differences as <em>not</em> a variant (Juxta-style tokenizer settings). Applies to both modes.</div>
              <SettingsRow label="Ignore case" hint="“The” and “the” count as the same reading.">
                <Toggle on={tokenizer.ignoreCase} onClick={() => onTokenizer("ignoreCase", !tokenizer.ignoreCase)} />
              </SettingsRow>
              <SettingsRow label="Ignore punctuation" hint="Commas, full stops, quotes etc. don’t count as differences.">
                <Toggle on={tokenizer.ignorePunctuation} onClick={() => onTokenizer("ignorePunctuation", !tokenizer.ignorePunctuation)} />
              </SettingsRow>
              <SettingsRow label="Ignore whitespace" hint="Reflow / indentation / extra spaces don’t count.">
                <Toggle on={tokenizer.ignoreWhitespace} onClick={() => onTokenizer("ignoreWhitespace", !tokenizer.ignoreWhitespace)} />
              </SettingsRow>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
