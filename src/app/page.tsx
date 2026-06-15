"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun, X, RotateCcw, Spline, BarChart3, Search, ChevronUp, ChevronDown, ChevronRight, ListTree, Code2, Type } from "lucide-react";
import type { Collation, CollationMode, VariantType, Witness } from "@/types/collation";
import { VARIANT_TYPES, VARIANT_TYPE_COLORS, variantLabel, WITNESS_FOLDER } from "@/types/collation";
import { MenuBar, type Menu, type MenuEntry } from "@/components/MenuBar";
import { CollationView } from "@/components/collation/CollationView";
import { type BraidViz, DEFAULT_BRAID_VIZ } from "@/components/collation/BraidGutter";
import { SourceOrganiser } from "@/components/collation/SourceOrganiser";
import { useProject } from "@/hooks/useProject";
import { DEMOS, type Demo, type DemoWitness } from "@/data/demos";
import { APP_VERSION } from "@/lib/version";
import { LANGS, detectLang } from "@/lib/highlight";
import { DEFAULT_NORMALIZE, type NormalizeOptions } from "@/lib/collate/similarity";
import { computeHotspots } from "@/lib/collate/hotspots";
import { computeEddy } from "@/lib/collate/eddy";
import { looksLikeXml, teiToPlainText } from "@/lib/import/tei";
import { normalizeNewlines } from "@/lib/utils";
import { deriveView, download, parseProjectFile, slugify, toJSON, toMarkdown, toAnnotationsMarkdown, toPDF, toBraidPDF, toTEI } from "@/lib/export/collation-export";

const CURRENT_KEY = "source-variorum-current";
const FONT_KEY = "source-variorum-fontsize";
const LANG_KEY = "source-variorum-lang";
const USER_KEY = "source-variorum-user";
const TOKENIZER_KEY = "source-variorum-tokenizer";
const DETECT_MOVES_KEY = "source-variorum-detect-moves";
const BRAID_VIZ_KEY = "source-variorum-braid-viz";
const ENGINE_OPTS_KEY = "source-variorum-engine-opts";

/** Engine-level (non-normalisation) braid options. `looseThreshold` is the
 *  TX-Engine sub-pairing sensitivity (lower = pair reworded sentences more
 *  eagerly); it maps to the engine's subThreshold in text mode only. */
type EngineOpts = { segmentByLine: boolean; ignoreBlankLines: boolean; looseThreshold: number };
const DEFAULT_ENGINE_OPTS: EngineOpts = { segmentByLine: false, ignoreBlankLines: false, looseThreshold: 0.2 };

/** A small glyph for each engine — CX (code) and TX (text) — reused in Help,
 *  Analyse ▸ Engines, and Settings so the two engines read as one identity. */
function EngineIcon({ engine, className = "w-3.5 h-3.5" }: { engine: CollationMode; className?: string }) {
  return engine === "source" ? <Code2 className={className} /> : <Type className={className} />;
}

function uid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  }
}

