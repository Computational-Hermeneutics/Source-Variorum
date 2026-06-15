"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, RotateCw } from "lucide-react";
import type { CollationMode } from "@/types/collation";
import { poolFor } from "@/data/assistant-messages";

/** A friendly paperclip with eyes — the Clippy homage, in Source Variorum colours. */
function ClipGlyph({ className = "w-9 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 56" className={className} aria-hidden="true">
      <path d="M13 17 a7 7 0 0 1 14 0 v25 a6 6 0 0 1 -12 0 v-21 a3 3 0 0 1 6 0 v19" fill="none" stroke="var(--primary)" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16.5" cy="17" r="3.4" fill="#fff" stroke="#3a3a3a" strokeWidth="1.1" />
      <circle cx="24.5" cy="17" r="3.4" fill="#fff" stroke="#3a3a3a" strokeWidth="1.1" />
      <circle cx="17.2" cy="17.6" r="1.35" fill="#2a2a2a" />
      <circle cx="25.2" cy="17.6" r="1.35" fill="#2a2a2a" />
    </svg>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

/**
 * The Source Variorum assistant. Pops a witty / scholarly tip in a speech bubble
 * with the paperclip sitting just beneath it, rotating through a mode-aware pool
 * (CodeX vs TextX) without repeating until the pool is exhausted. Dismiss with the
 * ✕ and he vanishes entirely — returning at a random moment later, or instantly
 * if you type "clippy" (anywhere outside a text field). The Settings toggle is the
 * way to turn him off for good.
 */
export function Assistant({ mode, enabled }: { mode: CollationMode; enabled: boolean }) {
  const pool = useMemo(() => poolFor(mode), [mode]);
  const queueRef = useRef<string[]>([]);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(true);

  const next = useCallback(() => {
    if (queueRef.current.length === 0) {
      let q = shuffle(pool);
      if (q[0] === msg && q.length > 1) q = [...q.slice(1), q[0]]; // avoid an immediate repeat
      queueRef.current = q;
    }
    setMsg(queueRef.current.shift() ?? "");
  }, [pool, msg]);

  // Fresh shuffle (and first message) whenever the engine pool changes.
  useEffect(() => { queueRef.current = shuffle(pool); setMsg(queueRef.current.shift() ?? ""); }, [pool]);

  // Auto-advance, slowly, while open.
  useEffect(() => {
    if (!enabled || !open) return;
    const t = setInterval(next, 22000);
    return () => clearInterval(t);
  }, [enabled, open, next]);

  // While dismissed, return on his own after a random interval (90s–4min).
  useEffect(() => {
    if (!enabled || open) return;
    const t = setTimeout(() => { next(); setOpen(true); }, 90000 + Math.random() * 150000);
    return () => clearTimeout(t);
  }, [enabled, open, next]);

  // Summon by typing "clippy" anywhere that isn't a text field.
  useEffect(() => {
    if (!enabled) return;
    let buf = "";
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
        buf = (buf + e.key.toLowerCase()).slice(-6);
        if (buf === "clippy") { next(); setOpen(true); buf = ""; }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, next]);

  if (!enabled || !open) return null;

  return (
    <div className="fixed bottom-3 right-4 z-40 flex flex-col items-end w-[270px] max-w-[80vw]">
      <div className="relative w-full rounded-xl rounded-br-md bg-card border border-border shadow-lg pl-3 pr-7 py-2">
        <p className="text-[12px] leading-snug text-foreground/90">{msg}</p>
        <div className="absolute top-1 right-1 flex flex-col gap-0.5">
          <button onClick={next} title="Tell me another" className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"><RotateCw className="w-3 h-3" /></button>
          <button onClick={() => setOpen(false)} title="Dismiss (type ‘clippy’ to summon him back)" className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"><X className="w-3 h-3" /></button>
        </div>
      </div>
      <ClipGlyph className="w-8 h-11 -mt-0.5 mr-5" />
    </div>
  );
}
