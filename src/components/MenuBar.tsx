"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

/** A native-app-style menu bar (after the REF / scholar-dashboard pattern):
 *  a row of menus, each a button + popup with action / checkbox / separator /
 *  header items. Click to open, click-away or Esc to close, hover to switch
 *  while one is open. */

export type MenuEntry =
  | { kind: "action"; label: string; onClick: () => void; disabled?: boolean; shortcut?: string }
  | { kind: "checkbox"; label: string; checked: boolean; onToggle: () => void; hint?: string; color?: string }
  | { kind: "separator" }
  | { kind: "header"; label: string };

export interface Menu {
  label: string;
  entries: MenuEntry[];
}

export function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open === null) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={barRef} className="flex items-center gap-0.5" role="menubar">
      {menus.map((menu, i) => (
        <div key={menu.label} className="relative">
          <button
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => open !== null && setOpen(i)}
            className={
              "inline-flex items-center gap-0.5 px-2 py-1 rounded text-[12.5px] transition-colors " +
              (open === i ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground")
            }
          >
            {menu.label}
            <ChevronDown className={"w-3 h-3 opacity-50 transition-transform " + (open === i ? "rotate-180" : "")} />
          </button>
          {open === i && (
            <div role="menu" aria-label={menu.label} className="absolute left-0 mt-1 min-w-[14rem] z-50 bg-card border border-border rounded-md shadow-lg py-1 text-[12.5px]">
              {menu.entries.map((entry, k) => {
                if (entry.kind === "separator") return <div key={k} role="separator" className="border-t border-border my-1" />;
                if (entry.kind === "header") return <div key={k} className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">{entry.label}</div>;
                if (entry.kind === "checkbox") {
                  return (
                    <button key={k} role="menuitemcheckbox" aria-checked={entry.checked} onClick={() => { entry.onToggle(); }} className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2">
                      <span className="w-3.5 flex justify-center">{entry.checked && <Check className="w-3 h-3 text-primary" />}</span>
                      {entry.color && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.color }} />}
                      <span className="flex-1">{entry.label}</span>
                      {entry.hint && <span className="text-[10px] text-muted-foreground tabular-nums">{entry.hint}</span>}
                    </button>
                  );
                }
                return (
                  <button
                    key={k}
                    role="menuitem"
                    disabled={entry.disabled}
                    onClick={() => { entry.onClick(); setOpen(null); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-muted flex items-center gap-2 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <span className="flex-1">{entry.label}</span>
                    {entry.shortcut && <span className="text-[10px] text-muted-foreground">{entry.shortcut}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