function witnessFrom(w: DemoWitness, id: string, text: string): Witness {
  return { id, siglum: w.siglum, title: w.title, provenance: w.provenance, date: w.date, author: w.author, folder: w.folder, reference: w.reference, lang: w.lang, text, original: text };
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

const STARTER_README = `# New collation

A **Source Variorum** project. A few things to get started:

- **Witnesses** — the texts you compare live in the **Witnesses** folder. Only
  these appear in the two panel dropdowns. Replace *Witness A* / *Witness B* with
  your own (paste, drop a file, or load a sample), or add more.
- **Reference** — anything *outside* the Witnesses folder (like this read-me) is
  reference material. Click it to open it in the reader; it never loads into a
  compare panel.
- **Compare** — pick any two witnesses for the left and right panels; the
  **braid** between them shows matches, substitutions, additions, deletions, and
  moved passages.
- **Mode** — switch between **Code** and **Text** in the View menu: code is read
  literally, line by line; prose is read smartly, sentence by sentence.
- **Annotate** — ⌘/Ctrl-click a line to add a note; the **Analyse** menu has the
  change overview, deep dive, and other statistics.

Delete this read-me whenever you like.`;

function blankCollation(mode: CollationMode): Collation {
  return makeCollation("Untitled collation", mode, [
    { id: uid(), siglum: "A", title: "Witness A", text: "", folder: WITNESS_FOLDER },
    { id: uid(), siglum: "B", title: "Witness B", text: "", folder: WITNESS_FOLDER },
    { id: uid(), siglum: "ℹ", title: "Read me", reference: true, text: STARTER_README, original: STARTER_README },
  ]);
}

// First-load sample when nothing is saved. A light two-witness text demo, not
// the 25-file Spacewar corpus.
const DEFAULT_DEMO = DEMOS.find((d) => d.id === "phaedrus") ?? DEMOS[0];

export default function Home() {
  // Start from a neutral empty collation so nothing misleading (e.g. a stale
  // sample name) flashes before the saved project / default sample hydrates.
  const project = useProject(useMemo(() => blankCollation("text"), []));
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
  const [detectMoves, setDetectMoves] = useState(true);
  const [braidViz, setBraidViz] = useState<BraidViz>(DEFAULT_BRAID_VIZ);
  const [engineOpts, setEngineOpts] = useState<EngineOpts>(DEFAULT_ENGINE_OPTS);
  const [showEngines, setShowEngines] = useState(false);
  const [visibleTypes, setVisibleTypes] = useState<Set<VariantType>>(() => new Set(VARIANT_TYPES));
  const [showDeepDive, setShowDeepDive] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [showApparatus, setShowApparatus] = useState(false);
  const [showStats, setShowStats] = useState(false);
  // The overview strip can show any combination of three columns (or none).
  const [stripCols, setStripCols] = useState({ minimap: true, variants: true, hotspots: false });
  const setStripCol = (k: "minimap" | "variants" | "hotspots", v: boolean) =>
    setStripCols((prev) => {
      const next = { ...prev, [k]: v };
      try { localStorage.setItem("source-variorum-strip-cols", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  const stripVisible = stripCols.minimap || stripCols.variants || stripCols.hotspots;
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const setSidebarHiddenP = (v: boolean) => { setSidebarHidden(v); try { localStorage.setItem("source-variorum-sidebar-hidden", v ? "1" : "0"); } catch { /* ignore */ } };
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const scrollTop = () => { mainRef.current?.scrollTo({ top: 0 }); document.querySelectorAll("[data-sv-scroll]").forEach((el) => (el as HTMLElement).scrollTo({ top: 0 })); };

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
      const dm = localStorage.getItem(DETECT_MOVES_KEY);
      if (dm != null) setDetectMoves(dm === "1");
      const bv = localStorage.getItem(BRAID_VIZ_KEY);
      if (bv) setBraidViz({ ...DEFAULT_BRAID_VIZ, ...JSON.parse(bv) });
      const eo = localStorage.getItem(ENGINE_OPTS_KEY);
      if (eo) setEngineOpts({ ...DEFAULT_ENGINE_OPTS, ...JSON.parse(eo) });
      const sc = localStorage.getItem("source-variorum-strip-cols");
      if (sc) setStripCols((prev) => ({ ...prev, ...JSON.parse(sc) }));
      if (localStorage.getItem("source-variorum-sidebar-hidden") === "1") setSidebarHidden(true);
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

  // Engine knobs beyond normalize + move toggle (loose-pairing is TX-only).
  const extra = useMemo(() => ({
    segmentByLine: engineOpts.segmentByLine,
    ignoreBlankLines: engineOpts.ignoreBlankLines,
    subThreshold: collation.mode === "text" ? engineOpts.looseThreshold : undefined,
  }), [engineOpts, collation.mode]);

  // ----- The derived view runs in a Web Worker so a slow recompute never freezes
  // the UI: the page stays live, a progress bar shows, and the user can CANCEL
  // mid-compute (terminating the worker). The FIRST view is computed synchronously
  // so `view` is never null and the panels have something to render immediately;
  // every later recompute is handed to the worker. Falls back to synchronous
  // compute if workers are unavailable. -----
  const [view, setView] = useState(() => deriveView(collation, tokenizer, detectMoves, extra));
  const [computing, setComputing] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const jobIdRef = useRef(0);
  const inputsRef = useRef({ collation, tokenizer, detectMoves, engineOpts });
  const appliedRef = useRef({ collation, tokenizer, detectMoves, engineOpts });
  inputsRef.current = { collation, tokenizer, detectMoves, engineOpts };

  useEffect(() => {
    let w: Worker | null = null;
    try {
      w = new Worker(new URL("../lib/collate/view.worker.ts", import.meta.url));
      w.onmessage = (e: MessageEvent<{ id: number; ok: boolean; view?: ReturnType<typeof deriveView> }>) => {
        if (e.data.id !== jobIdRef.current) return; // a newer job superseded this one
        if (e.data.ok && e.data.view) { setView(e.data.view); appliedRef.current = inputsRef.current; }
        setComputing(false);
      };
      workerRef.current = w;
    } catch { workerRef.current = null; /* no worker → synchronous fallback below */ }
    return () => { w?.terminate(); workerRef.current = null; };
  }, []);

  // Recompute whenever the inputs change (skip when they already match the view).
  useEffect(() => {
    const ap = appliedRef.current;
    if (collation === ap.collation && tokenizer === ap.tokenizer && detectMoves === ap.detectMoves && engineOpts === ap.engineOpts) return;
    const w = workerRef.current;
    if (!w) { // synchronous fallback (no worker support)
      setView(deriveView(collation, tokenizer, detectMoves, extra));
      appliedRef.current = inputsRef.current;
      return;
    }
    const id = ++jobIdRef.current;
    setComputing(true);
    w.postMessage({ id, collation, normalize: tokenizer, detectMoves, extra });
  }, [collation, tokenizer, detectMoves, engineOpts, extra]);

  // Cancel an in-flight recompute: kill the worker, restore a fresh one, and roll
  // the option toggles back to what produced the view on screen (ref-equal, so it
  // won't kick off another recompute).
  const cancelCompute = useCallback(() => {
    workerRef.current?.terminate();
    jobIdRef.current++; // invalidate the cancelled job
    try { workerRef.current = new Worker(new URL("../lib/collate/view.worker.ts", import.meta.url)); workerRef.current.onmessage = (e: MessageEvent<{ id: number; ok: boolean; view?: ReturnType<typeof deriveView> }>) => { if (e.data.id !== jobIdRef.current) return; if (e.data.ok && e.data.view) { setView(e.data.view); appliedRef.current = inputsRef.current; } setComputing(false); }; } catch { workerRef.current = null; }
    const ap = appliedRef.current;
    setTokenizer(ap.tokenizer);
    setDetectMoves(ap.detectMoves);
    setEngineOpts(ap.engineOpts);
    setComputing(false);
  }, []);

  // Force a fresh auto-collation recompute (DANGER ▸ Re-run auto), bypassing the
  // "inputs unchanged" skip — useful to refresh after anything stale.
  const rerunAuto = useCallback(() => {
    const w = workerRef.current;
    if (!w) { setView(deriveView(collation, tokenizer, detectMoves, extra)); appliedRef.current = inputsRef.current; return; }
    const id = ++jobIdRef.current;
    setComputing(true);
    w.postMessage({ id, collation, normalize: tokenizer, detectMoves, extra });
  }, [collation, tokenizer, detectMoves, extra]);

  // Version hotspots (base vs every other witness, aggregated): only meaningful
  // with 3+ witnesses, and only computed when the overview is actually open so we
  // don't pay for N collations on every project.
  const needHotspots = showOverview || stripCols.hotspots;
  const hotspots = useMemo(
    () => (needHotspots ? computeHotspots(collation, tokenizer) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [needHotspots, collation.witnesses, collation.leftId, collation.mode, tokenizer]
  );
  // Per-version Eddy ranking (cheap text-bigram distance) — only while the
  // overview is open.
  const eddy = useMemo(
    () => (showOverview ? computeEddy(collation, tokenizer) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showOverview, collation.witnesses, tokenizer]
  );

  const setDetectMovesP = (val: boolean) => {
    setDetectMoves(val);
    try { localStorage.setItem(DETECT_MOVES_KEY, val ? "1" : "0"); } catch { /* ignore */ }
  };
  const setBraidVizOpt = <K extends keyof BraidViz>(key: K, val: BraidViz[K]) => {
    setBraidViz((prev) => {
      const next = { ...prev, [key]: val };
      try { localStorage.setItem(BRAID_VIZ_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const setEngineOpt = <K extends keyof EngineOpts>(key: K, val: EngineOpts[K]) => {
    setEngineOpts((prev) => {
      const next = { ...prev, [key]: val };
      try { localStorage.setItem(ENGINE_OPTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const setTokenizerOpt = (key: keyof NormalizeOptions, val: boolean) => {
    setTokenizer((prev) => {
      const next = { ...prev, [key]: val };
      try { localStorage.setItem(TOKENIZER_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // Per-panel code language (derived): a per-witness override wins, else the
  // filename's auto-detected language, else the Settings default.
  const langFor = (w: Witness | undefined): string => (w ? langOverrides[w.id] ?? w.lang ?? detectLang(w.title) ?? lang : lang);
  const langA = langFor(view.a);
  const langB = langFor(view.b);
  const chooseLangA = (id: string) => { if (view.a) setLangOverrides((o) => ({ ...o, [view.a!.id]: id })); };
  const chooseLangB = (id: string) => { if (view.b) setLangOverrides((o) => ({ ...o, [view.b!.id]: id })); };

  // Status-bar search: count matches across both panels and step between the
  // rendered <mark> hits.
  const matchCount = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return 0;
    const count = (s: string) => { let n = 0, i = s.toLowerCase().indexOf(q); while (i >= 0) { n++; i = s.toLowerCase().indexOf(q, i + q.length); } return n; };
    return count(view.a?.text ?? "") + count(view.b?.text ?? "");
  }, [search, view.a, view.b]);
  const matchIdxRef = useRef(0);
  useEffect(() => { matchIdxRef.current = -1; }, [search]);
  const gotoMatch = (dir: number) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-sv-match]"));
    if (!els.length) return;
    matchIdxRef.current = (matchIdxRef.current + dir + els.length) % els.length;
    els[matchIdxRef.current]?.scrollIntoView({ block: "center", behavior: "smooth" });
  };

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
        { kind: "action", label: "Annotations (.md)", onClick: () => download(`${slugify(collation.name)}-annotations.md`, toAnnotationsMarkdown(collation), "text/markdown") },
        { kind: "action", label: "TEI P5 (.xml)", shortcut: "app/rdg", onClick: () => download(`${slugify(collation.name)}.xml`, toTEI(collation), "application/tei+xml") },
        { kind: "action", label: "PDF — apparatus (.pdf)", onClick: () => toPDF(collation).save(`${slugify(collation.name)}.pdf`) },
        { kind: "action", label: "PDF — side-by-side braid (.pdf)", onClick: () => toBraidPDF(collation).save(`${slugify(collation.name)}-braid.pdf`) },
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
        { kind: "checkbox", label: "Sources panel", checked: !sidebarHidden, onToggle: () => setSidebarHiddenP(sidebarHidden ? false : true) },
        { kind: "header", label: "Overview strip" },
        { kind: "checkbox", label: "Panel minimap", checked: stripCols.minimap, onToggle: () => setStripCol("minimap", !stripCols.minimap) },
        { kind: "checkbox", label: "Variant map", checked: stripCols.variants, onToggle: () => setStripCol("variants", !stripCols.variants) },
        { kind: "checkbox", label: "Version hotspots", checked: stripCols.hotspots, onToggle: () => setStripCol("hotspots", !stripCols.hotspots) },
        { kind: "separator" },
        { kind: "action", label: "Annotations & apparatus…", onClick: () => setShowApparatus(true) },
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
      label: "Analyse",
      entries: [
        { kind: "action", label: "Change overview…", onClick: () => setShowOverview(true) },
        { kind: "action", label: "Deep dive…", onClick: () => setShowDeepDive(true) },
        { kind: "separator" },
        { kind: "action", label: "Witness statistics…", onClick: () => setShowStats(true) },
        { kind: "separator" },
        { kind: "action", label: "Engines (CX · TX)…", onClick: () => setShowEngines(true) },
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
      project.addWitnesses(sources.map((s) => ({ id: uid(), siglum: s.siglum, title: s.title, text: normalizeNewlines(s.text), folder: WITNESS_FOLDER })));
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
            {/* Auto / Advanced (hand-braiding) — a cross-panel mode kept global. */}
            <div className="flex rounded border border-border overflow-hidden text-[11px]" title="Advanced: hand-edit the braid links">
              <button onClick={() => { setAdvancedMode(false); }} className={"px-2 py-1 " + (!advancedMode ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>Auto</button>
              <button onClick={() => { setAdvancedMode(true); setEditSide(null); }} className={"inline-flex items-center gap-1 px-2 py-1 " + (advancedMode ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}><Spline className="w-3 h-3" /> Advanced</button>
            </div>

            <button onClick={() => setShowApparatus(true)} className="p-1.5 rounded border border-border bg-card hover:bg-muted" title="Annotations & apparatus"><ListTree className="w-3.5 h-3.5" /></button>

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
        <SourceOrganiser project={project} demos={DEMOS} onLoadDemo={loadDemo} onAddSource={() => setShowAdd(true)} onImport={importSources} hidden={sidebarHidden} onHidden={setSidebarHiddenP} />
        <main ref={mainRef} className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col relative">
          {/* Recompute feedback: a live indeterminate bar + a Cancel control, so
              the user always knows the engine is working and can bail out of a
              slow recompute (e.g. word-order on a long text) mid-flight. */}
          {computing && (
            <div className="absolute top-0 left-0 right-0 z-30 flex items-center gap-2 px-3 py-1.5 bg-card/95 backdrop-blur border-b border-border shadow-sm">
              <div className="relative h-1 flex-1 rounded-full bg-muted overflow-hidden">
                <div className="absolute inset-y-0 w-2/5 rounded-full animate-sv-load" style={{ background: "var(--primary)" }} />
              </div>
              <span className="text-[11px] text-muted-foreground shrink-0">Recomputing the collation…</span>
              <button onClick={cancelCompute} className="shrink-0 px-2 py-0.5 rounded border border-border bg-card hover:bg-muted text-[11px]">Cancel</button>
            </div>
          )}
          <CollationView
            project={project}
            view={view}
            fontSize={fontSize}
            onFont={setFont}
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
            showApparatus={showApparatus}
            onCloseApparatus={() => setShowApparatus(false)}
            showStats={showStats}
            onCloseStats={() => setShowStats(false)}
            hotspots={hotspots}
            eddy={eddy}
            baseId={collation.leftId}
            stripCols={stripCols}
            stripVisible={stripVisible}
            onHideStrip={() => setStripCols((p) => { const next = { minimap: false, variants: false, hotspots: false }; try { localStorage.setItem("source-variorum-strip-cols", JSON.stringify(next)); } catch {} return next; })}
            search={search}
            braidViz={braidViz}
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
                {variantLabel(t, collation.mode)} <span className="font-light text-muted-foreground tabular-nums">[{view.metrics.counts[t]}]</span>
              </button>
            );
          })}
        </div>
        <span className="ml-auto inline-flex items-center gap-2 shrink-0">
          {/* Find in both panels */}
          <span className="inline-flex items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5">
            <Search className="w-3 h-3 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") gotoMatch(e.shiftKey ? -1 : 1); if (e.key === "Escape") setSearch(""); }}
              placeholder="Find…"
              className="w-28 bg-transparent outline-none text-[10px] placeholder:text-muted-foreground/60"
            />
            {search.trim().length >= 2 && (
              <>
                <span className="tabular-nums text-muted-foreground">{matchCount}</span>
                <button onClick={() => gotoMatch(-1)} disabled={!matchCount} title="Previous match (⇧Enter)" className="rounded hover:bg-muted disabled:opacity-30"><ChevronUp className="w-3 h-3" /></button>
                <button onClick={() => gotoMatch(1)} disabled={!matchCount} title="Next match (Enter)" className="rounded hover:bg-muted disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
                <button onClick={() => setSearch("")} title="Clear" className="rounded hover:bg-muted"><X className="w-3 h-3" /></button>
              </>
            )}
          </span>
          <span className="opacity-50">·</span>
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
      {showEngines && (
        <EnginesModal
          mode={collation.mode}
          onMode={project.setMode}
          tokenizer={tokenizer}
          onTokenizer={setTokenizerOpt}
          detectMoves={detectMoves}
          onDetectMoves={setDetectMovesP}
          engineOpts={engineOpts}
          onEngineOpt={setEngineOpt}
          onClose={() => setShowEngines(false)}
        />
      )}
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
          detectMoves={detectMoves}
          onDetectMoves={setDetectMovesP}
          engineOpts={engineOpts}
          onEngineOpt={setEngineOpt}
          braidViz={braidViz}
          onBraidVizOpt={setBraidVizOpt}
          braidEditCount={Object.keys(collation.variantOverrides ?? {}).length + Object.values(collation.manualLinks ?? {}).reduce((s, a) => s + a.length, 0)}
          annotationCount={Object.values(collation.annotations ?? {}).reduce((s, a) => s + a.length, 0)}
          onClearBraidEdits={project.clearAllBraidEdits}
          onRerunAuto={rerunAuto}
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
        files.map(async (f) => {
          const raw = await f.text();
          return { siglum: siglumFromName(f.name), title: f.name, text: looksLikeXml(raw, f.name) ? teiToPlainText(raw) : raw };
        })
      );
      onAddMany(sources);
      return;
    }
    const f = files[0];
    const raw = await f.text();
    setText(normalizeNewlines(looksLikeXml(raw, f.name) ? teiToPlainText(raw) : raw));
    if (!title) setTitle(f.name);
    if (!sig) setSig(siglumFromName(f.name));
  };
  const fetchUrl = async () => {
    if (!url) return;
    setBusy(true);
    try {
      const res = await fetch(url);
      const raw = await res.text();
      setText(normalizeNewlines(looksLikeXml(raw, url) ? teiToPlainText(raw) : raw));
    } catch {
      alert("Could not fetch that URL (CORS or network). Paste or upload instead.");
    } finally {
      setBusy(false);
    }
  };
  const add = () => {
    onAdd({ id: uid(), siglum: sig || "?", title: title || "Untitled witness", text: normalizeNewlines(text), folder: WITNESS_FOLDER });
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
        <label className="px-2 py-1 rounded border border-border bg-card hover:bg-muted text-[11px] cursor-pointer whitespace-nowrap" title="Choose one file to edit before adding, or several to import them all at once">File(s)<input type="file" multiple className="hidden" onChange={onFile} accept=".txt,.md,.xml,.tei,.mac,.lst,.s,.asm,.c,.js,.ts,.py,text/*" /></label>
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
          <p className="text-[12px] text-muted-foreground">Design lineage: Juxta, the Versioning Machine, and dotplot alignment views. Initial UI Design language derived from LLMbench (Vector Lab). Local-first, no model calls.</p>
          <p className="text-[9px] leading-snug text-muted-foreground/80"><strong>Inspiration:</strong> Source Variorum draws on Juxta and the Versioning Machine, and is inspired in part by the Version Variation Visualization (VVV) / Translation Arrays project at Swansea University (Tom Cheesman, Stephan Thiel, Kevin Flanagan, Zhao Geng, Alison Ehrmann, Robert S. Laramee, Jonathan Hope, David M. Berry) — for version variation and its <em>Eddy</em>/<em>Viv</em> divergence metrics, which Source Variorum reworks as its own <em>Eddy<sup>2</sup></em>/<em>Viv<sup>2</sup></em> approximations (ShakerVis, <em>Information Visualization</em> 14(4), 2013).</p>
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


function EnginesModal({
  mode,
  onMode,
  tokenizer,
  onTokenizer,
  detectMoves,
  onDetectMoves,
  engineOpts,
  onEngineOpt,
  onClose,
}: {
  mode: CollationMode;
  onMode: (m: CollationMode) => void;
  tokenizer: NormalizeOptions;
  onTokenizer: (key: keyof NormalizeOptions, val: boolean) => void;
  detectMoves: boolean;
  onDetectMoves: (val: boolean) => void;
  engineOpts: EngineOpts;
  onEngineOpt: (key: keyof EngineOpts, val: boolean | number) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<CollationMode>(mode);
  const isCX = view === "source";
  const active = mode === view;
  return (
    <ModalShell title="Engines" subtitle="Two collation engines, one per material" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-[13px]">Source Variorum collates with one of two engines. The mode picks which one runs; each segments and matches the witnesses differently, and carries its own braid options. Changing an option here recomputes the live braid.</p>
        <div className="flex items-center gap-2 flex-wrap">
          <label htmlFor="engine-pick" className="text-[12px] text-muted-foreground">Engine</label>
          <EngineIcon engine={view} className="w-4 h-4 text-primary" />
          <select id="engine-pick" value={view} onChange={(e) => setView(e.target.value as CollationMode)} className="rounded border border-border bg-card hover:bg-muted text-[12px] px-2 py-1">
            <option value="source">CodeX (CX) — code &amp; exact collation</option>
            <option value="text">TextX (TX) — prose, verse &amp; translation</option>
          </select>
          {active ? (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">Active</span>
          ) : (
            <button onClick={() => onMode(view)} className="text-[11px] px-2.5 py-1 rounded border border-border bg-card hover:bg-muted">Make active</button>
          )}
        </div>

        <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold"><EngineIcon engine={view} className="w-4 h-4 text-primary" />{isCX ? "CodeX — the CX-Engine" : "TextX — the TX-Engine"}</h3>
          {isCX ? (
            <ul className="list-disc pl-5 space-y-1 text-[12.5px]">
              <li><strong>Unit:</strong> the <strong>line</strong>. Monospace, literal reading.</li>
              <li><strong>Matching:</strong> source is near one-to-one, so it trusts exact line correspondence; only genuinely-alike leftover lines pair (a renamed label, a changed operand), otherwise a clean <strong>addition</strong>/<strong>deletion</strong>. A block is <strong>moved</strong> only when near-identical.</li>
              <li><strong>Good for:</strong> program listings, versions of a source file, disassemblies, and <strong>exact textual collation</strong> (diplomatic transcriptions) — wherever structure and the literal tokens matter.</li>
            </ul>
          ) : (
            <ul className="list-disc pl-5 space-y-1 text-[12.5px]">
              <li><strong>Unit:</strong> the <strong>sentence</strong> (or line, for verse). Proportional type, smart reading.</li>
              <li><strong>Matching:</strong> prose is routinely rephrased, so it pairs loosely — a reworded sentence stays one <strong>substitution</strong> locus rather than an unrelated delete-plus-add — and accepts fuzzier <strong>moves</strong>. Correspondence is semantic, not positional.</li>
              <li><strong>Good for:</strong> <strong>prose, verse, and translation</strong> — editions, drafts, and parallel renderings where the &ldquo;same&rdquo; passage is said differently.</li>
            </ul>
          )}
        </div>

        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">{isCX ? "CodeX options" : "TextX options"}</h4>
          <div className="divide-y divide-border">
            {isCX ? (
              <>
                <SettingsRow label="Ignore comments" hint="Strip ; // # /* … */ before matching, so a re-/de-commented line still aligns.">
                  <Toggle on={!!tokenizer.ignoreComments} onClick={() => onTokenizer("ignoreComments", !tokenizer.ignoreComments)} />
                </SettingsRow>
                <SettingsRow label="Ignore blank lines" hint="Drop blank lines before aligning, so added/removed spacing isn't an addition/deletion.">
                  <Toggle on={engineOpts.ignoreBlankLines} onClick={() => onEngineOpt("ignoreBlankLines", !engineOpts.ignoreBlankLines)} />
                </SettingsRow>
                <SettingsRow label="Detect moved blocks" hint="Recover relocated code as a transposition. Off ⇒ a tighter add/delete braid.">
                  <Toggle on={detectMoves} onClick={() => onDetectMoves(!detectMoves)} />
                </SettingsRow>
              </>
            ) : (
              <>
                <SettingsRow label="Regularise spelling" hint="Fold early-modern ↔ modern orthography (long-s, u/v, i/j, vv→w, doubled letters, final -e). Aggressive — can over-merge.">
                  <Toggle on={!!tokenizer.regulariseSpelling} onClick={() => onTokenizer("regulariseSpelling", !tokenizer.regulariseSpelling)} />
                </SettingsRow>
                <SettingsRow label="Word-order insensitive" hint="Compare readings as a bag of words, so a reordered clause counts as the same reading.">
                  <Toggle on={!!tokenizer.ignoreWordOrder} onClick={() => onTokenizer("ignoreWordOrder", !tokenizer.ignoreWordOrder)} />
                </SettingsRow>
                <SettingsRow label="Match singular/plural" hint="Fold a regular plural to its singular (lambs≈lamb, lovers≈lover), so number alone isn't a variant.">
                  <Toggle on={!!tokenizer.matchPluralSingular} onClick={() => onTokenizer("matchPluralSingular", !tokenizer.matchPluralSingular)} />
                </SettingsRow>
                <SettingsRow label="Segment by line (verse)" hint="Align line by line instead of sentence by sentence — for verse and drama.">
                  <Toggle on={engineOpts.segmentByLine} onClick={() => onEngineOpt("segmentByLine", !engineOpts.segmentByLine)} />
                </SettingsRow>
                <SettingsRow label="Ignore accidentals" hint="Treat punctuation as non-substantive (the substantives/accidentals distinction).">
                  <Toggle on={tokenizer.ignorePunctuation} onClick={() => onTokenizer("ignorePunctuation", !tokenizer.ignorePunctuation)} />
                </SettingsRow>
                <SettingsRow label="Detect moved passages" hint="Recover relocated prose as a transposition. Off ⇒ plain addition/omission.">
                  <Toggle on={detectMoves} onClick={() => onDetectMoves(!detectMoves)} />
                </SettingsRow>
                <SettingsRow label="Loose pairing" hint={`How eagerly to pair reworded sentences as one substitution (lower = more eager). Now ${engineOpts.looseThreshold.toFixed(2)}.`}>
                  <input type="range" min={5} max={70} step={5} value={Math.round(engineOpts.looseThreshold * 100)} onChange={(e) => onEngineOpt("looseThreshold", parseInt(e.target.value, 10) / 100)} className="w-24 accent-primary" aria-label="Loose pairing sensitivity" />
                </SettingsRow>
              </>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">Shared normalisation (ignore case / punctuation / whitespace) and more options live in <strong>Settings ▸ {isCX ? "CodeX" : "TextX"}</strong>.</p>
        </div>
      </div>
    </ModalShell>
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
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Two engines: CodeX (CX) &amp; TextX (TX)</h3>
          <p>The mode (View menu or Settings) selects which <strong>engine</strong> collates the witnesses. It changes both the typography <em>and</em> how the braid is computed, because the two materials behave differently. See <strong>Analyse ▸ Engines (CX · TX)</strong> for each engine&rsquo;s settings.</p>
          <ul className="list-disc pl-5 space-y-1 mt-1.5">
            <li><EngineIcon engine="source" className="inline w-3.5 h-3.5 align-text-bottom mr-0.5 text-primary" />The <strong>CodeX</strong> engine (CX, for code and <em>exact</em> textual collation) aligns <strong>line by line</strong> in monospace and reads <strong>literally</strong>: source is close to one-to-one, so it trusts exact line correspondence, only pairs leftover lines that are genuinely alike (a renamed label, a changed operand), and otherwise marks a clean <strong>addition</strong> or <strong>deletion</strong>; a block counts as <strong>moved</strong> only when near-identical. Options: <em>ignore comments</em>, <em>detect moved blocks</em>. The braid stays tight and faithful to the listing.</li>
            <li><EngineIcon engine="text" className="inline w-3.5 h-3.5 align-text-bottom mr-0.5 text-primary" />The <strong>TextX</strong> engine (TX, for prose, verse, and translation) aligns <strong>sentence by sentence</strong> in proportional type and reads <strong>smartly</strong>: prose is discourse, so the &ldquo;same&rdquo; passage is routinely rephrased. It pairs much more loosely, so a reworded sentence still registers as one <strong>substitution</strong> locus rather than an unrelated delete-plus-add, and it accepts fuzzier <strong>moves</strong>. Options: <em>regularise spelling</em> (old↔modern), <em>ignore accidentals</em>. Correspondence here is semantic, not positional.</li>
          </ul>
          <p className="text-[12px] text-muted-foreground mt-1.5">Both share one similarity primitive (Sørensen–Dice over character bigrams) and the Juxta-style normalisation toggles; the engines differ in their unit of alignment, their matching thresholds, and their per-engine options (Settings ▸ CodeX / TextX).</p>
        </section>
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Confidence</h3>
          <p>Most braids are not certain — when the engine pairs two readings that are not identical (a reworded sentence, a renamed label, a moved block) it is making a judgement, scored by how alike the two sides are. That score is the braid&rsquo;s <strong>confidence</strong>: 100% for a verbatim match, lower for a fuzzy pairing. One-sided additions and omissions have no pairing to doubt, so they stay solid.</p>
          <p className="mt-1.5">Confidence shows in the braid as <strong>line texture</strong> (and tone): a <strong>solid</strong> ribbon is a firm correspondence, a <strong>dashed</strong>, slightly-faded one is medium, and a <strong>dotted</strong>, fainter one is the engine&rsquo;s loose guess — hover any ribbon to read its exact %. The band cut-offs are yours to set in <strong>Settings ▸ Braid</strong>, where you can also <em>hide</em> braids below a confidence you choose (which also drops their panel highlighting), fade the ribbons, or drop long-distance ones. (Confidence is the pairing similarity — Sørensen–Dice over character bigrams; see Analyse ▸ Deep dive for the per-locus figures.)</p>
        </section>
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Variant types</h3>
          <p>Every locus is typed by what kind of difference it records, relative to the base (left) witness. The legend in the status bar colours and counts them; click a type there to show/hide it.</p>
          <ul className="space-y-1 mt-1.5">
            {[
              ["match", "Match", "Verbatim — the same reading in the same place. Untinted, so the eye rests on what changed."],
              ["substitution", "Substitution", "The workhorse: both witnesses have text at this locus but the reading DIFFERS — a genuinely different wording (a reworded sentence, a renamed label). Word-level tinting marks just the words that differ."],
              ["variant", "Variant", "A near-identical substitution (above the variant threshold) — a small or fuzzy difference (a spelling, a single word, an inflection) rather than a full rewording. The quiet cousin of Substitution."],
              ["addition", "Addition", "Text present only in the RIGHT (B) witness — added relative to the base."],
              ["deletion", "Omission / Deletion", "Text present only in the BASE (A) and absent from B — dropped. Shown as “Omission” in TextX (the apparatus term) and “Deletion” in CodeX (the version-diff term)."],
              ["transposition", "Transposition", "The same (or near-identical) text MOVED to a different position — a relocated block, drawn as a crossing ribbon. The analytical payload: it shows reordering, not just change."],
            ].map(([t, label, desc]) => (
              <li key={t} className="flex gap-2">
                <span className="shrink-0 w-2 h-2 rounded-full mt-1.5" style={{ background: VARIANT_TYPE_COLORS[t as VariantType] }} />
                <span><strong>{label}.</strong> {desc}</span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-muted-foreground mt-1.5">So <strong>Substitution</strong> vs the rest: Substitution and Variant are <em>two-sided</em> (both witnesses read here, differently); Addition and Omission are <em>one-sided</em> (text exists on only one side); Transposition is <em>two-sided but displaced</em> (same text, moved); Match is <em>two-sided and identical</em>. Substitution is simply the case where the readings correspond but the words differ — the most common thing in translations and revisions.</p>
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
          <details className="group">
            <summary className="flex items-center gap-1.5 cursor-pointer list-none text-[12px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
              <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
              Eddy<sup>2</sup> &amp; Viv<sup>2</sup> — our version-divergence metrics
            </summary>
            <div className="mt-2 space-y-2">
              <p><strong>Eddy<sup>2</sup></strong> and <strong>Viv<sup>2</sup></strong> are Source Variorum&rsquo;s own take on two measures from the <strong>Version Variation Visualization (VVV)</strong> project — the <em>2</em> marks them as our pairwise/aggregate reworkings, not VVV&rsquo;s vector-space originals (Eddy / Viv).</p>
              <p>VVV&rsquo;s <strong>Eddy</strong> is a single <em>version&apos;s</em> distinctiveness at a passage: the average distance between that version and all the others. A high value marks an <em>outlier</em> — the version whose wording diverges most.<br />
                <span className="font-mono text-[12px]">Eddy(D&#x2c7;) = (1/n) &Sigma;<sub>k</sub> &#8741;D&#x2c7; &minus; D<sub>k</sub>&#8741;</span></p>
              <p>VVV&rsquo;s <strong>Viv</strong> (vivacity) is a <em>passage&apos;s</em> overall instability: the average of all the Eddy values for that passage (its &ldquo;diameter&rdquo;). A high value marks a <em>hotspot</em> where the versions most disagree.<br />
                <span className="font-mono text-[12px]">Viv(i) = (1/n) &Sigma;<sub>k</sub> Eddy(D<sub>k</sub><sup>i</sup>)</span></p>
              <p className="text-[12px] text-muted-foreground">Our <strong>Eddy<sup>2</sup></strong> and <strong>Viv<sup>2</sup></strong> are <strong>cheap pairwise/aggregate approximations, not the VVV vector-space originals</strong>. <em>Eddy<sup>2</sup></em> (the version-distinctiveness ranking) is a witness&apos;s mean <span className="font-mono text-[11px]">(1 &minus; Dice-bigram)</span> lexical distance from every other witness; <em>Viv<sup>2</sup></em> (the <strong>Version hotspots</strong> overview) counts, at each point in the base text, how many witnesses diverge from the copy-text. They are heuristic, orientation-oriented measures, not canonical variant-graph computations: the numbers locate <em>where</em> and <em>which</em>, but should not be read as exact divergence distances.</p>
              <p className="text-[9px] leading-snug text-muted-foreground/80">Eddy &amp; Viv were defined by the VVV / Translation Arrays team (Tom Cheesman, Stephan Thiel, Kevin Flanagan, Zhao Geng, Alison Ehrmann, Robert S. Laramee, Jonathan Hope, David M. Berry); see ShakerVis (Geng, Cheesman, Laramee, Flanagan &amp; Thiel, <em>Information Visualization</em> 14(4), 2013) and Cheesman et al., delightedbeauty.org/vvv.</p>
            </div>
          </details>
        </section>
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Lineage</h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed">Source Variorum is part of the <a href="https://computational-hermeneutics.github.io" target="_blank" rel="noreferrer" className="text-primary hover:underline">Computational Hermeneutics</a> family of tools. As software it grows from the same codebase lineage as the <strong>Critical Code Studies Workbench (CCS-WB)</strong> and LLMbench — sharing their local-first, no-model-calls architecture and editor scaffolding — and its design draws on Juxta, the Versioning Machine, and the VVV / Translation Arrays project (see About).</p>
        </section>
      </div>
    </ModalShell>
  );
}


type SettingsTab = "user" | "appearance" | "braid" | "code" | "text" | "data";
const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "user", label: "User" },
  { id: "appearance", label: "Appearance" },
  { id: "braid", label: "Braid" },
  { id: "code", label: "CodeX" },
  { id: "text", label: "TextX" },
  { id: "data", label: "Data" },
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
  detectMoves,
  onDetectMoves,
  engineOpts,
  onEngineOpt,
  braidViz,
  onBraidVizOpt,
  braidEditCount,
  annotationCount,
  onClearBraidEdits,
  onRerunAuto,
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
  detectMoves: boolean;
  onDetectMoves: (val: boolean) => void;
  engineOpts: EngineOpts;
  onEngineOpt: (key: keyof EngineOpts, val: boolean | number) => void;
  braidViz: BraidViz;
  onBraidVizOpt: (key: keyof BraidViz, val: number) => void;
  braidEditCount: number;
  annotationCount: number;
  onClearBraidEdits: () => void;
  onRerunAuto: () => void;
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
          <span className="text-[11px] text-muted-foreground flex-1"><strong className="text-foreground/80">Reset Source Variorum.</strong> Permanently delete the autosaved working project <em>and</em> every preference stored in this browser, then reload to a clean state. Export anything you want to keep first.</span>
          <button onClick={onResetData} className="px-3 py-1.5 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 text-[12px] shrink-0">Reset everything…</button>
        </div>
      }
    >
      <div className="flex h-[21rem]">
        {/* Left tab rail — the active tab is highlighted and runs flush to the
            divider so it reads as connected to the panel it shows on the right. */}
        <nav className="shrink-0 w-28 flex flex-col gap-0.5 border-r border-border pr-3 relative z-10">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={"flex items-center gap-1.5 text-left px-2.5 py-1 text-[11.5px] rounded-md " + (tab === t.id ? "bg-primary text-primary-foreground font-semibold rounded-r-none -mr-3 pr-3" : "hover:bg-muted text-foreground/70")}
            >
              {t.id === "code" && <EngineIcon engine="source" className="w-3 h-3 shrink-0" />}
              {t.id === "text" && <EngineIcon engine="text" className="w-3 h-3 shrink-0" />}
              {t.label}
            </button>
          ))}
        </nav>

        {/* Panel content */}
        <div className="flex-1 min-w-0 pl-5 overflow-y-auto">
          {tab === "user" && (
            <div className="divide-y divide-border">
              <SettingsRow label="Your name" hint="Signs your annotations and apparatus notes.">
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
                    <button key={m} onClick={() => onMode(m)} className={"flex items-center gap-1 px-3 py-1 " + (mode === m ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}><EngineIcon engine={m} className="w-3.5 h-3.5" />{m === "source" ? "Code" : "Text"}</button>
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

          {tab === "braid" && (
            <div className="divide-y divide-border">
              <div className="pb-2 text-[11px] text-muted-foreground">How the braid ribbons are drawn. <strong>Confidence</strong> sets each ribbon&rsquo;s line texture — <span className="font-medium">solid</span> ≥{Math.round(braidViz.confHigh * 100)}%, <span className="font-medium">dashed</span> ≥{Math.round(braidViz.confMed * 100)}%, <span className="font-medium">dotted</span> below — and the cut-offs are yours to set:</div>
              <SettingsRow label="Solid at/above" hint="Confidence at which a braid is drawn as a firm, solid ribbon.">
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="tabular-nums w-9 text-right">{Math.round(braidViz.confHigh * 100)}%</span>
                  <input type="range" min={50} max={100} step={5} value={Math.round(braidViz.confHigh * 100)} onChange={(e) => onBraidVizOpt("confHigh", Math.max(braidViz.confMed + 0.05, parseInt(e.target.value, 10) / 100))} className="w-28 accent-primary" aria-label="Solid threshold" />
                </span>
              </SettingsRow>
              <SettingsRow label="Dashed at/above" hint="Confidence at which a braid is dashed (below this it is dotted).">
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="tabular-nums w-9 text-right">{Math.round(braidViz.confMed * 100)}%</span>
                  <input type="range" min={5} max={90} step={5} value={Math.round(braidViz.confMed * 100)} onChange={(e) => onBraidVizOpt("confMed", Math.min(braidViz.confHigh - 0.05, parseInt(e.target.value, 10) / 100))} className="w-28 accent-primary" aria-label="Dashed threshold" />
                </span>
              </SettingsRow>
              <SettingsRow label="Hide below confidence" hint={braidViz.hideBelowConfidence > 0 ? `Don't draw braids the engine is less than ${Math.round(braidViz.hideBelowConfidence * 100)}% sure of.` : "Draw every braid (no confidence cut)."}>
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="tabular-nums w-9 text-right">{braidViz.hideBelowConfidence > 0 ? `${Math.round(braidViz.hideBelowConfidence * 100)}%` : "off"}</span>
                  <input type="range" min={0} max={95} step={5} value={Math.round(braidViz.hideBelowConfidence * 100)} onChange={(e) => onBraidVizOpt("hideBelowConfidence", parseInt(e.target.value, 10) / 100)} className="w-28 accent-primary" aria-label="Hide below confidence" />
                </span>
              </SettingsRow>
              <SettingsRow label="Ribbon opacity" hint="Fade the braid back so the text reads through it.">
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="tabular-nums w-9 text-right">{Math.round(braidViz.opacity * 100)}%</span>
                  <input type="range" min={10} max={100} step={5} value={Math.round(braidViz.opacity * 100)} onChange={(e) => onBraidVizOpt("opacity", parseInt(e.target.value, 10) / 100)} className="w-28 accent-primary" aria-label="Ribbon opacity" />
                </span>
              </SettingsRow>
              <SettingsRow label="Hide long-distance braids" hint={braidViz.hideLongDistance > 0 ? "Hide steep ribbons that connect far-apart passages." : "Show ribbons of any reach."}>
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="tabular-nums w-9 text-right">{braidViz.hideLongDistance > 0 ? `${Math.round(braidViz.hideLongDistance * 100)}%` : "off"}</span>
                  <input type="range" min={0} max={95} step={5} value={Math.round(braidViz.hideLongDistance * 100)} onChange={(e) => onBraidVizOpt("hideLongDistance", parseInt(e.target.value, 10) / 100)} className="w-28 accent-primary" aria-label="Hide long-distance braids" />
                </span>
              </SettingsRow>
              <SettingsRow label="Cable sag (gravity)" hint={braidViz.cableSag > 0 ? "Ribbons hang like slack patch cables; short links droop most." : "Taut S-curves, no droop."}>
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="tabular-nums w-9 text-right">{braidViz.cableSag > 0 ? `${Math.round(braidViz.cableSag * 100)}%` : "off"}</span>
                  <input type="range" min={0} max={100} step={5} value={Math.round(braidViz.cableSag * 100)} onChange={(e) => onBraidVizOpt("cableSag", parseInt(e.target.value, 10) / 100)} className="w-28 accent-primary" aria-label="Cable sag" />
                </span>
              </SettingsRow>
            </div>
          )}

          {tab === "code" && (
            <div className="divide-y divide-border">
              <div className="pb-2 text-[11px] text-muted-foreground">The <strong>CodeX</strong> engine (CX) aligns <strong>line by line</strong> and reads literally — for code and exact textual collation. These options change how the braid is computed.</div>
              <SettingsRow label="Ignore comments" hint="Strip ; // # /* … */ before matching, so a re-/de-commented line still aligns.">
                <Toggle on={!!tokenizer.ignoreComments} onClick={() => onTokenizer("ignoreComments", !tokenizer.ignoreComments)} />
              </SettingsRow>
              <SettingsRow label="Ignore blank lines" hint="Drop blank lines before aligning, so added/removed spacing isn't an addition/deletion.">
                <Toggle on={engineOpts.ignoreBlankLines} onClick={() => onEngineOpt("ignoreBlankLines", !engineOpts.ignoreBlankLines)} />
              </SettingsRow>
              <SettingsRow label="Detect moved blocks" hint="Recover relocated code as a transposition. Off ⇒ a tighter add/delete braid.">
                <Toggle on={detectMoves} onClick={() => onDetectMoves(!detectMoves)} />
              </SettingsRow>
              <SettingsRow label="Default syntax language" hint="Used for code-mode witnesses when not auto-detected.">
                <select value={lang} onChange={(e) => onLang(e.target.value)} className="rounded border border-border bg-card hover:bg-muted text-[12px] px-1.5 py-1 max-w-[12rem]">
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
              </SettingsRow>
              <div className="py-2.5 text-[11px] text-muted-foreground">Per-panel language override and more CodeX options will live here.</div>
            </div>
          )}

          {tab === "text" && (
            <div className="divide-y divide-border">
              <div className="pb-2 text-[11px] text-muted-foreground">The <strong>TextX</strong> engine (TX) aligns prose <strong>sentence by sentence</strong> and reads smartly — for prose, verse, and translation. These options decide which differences count as a real variant (Juxta-style normalisation). The case / punctuation / whitespace toggles apply to both engines.</div>
              <SettingsRow label="Regularise spelling" hint="Fold early-modern ↔ modern orthography (long-s, u/v, i/j, vv→w, doubled letters, final -e) so old-spelling and modern witnesses align. Aggressive — can over-merge.">
                <Toggle on={!!tokenizer.regulariseSpelling} onClick={() => onTokenizer("regulariseSpelling", !tokenizer.regulariseSpelling)} />
              </SettingsRow>
              <SettingsRow label="Word-order insensitive" hint="Compare readings as a bag of words, so a reordered clause counts as the same reading, not a substitution.">
                <Toggle on={!!tokenizer.ignoreWordOrder} onClick={() => onTokenizer("ignoreWordOrder", !tokenizer.ignoreWordOrder)} />
              </SettingsRow>
              <SettingsRow label="Match singular/plural" hint="Fold a regular plural to its singular (lambs≈lamb, lovers≈lover), so number alone isn't a variant.">
                <Toggle on={!!tokenizer.matchPluralSingular} onClick={() => onTokenizer("matchPluralSingular", !tokenizer.matchPluralSingular)} />
              </SettingsRow>
              <SettingsRow label="Segment by line (verse)" hint="Align line by line instead of sentence by sentence — for verse and drama.">
                <Toggle on={engineOpts.segmentByLine} onClick={() => onEngineOpt("segmentByLine", !engineOpts.segmentByLine)} />
              </SettingsRow>
              <SettingsRow label="Loose pairing" hint={`How eagerly to pair reworded sentences as one substitution (lower = more eager). Now ${engineOpts.looseThreshold.toFixed(2)}.`}>
                <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="tabular-nums w-7">{engineOpts.looseThreshold.toFixed(2)}</span>
                  <input type="range" min={5} max={70} step={5} value={Math.round(engineOpts.looseThreshold * 100)} onChange={(e) => onEngineOpt("looseThreshold", parseInt(e.target.value, 10) / 100)} className="w-28 accent-primary" aria-label="Loose pairing sensitivity" />
                </span>
              </SettingsRow>
              <SettingsRow label="Detect moved passages" hint="Recover relocated prose as a transposition. Off ⇒ plain addition/omission.">
                <Toggle on={detectMoves} onClick={() => onDetectMoves(!detectMoves)} />
              </SettingsRow>
              <SettingsRow label="Ignore case" hint="“The” and “the” count as the same reading.">
                <Toggle on={tokenizer.ignoreCase} onClick={() => onTokenizer("ignoreCase", !tokenizer.ignoreCase)} />
              </SettingsRow>
              <SettingsRow label="Ignore punctuation" hint="Accidentals: commas, full stops, quotes etc. don’t count as differences.">
                <Toggle on={tokenizer.ignorePunctuation} onClick={() => onTokenizer("ignorePunctuation", !tokenizer.ignorePunctuation)} />
              </SettingsRow>
              <SettingsRow label="Ignore whitespace" hint="Reflow / indentation / extra spaces don’t count.">
                <Toggle on={tokenizer.ignoreWhitespace} onClick={() => onTokenizer("ignoreWhitespace", !tokenizer.ignoreWhitespace)} />
              </SettingsRow>
            </div>
          )}

          {tab === "data" && (
            <div className="space-y-3">
              <div className="text-[11px] text-muted-foreground">Your <strong>editorial layer</strong> — the braid edits (approve / doubt / re-type / delete / tentative + hand links) and marginal annotations — rides on top of the live auto-collation and is <strong>saved with the project</strong> (in the <code>.svar</code> file, human-readable JSON under <code>variantOverrides</code> / <code>annotations</code>). It reloads on top of the auto braid, so a project with edits opens in your edited state.</div>
              <div className="flex gap-2">
                <div className="flex-1 rounded border border-border bg-muted/20 px-3 py-2">
                  <div className="text-[18px] font-semibold tabular-nums">{braidEditCount}</div>
                  <div className="text-[11px] text-muted-foreground">braid edit{braidEditCount === 1 ? "" : "s"}</div>
                </div>
                <div className="flex-1 rounded border border-border bg-muted/20 px-3 py-2">
                  <div className="text-[18px] font-semibold tabular-nums">{annotationCount}</div>
                  <div className="text-[11px] text-muted-foreground">annotation{annotationCount === 1 ? "" : "s"}</div>
                </div>
              </div>
              <div className="rounded-lg border border-destructive/40 p-3 space-y-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-destructive">Danger zone</div>
                <SettingsRow label="Re-run auto collation" hint="Recompute the braid from the engine (your edits are kept and re-applied on top).">
                  <button onClick={onRerunAuto} className="px-2.5 py-1 rounded border border-border bg-card hover:bg-muted text-[12px]">Re-run</button>
                </SettingsRow>
                <SettingsRow label="Clear all braids" hint={`Remove every braid edit and hand link (${braidEditCount}) — back to pristine auto. Undoable.`}>
                  <button onClick={() => { if (braidEditCount === 0 || confirm(`Clear all ${braidEditCount} braid edit(s) and return to the auto-collation? (Undoable.)`)) onClearBraidEdits(); }} className="px-2.5 py-1 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 text-[12px] disabled:opacity-40" disabled={braidEditCount === 0}>Clear braids…</button>
                </SettingsRow>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}
