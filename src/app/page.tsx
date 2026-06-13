"use client";

import { useCallback, useEffect, useState } from "react";
import { Moon, Sun, Upload, BookOpen, X } from "lucide-react";
import type { CollationMode, Witness } from "@/types/collation";
import { CollationView } from "@/components/collation/CollationView";
import { DEMOS, type DemoWitness } from "@/data/demos";
import { APP_VERSION } from "@/lib/version";

function witnessFrom(w: DemoWitness, id: string): Witness {
  return {
    id,
    siglum: w.siglum,
    title: w.title,
    provenance: w.provenance,
    date: w.date,
    text: w.text,
  };
}

export default function Home() {
  const firstDemo = DEMOS[0];
  const [witnessA, setWitnessA] = useState<Witness>(() => witnessFrom(firstDemo.witnessA, "a"));
  const [witnessB, setWitnessB] = useState<Witness>(() => witnessFrom(firstDemo.witnessB, "b"));
  const [mode, setMode] = useState<CollationMode>(firstDemo.mode);
  const [isDark, setIsDark] = useState(false);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const loadDemo = useCallback((id: string) => {
    const demo = DEMOS.find((d) => d.id === id);
    if (!demo) return;
    setWitnessA(witnessFrom(demo.witnessA, "a"));
    setWitnessB(witnessFrom(demo.witnessB, "b"));
    setMode(demo.mode);
    setShowImport(false);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card/40 backdrop-blur sticky top-0 z-30">
        <div className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
          {/* Wordmark + family lockup (placeholder until the hub assets land) */}
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-sm flex items-center justify-center font-serif text-[15px] font-bold"
              style={{ background: "var(--foreground)", color: "var(--background)" }}
              aria-hidden
            >
              SV
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight">Source Variorum</div>
              <a
                href="#"
                className="text-[10px] text-muted-foreground hover:text-foreground"
                title="Computational Hermeneutics (family hub — coming soon)"
              >
                Part of Computational Hermeneutics
              </a>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {/* Demo picker */}
            <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <BookOpen className="w-3.5 h-3.5" />
              <select
                onChange={(e) => loadDemo(e.target.value)}
                className="bg-card border border-border rounded px-2 py-1 text-[12px] text-foreground max-w-[230px]"
                defaultValue={firstDemo.id}
              >
                {DEMOS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>

            {/* Mode toggle */}
            <div className="flex rounded border border-border overflow-hidden text-[12px]">
              {(["source", "text"] as CollationMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={
                    "px-2.5 py-1 capitalize transition-colors " +
                    (mode === m ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")
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

            <button
              onClick={() => setIsDark((v) => !v)}
              className="p-1.5 rounded border border-border bg-card hover:bg-muted"
              title="Toggle theme"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </header>

      {showImport && (
        <ImportPanel
          onClose={() => setShowImport(false)}
          onCollate={(a, b, m) => {
            setWitnessA(a);
            setWitnessB(b);
            setMode(m);
            setShowImport(false);
          }}
          initialMode={mode}
        />
      )}

      <main className="flex-1">
        <CollationView witnessA={witnessA} witnessB={witnessB} mode={mode} />
      </main>

      <footer className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground flex items-center gap-2">
        <span>Source Variorum v{APP_VERSION}</span>
        <span className="opacity-50">·</span>
        <span>An instrument in the Computational Hermeneutics family</span>
      </footer>
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
        <input
          value={sig}
          onChange={(e) => setSig(e.target.value)}
          className="w-16 bg-background border border-border rounded px-2 py-1 text-[12px] font-mono"
          placeholder="Siglum"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 bg-background border border-border rounded px-2 py-1 text-[12px]"
          placeholder="Title"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 bg-background border border-border rounded px-2 py-1 text-[11px]"
          placeholder="Fetch from URL…"
        />
        <button
          onClick={onFetch}
          disabled={urlBusy}
          className="px-2 py-1 rounded border border-border bg-card hover:bg-muted text-[11px] disabled:opacity-50"
        >
          {urlBusy ? "…" : "Fetch"}
        </button>
        <label className="px-2 py-1 rounded border border-border bg-card hover:bg-muted text-[11px] cursor-pointer">
          File
          <input type="file" className="hidden" onChange={onFile} accept=".txt,.md,.mac,.lst,.s,.asm,.c,.js,.ts,.py,text/*" />
        </label>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full h-40 bg-background border border-border rounded px-2 py-1.5 text-[12px] font-mono resize-y"
        placeholder={`Paste witness ${side.toUpperCase()} text…`}
      />
    </div>
  );
}

function ImportPanel({
  onClose,
  onCollate,
  initialMode,
}: {
  onClose: () => void;
  onCollate: (a: Witness, b: Witness, mode: CollationMode) => void;
  initialMode: CollationMode;
}) {
  const [mode, setMode] = useState<CollationMode>(initialMode);
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
      { id: "a", siglum: sigA || "A", title: titleA || "Witness A", text: textA },
      { id: "b", siglum: sigB || "B", title: titleB || "Witness B", text: textB },
      mode
    );
  };

  return (
    <div className="border-b border-border bg-muted/20 px-4 py-3">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[12px] font-semibold">Import witnesses</span>
        <div className="flex rounded border border-border overflow-hidden text-[11px]">
          {(["source", "text"] as CollationMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={"px-2 py-0.5 capitalize " + (mode === m ? "bg-primary text-primary-foreground" : "bg-card")}
            >
              {m}
            </button>
          ))}
        </div>
        <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-muted" title="Close">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex gap-4 flex-col md:flex-row">
        <WitnessImportColumn
          side="a"
          sig={sigA}
          setSig={setSigA}
          title={titleA}
          setTitle={setTitleA}
          text={textA}
          setText={setTextA}
          url={urlA}
          setUrl={setUrlA}
          urlBusy={urlBusy === "a"}
          onFetch={fetchUrl("a")}
          onFile={onFile("a")}
        />
        <WitnessImportColumn
          side="b"
          sig={sigB}
          setSig={setSigB}
          title={titleB}
          setTitle={setTitleB}
          text={textB}
          setText={setTextB}
          url={urlB}
          setUrl={setUrlB}
          urlBusy={urlBusy === "b"}
          onFetch={fetchUrl("b")}
          onFile={onFile("b")}
        />
      </div>
      <div className="flex justify-end mt-3">
        <button
          onClick={collateNow}
          disabled={!textA.trim() || !textB.trim()}
          className="px-4 py-1.5 rounded bg-primary text-primary-foreground text-[12px] font-medium disabled:opacity-50"
        >
          Collate
        </button>
      </div>
    </div>
  );
}
