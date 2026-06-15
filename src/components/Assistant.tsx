"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, RotateCw } from "lucide-react";
import type { CollationMode } from "@/types/collation";
import { poolFor } from "@/data/assistant-messages";

/** A friendly paperclip with eyes — the Clippy homage, in Source Variorum colours. */
function ClipGlyph({ className = "w-9 h-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 56" className={className} aria-hidden="true">
      <path d="M13 17 a7 7 0 0 1 14 0 v25 a6 6 0 0 1 -12 0 v-21 a3 3 0 0 1 6 0 v19" fill="none" stroke="var(--primary)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16.5" cy="17" r="3.3" fill="#fff" stroke="#3a3a3a" strokeWidth="1" />
      <circle cx="24.5" cy="17" r="3.3" fill="#fff" stroke="#3a3a3a" strokeWidth="1" />
      <circle cx="17.2" cy="17.6" r="1.3" fill="#2a2a2a" />
      <circle cx="25.2" cy="17.6" r="1.3" fill="#2a2a2a" />
    </svg>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

/**
 * The Source Variorum assistant. Pops a witty / scholarly tip in a speech bubble,
 * rotating through a mode-aware pool (CodeX vs TextX) without repeating until the
 * pool is exhausted. Auto-advances slowly; can be dismissed (and re-summoned) or
 * turned off entirely.
 */
export function Assistant({ mode, enabled, onDisable }: { mode: CollationMode; enabled: boolean; onDisable: () => void }) {
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

  if (!enabled) return null;

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title="Show the assistant" className="fixed bottom-8 right-3 z-40 p-1 rounded-full bg-card/90 border border-border shadow-md hover:bg-muted">
        <ClipGlyph className="w-5 h-7" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-8 right-3 z-40 flex items-end gap-1">
      <div className="relative max-w-[280px] rounded-xl rounded-br-sm bg-card border border-border shadow-lg pl-3 pr-7 py-2">
        <p className="text-[12px] leading-snug text-foreground/90">{msg}</p>
        <button onClick={onDisable} className="mt-1 text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">turn off</button>
        <div className="absolute top-1 right-1 flex flex-col gap-0.5">
          <button onClick={next} title="Tell me another" className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"><RotateCw className="w-3 h-3" /></button>
          <button onClick={() => setOpen(false)} title="Dismiss" className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"><X className="w-3 h-3" /></button>
        </div>
      </div>
      <ClipGlyph />
    </div>
  );
}
