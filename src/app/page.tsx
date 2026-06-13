"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun, Upload, BookOpen, X, Info, FileText, FilePlus, FolderOpen, Save, Download, ChevronDown } from "lucide-react";
import type { Collation, CollationMode, Witness } from "@/types/collation";
import { CollationView } from "@/components/collation/CollationView";
import { DEMOS, type Demo, type DemoWitness } from "@/data/demos";
import { APP_VERSION } from "@/lib/version";
import { normalizeNewlines } from "@/lib/utils";
import {
  deriveView,
  download,
  parseProjectFile,
  slugify,
  toJSON,
  toMarkdown,
  toPDF,
} from "@/lib/export/collation-export";

const CURRENT_KEY = "source-variorum-current";

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

/** Resolve a demo witness's text: inline if present, otherwise fetch the file
 *  from /public and normalise its line endings. */
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
    annotations: {},
    links: [],
    apparatusEdits: {},
    createdAt: now,
    updatedAt: now,
  };
}

/** Synchronous build for inline (text) demos — used for the initial render. */
function inlineCollation(demo: Demo): Collation {
  return makeCollation(demo.name, demo.mode, [
    witnessFrom(demo.witnessA, "a", normalizeNewlines(demo.witnessA.text ?? "")),
    witnessFrom(demo.witnessB, "b", normalizeNewlines(demo.witnessB.text ?? "")),
  ]);
}

/** Async build for any demo (resolves file-based witnesses). */
async function collationFromDemo(demoId: string): Promise<Collation> {
  const demo = DEMOS.find((d) => d.id === demoId) ?? DEMOS[0];
  const [textA, textB] = await Promise.all([
    resolveWitnessText(demo.witnessA),
    resolveWitnessText(demo.witnessB),
  ]);
  return makeCollation(demo.name, demo.mode, [
    witnessFrom(demo.witnessA, "a", textA),
    witnessFrom(demo.witnessB, "b", textB),
  ]);
}

// First render uses the first INLINE demo so the initial paint needs no fetch.
const DEFAULT_DEMO = DEMOS.find((d) => d.witnessA.text != null && d.witnessB.text != null) ?? DEMOS[0];

