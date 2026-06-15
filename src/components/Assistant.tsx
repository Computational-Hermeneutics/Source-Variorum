"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, RotateCw } from "lucide-react";
import type { CollationMode } from "@/types/collation";
import { poolFor, HACKERMAN } from "@/data/assistant-messages";

type Persona = "clippy" | "hacker";

/** A friendly (or hacked) paperclip — the Clippy homage, ported from LLMbench. */
function ClipGlyph({ hacker, className = "w-9 h-12" }: { hacker?: boolean; className?: string }) {
  const wire = hacker ? "#00ff00" : "var(--primary)";
  return (
    <svg viewBox="0 0 48 64" className={className} aria-hidden="true">
      <path d="M24 5 C13 5, 9 12, 9 20 L9 44 C9 52, 13 58, 21 58 L27 58 C35 58, 39 52, 39 44 L39 20 C39 13, 35 9, 28 9 L21 9" fill="none" stroke={wire} strokeWidth="3" strokeLinecap="round" />
      {hacker ? (
        <>
          <rect x="14" y="26" width="8" height="4" rx="1" fill="#00ff00" />
          <rect x="26" y="26" width="8" height="4" rx="1" fill="#00ff00" />
          <path d="M19 36 Q24 39, 29 36" fill="none" stroke="#00ff00" strokeWidth="1.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="18" cy="28" r="3.1" fill="#2a2a2a" />
          <circle cx="30" cy="28" r="3.1" fill="#2a2a2a" />
          <circle cx="19" cy="27" r="1.1" fill="#fff" />
          <circle cx="31" cy="27" r="1.1" fill="#fff" />
          <path d="M19 36 Q24 40, 29 36" fill="none" stroke="#2a2a2a" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

/**
 * The Source Variorum assistant (after LLMbench's Clippy). The normal persona is
 * mode-aware (CodeX vs TextX) with witty/scholarly tips; type "hacker" to summon
 * Hackerman, a green-terminal h4x0r alarmed by the collation engine's innards;
 * type "clippy" to switch back / re-summon. Dismiss with the ✕ — he returns at a
 * random moment, or instantly on a trigger word. Settings ▸ Appearance is the
 * permanent off switch.
 */
export function Assistant({ mode, enabled }: { mode: CollationMode; enabled: boolean }) {
  const [persona, setPersona] = useState<Persona>("clippy");
  const pool = useMemo(() => (persona === "hacker" ? HACKERMAN : poolFor(mode)), [persona, mode]);
  const queueRef = useRef<string[]>([]);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(true);

  const next = useCallback(() => {
    if (queueRef.current.length === 0) {
      let q = shuffle(pool);
      if (q[0] === msg && q.length > 1) q = [...q.slice(1), q[0]];
      queueRef.current = q;
    }
    setMsg(queueRef.current.shift() ?? "");
  }, [pool, msg]);

  // Fresh shuffle + first message whenever the pool (persona or engine) changes.
  useEffect(() => { queueRef.current = shuffle(pool); setMsg(queueRef.current.shift() ?? ""); }, [pool]);

  // Auto-advance while open (the hacker is more talkative... no, just slower-roll).
  useEffect(() => {
    if (!enabled || !open) return;
    const t = setInterval(next, 22000);
    return () => clearInterval(t);
  }, [enabled, open, next]);

  // While dismissed, return on his own after a random interval (90s–4min).
  useEffect(() => {
    if (!enabled || open) return;
    const t = setTimeout(() => { setOpen(true); }, 90000 + Math.random() * 150000);
    return () => clearTimeout(t);
  }, [enabled, open]);

  // Trigger words (outside text fields): "clippy" toggles / restores the normal
  // persona; "hacker" summons Hackerman.
  useEffect(() => {
    if (!enabled) return;
    let buf = "";
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key.length !== 1 || !/[a-zA-Z]/.test(e.key)) return;
      buf = (buf + e.key.toLowerCase()).slice(-6);
      if (buf === "hacker") { buf = ""; setPersona("hacker"); setOpen(true); }
      else if (buf === "clippy") { buf = ""; if (persona !== "clippy") { setPersona("clippy"); setOpen(true); } else setOpen((v) => !v); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, persona]);

  if (!enabled || !open) return null;

  const hacker = persona === "hacker";
  return (
    <div className="fixed bottom-3 right-4 z-40 flex flex-col items-end w-[280px] max-w-[80vw]">
      <div className={"relative w-full rounded-xl rounded-br-md shadow-lg pl-3 pr-7 py-2 border " + (hacker ? "bg-black border-green-500 text-green-400 font-mono" : "bg-card border-border")}>
        <p className={"text-[12px] leading-snug " + (hacker ? "" : "text-foreground/90")}>{msg}</p>
        {hacker && <p className="mt-1 text-[9px] text-green-600">type “clippy” to downgrade · h4x0r</p>}
        <div className="absolute top-1 right-1 flex flex-col gap-0.5">
          <button onClick={next} title="Tell me another" className={"p-0.5 rounded " + (hacker ? "text-green-500 hover:bg-green-900/40" : "text-muted-foreground hover:text-foreground hover:bg-muted")}><RotateCw className="w-3 h-3" /></button>
          <button onClick={() => setOpen(false)} title="Dismiss (type ‘clippy’ or ‘hacker’ to summon him back)" className={"p-0.5 rounded " + (hacker ? "text-green-500 hover:bg-green-900/40" : "text-muted-foreground hover:text-foreground hover:bg-muted")}><X className="w-3 h-3" /></button>
        </div>
      </div>
      <button onClick={next} title="Tell me another" className="mr-5 -mt-0.5 hover:scale-110 active:scale-95 transition-transform">
        <ClipGlyph hacker={hacker} className="w-8 h-11" />
      </button>
    </div>
  );
}
