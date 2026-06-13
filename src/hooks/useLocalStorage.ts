"use client";

import { useState, useCallback, useEffect } from "react";
import type { SavedCollation } from "@/types";

const STORAGE_KEY = "source-variorum-collations";

function load(): SavedCollation[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // Ignore malformed storage
  }
  return [];
}

function persist(collations: SavedCollation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collations));
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
}

/**
 * Local-first persistence for saved collations. Mirrors LLMbench's saved-
 * comparison pattern: hydrate from localStorage after mount (so SSR markup
 * matches), then save/delete with write-through.
 */
export function useCollations() {
  const [collations, setCollations] = useState<SavedCollation[]>([]);

  useEffect(() => {
    setCollations(load());
  }, []);

  const saveCollation = useCallback((collation: SavedCollation) => {
    setCollations((prev) => {
      const existing = prev.findIndex((c) => c.id === collation.id);
      let updated: SavedCollation[];
      if (existing >= 0) {
        updated = [...prev];
        updated[existing] = { ...collation, updatedAt: new Date().toISOString() };
      } else {
        updated = [collation, ...prev];
      }
      persist(updated);
      return updated;
    });
  }, []);

  const deleteCollation = useCallback((id: string) => {
    setCollations((prev) => {
      const updated = prev.filter((c) => c.id !== id);
      persist(updated);
      return updated;
    });
  }, []);

  const getCollation = useCallback(
    (id: string): SavedCollation | undefined => collations.find((c) => c.id === id),
    [collations]
  );

  return { collations, saveCollation, deleteCollation, getCollation };
}