export default function Home() {
  const [collation, setCollation] = useState<Collation>(() => inlineCollation(DEFAULT_DEMO));
  const [isDark, setIsDark] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hydrate the working collation from localStorage after mount (SSR-safe).
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CURRENT_KEY);
      if (stored) {
        const parsed = parseProjectFile(stored);
        if (parsed) setCollation(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Autosave the working collation on every change.
  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_KEY, toJSON(collation));
    } catch {
      /* ignore quota */
    }
  }, [collation]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const view = useMemo(() => deriveView(collation), [collation]);

  const setMode = (mode: CollationMode) =>
    setCollation((c) => ({ ...c, mode, updatedAt: new Date().toISOString() }));

  const rename = (name: string) =>
    setCollation((c) => ({ ...c, name, updatedAt: new Date().toISOString() }));

  const editNote = useCallback((variantId: string, note: string) => {
    setCollation((c) => {
      const prev = c.apparatusEdits[variantId];
      return {
        ...c,
        apparatusEdits: { ...c.apparatusEdits, [variantId]: { ...prev, note } },
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const loadDemo = (id: string) => {
    setShowImport(false);
    collationFromDemo(id)
      .then(setCollation)
      .catch(() => alert("Could not load that demo's source files."));
  };

  const onLoadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const parsed = parseProjectFile(text);
    if (parsed) setCollation(parsed);
    else alert("That file is not a valid Source Variorum project (.svar / JSON).");
  };

  const saveProject = () => download(`${slugify(collation.name)}.svar`, toJSON(collation), "application/json");
  const exportMarkdown = () => download(`${slugify(collation.name)}.md`, toMarkdown(collation), "text/markdown");
  const exportJSON = () => download(`${slugify(collation.name)}.json`, toJSON(collation), "application/json");
  const exportPDF = () => toPDF(collation).save(`${slugify(collation.name)}.pdf`);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-30">
        <div className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sv-icon.svg" alt="Source Variorum" width={28} height={28} className="w-7 h-7" />
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight">Source Variorum</div>
              <a
                href="https://computational-hermeneutics.github.io"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
                title="Computational Hermeneutics family hub"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/ch-mark.svg" alt="" width={11} height={11} className="w-[11px] h-[11px] opacity-70" />
                Part of Computational Hermeneutics
              </a>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <FileMenu
              name={collation.name}
              onRename={rename}
              onNew={() => setShowImport(true)}
              onLoad={() => fileInputRef.current?.click()}
              onSave={saveProject}
              onExportMd={exportMarkdown}
              onExportJson={exportJSON}
              onExportPdf={exportPDF}
            />

            <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <BookOpen className="w-3.5 h-3.5" />
              <select
                onChange={(e) => loadDemo(e.target.value)}
                value=""
                className="bg-card border border-border rounded px-2 py-1 text-[12px] text-foreground max-w-[210px]"
              >
                <option value="" disabled>
                  Load a demo…
                </option>
                {DEMOS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex rounded border border-border overflow-hidden text-[12px]">
              {(["source", "text"] as CollationMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={
                    "px-2.5 py-1 capitalize transition-colors " +
                    (collation.mode === m ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")
                  }
                >
                  {m}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowImport((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-card hover:bg-muted text-[12px]"
            >
              <Upload className="w-3.5 h-3.5" /> Import
            </button>

            <button onClick={() => setShowAbout(true)} className="p-1.5 rounded border border-border bg-card hover:bg-muted" title="About Source Variorum">
              <Info className="w-3.5 h-3.5" />
            </button>

            <button onClick={() => setIsDark((v) => !v)} className="p-1.5 rounded border border-border bg-card hover:bg-muted" title="Toggle theme">
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </header>

      <input ref={fileInputRef} type="file" accept=".svar,.json,application/json" className="hidden" onChange={onLoadFile} />

      {showImport && (
        <ImportPanel
          onClose={() => setShowImport(false)}
          onCollate={(name, witnesses, m) => {
            setCollation(makeCollation(name, m, witnesses));
            setShowImport(false);
          }}
          initialMode={collation.mode}
        />
      )}

      <main className="flex-1">
        <CollationView
          witnessA={view.a}
          witnessB={view.b}
          mode={collation.mode}
          variants={view.variants}
          metrics={view.metrics}
          apparatusEdits={collation.apparatusEdits}
          onEditNote={editNote}
        />
      </main>

      <footer className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground flex items-center gap-2">
        <span>Source Variorum v{APP_VERSION}</span>
        <span className="opacity-50">·</span>
        <a href="https://computational-hermeneutics.github.io" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ch-mark.svg" alt="" width={12} height={12} className="w-3 h-3 opacity-70" />
          An instrument in the Computational Hermeneutics family
        </a>
      </footer>

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
    </div>
  );
}

function FileMenu({
  name,
  onRename,
  onNew,
  onLoad,
  onSave,
  onExportMd,
  onExportJson,
  onExportPdf,
}: {
  name: string;
  onRename: (s: string) => void;
  onNew: () => void;
  onLoad: () => void;
  onSave: () => void;
  onExportMd: () => void;
  onExportJson: () => void;
  onExportPdf: () => void;
}) {
  const [open, setOpen] = useState(false);
  const item = "w-full text-left px-3 py-1.5 text-[12px] hover:bg-muted flex items-center gap-2";
  const close = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-border bg-card hover:bg-muted text-[12px]"
      >
        <FileText className="w-3.5 h-3.5" /> File <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-1 w-60 z-50 bg-card border border-border rounded-md shadow-lg py-1.5">
            <div className="px-3 pb-2 pt-1">
              <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Collation name</label>
              <input
                value={name}
                onChange={(e) => onRename(e.target.value)}
                className="w-full mt-1 bg-background border border-border rounded px-2 py-1 text-[12px]"
              />
            </div>
            <div className="border-t border-border my-1" />
            <button className={item} onClick={close(onNew)}>
              <FilePlus className="w-3.5 h-3.5 text-muted-foreground" /> New collation…
            </button>
            <button className={item} onClick={close(onLoad)}>
              <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" /> Open project (.svar)…
            </button>
            <button className={item} onClick={close(onSave)}>
              <Save className="w-3.5 h-3.5 text-muted-foreground" /> Save project (.svar)
            </button>
            <div className="border-t border-border my-1" />
            <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Export</div>
            <button className={item} onClick={close(onExportMd)}>
              <Download className="w-3.5 h-3.5 text-muted-foreground" /> Markdown (.md)
            </button>
            <button className={item} onClick={close(onExportPdf)}>
              <Download className="w-3.5 h-3.5 text-muted-foreground" /> PDF (.pdf)
            </button>
            <button className={item} onClick={close(onExportJson)}>
              <Download className="w-3.5 h-3.5 text-muted-foreground" /> JSON (.json)
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function WitnessImportColumn({
  side,
  sig,
  setSig,
  title,
  setTitle,
  text,
  setText,
  url,
  setUrl,
  urlBusy,
  onFetch,
  onFile,
}: {
  side: "a" | "b";
  sig: string;
  setSig: (s: string) => void;
  title: string;
  setTitle: (s: string) => void;
  text: string;
  setText: (s: string) => void;
  url: string;
  setUrl: (s: string) => void;
  urlBusy: boolean;
  onFetch: () => void;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input value={sig} onChange={(e) => setSig(e.target.value)} className="w-16 bg-background border border-border rounded px-2 py-1 text-[12px] font-mono" placeholder="Siglum" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="flex-1 bg-background border border-border rounded px-2 py-1 text-[12px]" placeholder="Title" />
      </div>
      <div className="flex items-center gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} className="flex-1 bg-background border border-border rounded px-2 py-1 text-[11px]" placeholder="Fetch from URL…" />
        <button onClick={onFetch} disabled={urlBusy} className="px-2 py-1 rounded border border-border bg-card hover:bg-muted text-[11px] disabled:opacity-50">
          {urlBusy ? "…" : "Fetch"}
        </button>
        <label className="px-2 py-1 rounded border border-border bg-card hover:bg-muted text-[11px] cursor-pointer">
          File
          <input type="file" className="hidden" onChange={onFile} accept=".txt,.md,.mac,.lst,.s,.asm,.c,.js,.ts,.py,text/*" />
        </label>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} className="w-full h-40 bg-background border border-border rounded px-2 py-1.5 text-[12px] font-mono resize-y" placeholder={`Paste witness ${side.toUpperCase()} text…`} />
    </div>
  );
}

function ImportPanel({
  onClose,
  onCollate,
  initialMode,
}: {
  onClose: () => void;
  onCollate: (name: string, witnesses: Witness[], mode: CollationMode) => void;
  initialMode: CollationMode;
}) {
  const [mode, setMode] = useState<CollationMode>(initialMode);
  const [name, setName] = useState("Untitled collation");
  const [sigA, setSigA] = useState("A");
  const [sigB, setSigB] = useState("B");
  const [titleA, setTitleA] = useState("Witness A");
  const [titleB, setTitleB] = useState("Witness B");
  const [textA, setTextA] = useState("");
  const [textB, setTextB] = useState("");
  const [urlA, setUrlA] = useState("");
  const [urlB, setUrlB] = useState("");
  const [urlBusy, setUrlBusy] = useState<"a" | "b" | null>(null);

  const onFile = (side: "a" | "b") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (side === "a") {
      setTextA(text);
      if (titleA === "Witness A") setTitleA(file.name);
    } else {
      setTextB(text);
      if (titleB === "Witness B") setTitleB(file.name);
    }
  };

  const fetchUrl = (side: "a" | "b") => async () => {
    const url = side === "a" ? urlA : urlB;
    if (!url) return;
    setUrlBusy(side);
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (side === "a") setTextA(text);
      else setTextB(text);
    } catch {
      alert("Could not fetch that URL from the browser (CORS or network). Paste the text instead, or upload a file.");
    } finally {
      setUrlBusy(null);
    }
  };

  const collateNow = () => {
    onCollate(
      name || "Untitled collation",
      [
        { id: "a", siglum: sigA || "A", title: titleA || "Witness A", text: normalizeNewlines(textA) },
        { id: "b", siglum: sigB || "B", title: titleB || "Witness B", text: normalizeNewlines(textB) },
      ],
      mode
    );
  };

  return (
    <div className="border-b border-border bg-muted/20 px-4 py-3">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[12px] font-semibold">Import witnesses</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="bg-background border border-border rounded px-2 py-1 text-[12px] w-56" placeholder="Collation name" />
        <div className="flex rounded border border-border overflow-hidden text-[11px]">
          {(["source", "text"] as CollationMode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={"px-2 py-0.5 capitalize " + (mode === m ? "bg-primary text-primary-foreground" : "bg-card")}>
              {m}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-muted" title="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-4 flex-col md:flex-row">
        <WitnessImportColumn side="a" sig={sigA} setSig={setSigA} title={titleA} setTitle={setTitleA} text={textA} setText={setTextA} url={urlA} setUrl={setUrlA} urlBusy={urlBusy === "a"} onFetch={fetchUrl("a")} onFile={onFile("a")} />
        <WitnessImportColumn side="b" sig={sigB} setSig={setSigB} title={titleB} setTitle={setTitleB} text={textB} setText={setTextB} url={urlB} setUrl={setUrlB} urlBusy={urlBusy === "b"} onFetch={fetchUrl("b")} onFile={onFile("b")} />
      </div>
      <div className="flex justify-end mt-3">
        <button onClick={collateNow} disabled={!textA.trim() || !textB.trim()} className="px-4 py-1.5 rounded bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-50">
          Collate
        </button>
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
            <p className="text-[11px] text-muted-foreground">A braided collation workbench · v{APP_VERSION}</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-muted" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3 text-[13px] leading-relaxed text-foreground/85">
          <p>
            A <em>variorum</em> (from <em>cum notis variorum</em>) collates all known variants of a
            text so a reader can track how textual decisions were made. Source Variorum brings that
            apparatus of textual criticism to computational close reading, in two modes — source code
            and prose.
          </p>
          <p>
            Two witnesses are shown side by side with a central <strong>braid</strong>: ribbons
            connecting matching passages, including text that has <strong>moved</strong>. The crossing
            of those ribbons is the analytical payload. Variants are typed (match, substitution,
            addition, deletion, transposition, near-identical variant) and gathered into an
            auto-generated critical apparatus you can annotate, save, and export.
          </p>
          <p className="text-[12px] text-muted-foreground">
            Design lineage: Juxta, the Versioning Machine, and dotplot alignment views. Local-first,
            no model calls. Reuses the close-reading scaffolding of LLMbench.
          </p>
        </div>
        <div className="mt-5 pt-4 border-t border-border flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ch-mark.svg" alt="" width={16} height={16} className="w-4 h-4 opacity-80" />
          <span className="text-[12px] text-muted-foreground">
            Part of the{" "}
            <a href="https://computational-hermeneutics.github.io" target="_blank" rel="noreferrer" className="text-primary hover:underline">
              Computational Hermeneutics
            </a>{" "}
            family
          </span>
        </div>
      </div>
    </div>
  );
}
