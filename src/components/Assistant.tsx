"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, RotateCw } from "lucide-react";
import type { CollationMode } from "@/types/collation";
import { poolFor, HACKERMAN } from "@/data/assistant-messages";

type Persona = "clippy" | "hacker";

/** A friendly (or hacked) paperclip — the Clippy homage, ported from LLMbench.
 *  A clean bent-paperclip body (outer wire doubling back inside) with a face
 *  sitting in the upper bend. */
function ClipGlyph({ hacker, className = "w-11 h-16" }: { hacker?: boolean; className?: string }) {
  // A grey metal paperclip (hacker: green terminal).
  const wire = hacker ? "#00ff00" : "#8a8a8a";
  const ink = hacker ? "#00ff00" : "#2a2a2a";
  return (
    <svg viewBox="0 0 60 88" className={className} aria-hidden="true">
      {/* the classic bent paperclip: an outer hairpin doubling back inside */}
      <path d="M21 24 C21 11, 45 11, 45 24 L45 66 C45 80, 17 82, 13 66 L13 30 C13 21, 35 19, 35 30 L35 60"
        fill="none" stroke={wire} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      {/* eyebrows */}
      <path d="M19 30 q5 -3.5 10 0" fill="none" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M31 30 q5 -3.5 10 0" fill="none" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
      {hacker ? (
        <>
          <rect x="19" y="35" width="9" height="4.5" rx="1" fill="#00ff00" />
          <rect x="32" y="35" width="9" height="4.5" rx="1" fill="#00ff00" />
          <path d="M23 47 Q30 51, 37 47" fill="none" stroke="#00ff00" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="24" cy="38" r="4" fill="#fff" stroke={ink} strokeWidth="1.5" />
          <circle cx="36" cy="38" r="4" fill="#fff" stroke={ink} strokeWidth="1.5" />
          <circle cx="25" cy="38.5" r="1.7" fill={ink} />
          <circle cx="37" cy="38.5" r="1.7" fill={ink} />
          <path d="M24 47 Q30 52, 36 47" fill="none" stroke={ink} strokeWidth="1.9" strokeLinecap="round" />
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
  // The wrapper is pointer-events-none so it never blocks the status bar, the
  // find box, or anything behind it; only the bubble and the glyph are clickable.
  // Sits above the status bar (bottom-10).
  return (
    <div className="fixed bottom-10 right-4 z-40 flex flex-col items-end w-[260px] max-w-[70vw] pointer-events-none">
      <div className={"relative w-full rounded-xl rounded-br-md shadow-lg pl-3 pr-7 py-2 border pointer-events-auto " + (hacker ? "bg-black border-green-500 text-green-400 font-mono" : "bg-card border-border")}>
        <p className={"text-[12px] leading-snug " + (hacker ? "" : "text-foreground/90")}>{msg}</p>
        {hacker && <p className="mt-1 text-[9px] text-green-600">type “clippy” to downgrade · h4x0r</p>}
        <div className="absolute top-1 right-1 flex flex-col gap-0.5">
          <button onClick={next} title="Tell me another" className={"p-0.5 rounded " + (hacker ? "text-green-500 hover:bg-green-900/40" : "text-muted-foreground hover:text-foreground hover:bg-muted")}><RotateCw className="w-3 h-3" /></button>
          <button onClick={() => setOpen(false)} title="Dismiss (type ‘clippy’ or ‘hacker’ to summon him back)" className={"p-0.5 rounded " + (hacker ? "text-green-500 hover:bg-green-900/40" : "text-muted-foreground hover:text-foreground hover:bg-muted")}><X className="w-3 h-3" /></button>
        </div>
      </div>
      <button onClick={next} title="Tell me another" className="mr-5 -mt-0.5 pointer-events-auto hover:scale-110 active:scale-95 transition-transform">
        <ClipGlyph hacker={hacker} className="w-11 h-16" />
      </button>
    </div>
  );
}
