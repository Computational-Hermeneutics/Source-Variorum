"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Collation, CollationMode, LineAnnotation, Witness } from "@/types";

const HISTORY_CAP = 60;

/** Snapshot used for undo/redo and revert. We store whole Collation objects;
 *  witnesses are large but a few dozen snapshots is comfortably affordable. */
type Snapshot = Collation;

function stamp(c: Collation): Collation {
  return { ...c, updatedAt: new Date().toISOString() };
}

/**
 * Central project state for Source Variorum: the working collation plus an
 * undo/redo history and a "saved" baseline for revert. Every mutation goes
 * through `commit`, which pushes the prior state onto the undo stack. `load`
 * replaces the project and resets history (a freshly opened/loaded project has
 * nothing to undo); `markSaved` records the current state as the revert point.
 */
export function useProject(initial: Collation) {
  const [collation, setCollation] = useState<Collation>(initial);
  const pastRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const savedRef = useRef<Snapshot>(initial);
  // Bump to force consumers to recompute canUndo/canRedo/isDirty after ref edits.
  const [, force] = useState(0);
  const tick = useCallback(() => force((n) => n + 1), []);

  const commit = useCallback(
    (updater: (c: Collation) => Collation) => {
      setCollation((prev) => {
        const next = stamp(updater(prev));
        if (next === prev) return prev;
        pastRef.current = [...pastRef.current.slice(-(HISTORY_CAP - 1)), prev];
        futureRef.current = [];
        return next;
      });
      tick();
    },
    [tick]
  );

  const undo = useCallback(() => {
    setCollation((prev) => {
      const past = pastRef.current;
      if (past.length === 0) return prev;
      const last = past[past.length - 1];
      pastRef.current = past.slice(0, -1);
      futureRef.current = [prev, ...futureRef.current].slice(0, HISTORY_CAP);
      return last;
    });
    tick();
  }, [tick]);

  const redo = useCallback(() => {
    setCollation((prev) => {
      const future = futureRef.current;
      if (future.length === 0) return prev;
      const next = future[0];
      futureRef.current = future.slice(1);
      pastRef.current = [...pastRef.current.slice(-(HISTORY_CAP - 1)), prev];
      return next;
    });
    tick();
  }, [tick]);

  /** Replace the whole project (open/load/new) and reset history + saved point. */
  const load = useCallback(
    (next: Collation) => {
      pastRef.current = [];
      futureRef.current = [];
      savedRef.current = next;
      setCollation(next);
      tick();
    },
    [tick]
  );

  const markSaved = useCallback(() => {
    savedRef.current = collation;
    tick();
  }, [collation, tick]);

  const revert = useCallback(() => {
    setCollation((prev) => {
      pastRef.current = [...pastRef.current.slice(-(HISTORY_CAP - 1)), prev];
      futureRef.current = [];
      return savedRef.current;
    });
    tick();
  }, [tick]);

  // ----- mutators -----
  const rename = useCallback((name: string) => commit((c) => ({ ...c, name })), [commit]);
  const setMode = useCallback((mode: CollationMode) => commit((c) => ({ ...c, mode })), [commit]);
  const setLeft = useCallback((id: string) => commit((c) => ({ ...c, leftId: id })), [commit]);
  const setRight = useCallback((id: string) => commit((c) => ({ ...c, rightId: id })), [commit]);
  const setBase = useCallback(
    (id: string) => commit((c) => ({ ...c, baseIndex: Math.max(0, c.witnesses.findIndex((w) => w.id === id)) })),
    [commit]
  );

  const addWitness = useCallback(
    (w: Witness) =>
      commit((c) => ({
        ...c,
        witnesses: [...c.witnesses, w],
        // Bring the new witness into the right panel so it is immediately visible.
        rightId: w.id,
      })),
    [commit]
  );

  const addWitnesses = useCallback(
    (ws: Witness[]) => {
      if (ws.length === 0) return;
      commit((c) => ({
        ...c,
        witnesses: [...c.witnesses, ...ws],
        // Show the first newly added source on the right so the import is visible.
        rightId: ws[0].id,
      }));
    },
    [commit]
  );

  const removeWitness = useCallback(
    (id: string) =>
      commit((c) => {
        if (c.witnesses.length <= 2) return c; // keep at least two
        const witnesses = c.witnesses.filter((w) => w.id !== id);
        const annotations = { ...c.annotations };
        delete annotations[id];
        const fallback = witnesses[0].id;
        const second = witnesses[1]?.id ?? fallback;
        return {
          ...c,
          witnesses,
          annotations,
          leftId: c.leftId === id ? fallback : c.leftId,
          rightId: c.rightId === id ? second : c.rightId,
          baseIndex: Math.min(c.baseIndex, witnesses.length - 1),
        };
      }),
    [commit]
  );

  const updateWitness = useCallback(
    (id: string, patch: Partial<Witness>) =>
      commit((c) => ({
        ...c,
        witnesses: c.witnesses.map((w) => (w.id === id ? { ...w, ...patch } : w)),
      })),
    [commit]
  );

  const editNote = useCallback(
    (variantId: string, note: string) =>
      commit((c) => ({
        ...c,
        apparatusEdits: { ...c.apparatusEdits, [variantId]: { ...c.apparatusEdits[variantId], note } },
      })),
    [commit]
  );

  const addAnnotation = useCallback(
    (witnessId: string, ann: LineAnnotation) =>
      commit((c) => ({
        ...c,
        annotations: { ...c.annotations, [witnessId]: [...(c.annotations[witnessId] ?? []), ann] },
      })),
    [commit]
  );

  const removeAnnotation = useCallback(
    (witnessId: string, annId: string) =>
      commit((c) => ({
        ...c,
        annotations: {
          ...c.annotations,
          [witnessId]: (c.annotations[witnessId] ?? []).filter((a) => a.id !== annId),
        },
      })),
    [commit]
  );

  const isDirty = useMemo(
    () => JSON.stringify(collation) !== JSON.stringify(savedRef.current),
    [collation]
  );

  return {
    collation,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    isDirty,
    undo,
    redo,
    load,
    markSaved,
    revert,
    rename,
    setMode,
    setLeft,
    setRight,
    setBase,
    addWitness,
    addWitnesses,
    removeWitness,
    updateWitness,
    editNote,
    addAnnotation,
    removeAnnotation,
  };
}
