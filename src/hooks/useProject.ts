"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Collation, CollationMode, LineAnnotation, ManualLink, Witness } from "@/types";

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
  const setNotes = useCallback((notes: string) => commit((c) => ({ ...c, notes })), [commit]);
  const setMode = useCallback((mode: CollationMode) => commit((c) => ({ ...c, mode })), [commit]);
  // Either panel can show any witness — including the same one on both sides
  // (collating a text against itself yields all matches; handy for testing).
  const setLeft = useCallback((id: string) => commit((c) => ({ ...c, leftId: id })), [commit]);
  const setRight = useCallback((id: string) => commit((c) => ({ ...c, rightId: id })), [commit]);
  const swapSides = useCallback(() => commit((c) => ({ ...c, leftId: c.rightId, rightId: c.leftId })), [commit]);
  const setBase = useCallback(
    (id: string) => commit((c) => ({ ...c, baseIndex: Math.max(0, c.witnesses.findIndex((w) => w.id === id)) })),
    [commit]
  );

  const addWitness = useCallback(
    (w: Witness) =>
      commit((c) => ({
        ...c,
        witnesses: [...c.witnesses, { ...w, original: w.original ?? w.text }],
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
        witnesses: [...c.witnesses, ...ws.map((w) => ({ ...w, original: w.original ?? w.text }))],
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
        witnesses: c.witnesses.map((w) => {
          if (w.id !== id) return w;
          // First text edit snapshots the pristine original so it can be reverted.
          const original = patch.text !== undefined && w.original === undefined ? w.text : w.original;
          return { ...w, ...patch, original };
        }),
      })),
    [commit]
  );

  // Mark a witness reference-only (or back). When it becomes reference and is
  // currently shown in a panel, swap that panel to the first comparable witness.
  const toggleReference = useCallback(
    (id: string) =>
      commit((c) => {
        const witnesses = c.witnesses.map((w) => (w.id === id ? { ...w, reference: !w.reference } : w));
        const nowRef = witnesses.find((w) => w.id === id)?.reference;
        if (!nowRef) return { ...c, witnesses };
        const comparable = witnesses.filter((w) => !w.reference);
        const pick = (cur: string) => (cur === id ? (comparable[0]?.id ?? cur) : cur);
        return { ...c, witnesses, leftId: pick(c.leftId), rightId: pick(c.rightId) };
      }),
    [commit]
  );

  const revertWitness = useCallback(
    (id: string) =>
      commit((c) => ({
        ...c,
        witnesses: c.witnesses.map((w) => (w.id === id && w.original !== undefined ? { ...w, text: w.original } : w)),
      })),
    [commit]
  );

  const duplicateWitness = useCallback(
    (id: string, newId: string) =>
      commit((c) => {
        const w = c.witnesses.find((x) => x.id === id);
        if (!w) return c;
        const copy: Witness = { ...w, id: newId, siglum: `${w.siglum}′`, title: `${w.title} (copy)`, original: w.text };
        return { ...c, witnesses: [...c.witnesses, copy], rightId: newId };
      }),
    [commit]
  );

  // ----- folders -----
  const createFolder = useCallback(
    (name: string) =>
      commit((c) => {
        const folders = c.folders ?? [];
        if (!name.trim() || folders.includes(name)) return c;
        return { ...c, folders: [...folders, name] };
      }),
    [commit]
  );

  const renameFolder = useCallback(
    (oldName: string, newName: string) =>
      commit((c) => {
        const name = newName.trim();
        if (!name || name === oldName || (c.folders ?? []).includes(name)) return c;
        return {
          ...c,
          folders: (c.folders ?? []).map((f) => (f === oldName ? name : f)),
          witnesses: c.witnesses.map((w) => (w.folder === oldName ? { ...w, folder: name } : w)),
        };
      }),
    [commit]
  );

  const moveToFolder = useCallback(
    (witnessId: string, folder: string) =>
      commit((c) => ({
        ...c,
        witnesses: c.witnesses.map((w) => (w.id === witnessId ? { ...w, folder: folder || undefined } : w)),
        folders: folder && !(c.folders ?? []).includes(folder) ? [...(c.folders ?? []), folder] : c.folders,
      })),
    [commit]
  );

  const deleteFolder = useCallback(
    (folder: string) =>
      commit((c) => ({
        ...c,
        // Files in the folder fall back to the root; the folder name is removed.
        witnesses: c.witnesses.map((w) => (w.folder === folder ? { ...w, folder: undefined } : w)),
        folders: (c.folders ?? []).filter((f) => f !== folder),
      })),
    [commit]
  );

  // ----- trash -----
  const trashWitness = useCallback(
    (id: string) =>
      commit((c) => {
        // Keep at least two active witnesses so the braid always has a pair.
        if (c.witnesses.length <= 2) return c;
        const w = c.witnesses.find((x) => x.id === id);
        if (!w) return c;
        const witnesses = c.witnesses.filter((x) => x.id !== id);
        const leftId = c.leftId === id ? witnesses[0].id : c.leftId;
        let rightId = c.rightId === id ? (witnesses.find((x) => x.id !== leftId)?.id ?? witnesses[0].id) : c.rightId;
        if (rightId === leftId) rightId = witnesses.find((x) => x.id !== leftId)?.id ?? rightId;
        return {
          ...c,
          witnesses,
          trash: [w, ...(c.trash ?? [])],
          leftId,
          rightId,
          baseIndex: Math.min(c.baseIndex, witnesses.length - 1),
        };
      }),
    [commit]
  );

  const restoreWitness = useCallback(
    (id: string) =>
      commit((c) => {
        const w = (c.trash ?? []).find((x) => x.id === id);
        if (!w) return c;
        return { ...c, witnesses: [...c.witnesses, w], trash: (c.trash ?? []).filter((x) => x.id !== id) };
      }),
    [commit]
  );

  const deleteForever = useCallback(
    (id: string) => commit((c) => ({ ...c, trash: (c.trash ?? []).filter((x) => x.id !== id) })),
    [commit]
  );

  const emptyTrash = useCallback(() => commit((c) => ({ ...c, trash: [] })), [commit]);

  // ----- manual (Advanced-mode) links, keyed by the current witness pair -----
  const addManualLink = useCallback(
    (link: ManualLink) =>
      commit((c) => {
        const key = `${c.leftId}|${c.rightId}`;
        const existing = c.manualLinks?.[key] ?? [];
        return { ...c, manualLinks: { ...c.manualLinks, [key]: [...existing, link] } };
      }),
    [commit]
  );

  const removeManualLink = useCallback(
    (id: string) =>
      commit((c) => {
        const key = `${c.leftId}|${c.rightId}`;
        const existing = c.manualLinks?.[key] ?? [];
        return { ...c, manualLinks: { ...c.manualLinks, [key]: existing.filter((l) => l.id !== id) } };
      }),
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
    setNotes,
    setMode,
    setLeft,
    setRight,
    swapSides,
    setBase,
    addWitness,
    addWitnesses,
    removeWitness,
    updateWitness,
    revertWitness,
    toggleReference,
    duplicateWitness,
    createFolder,
    renameFolder,
    moveToFolder,
    deleteFolder,
    trashWitness,
    restoreWitness,
    deleteForever,
    emptyTrash,
    addManualLink,
    removeManualLink,
    editNote,
    addAnnotation,
    removeAnnotation,
  };
}
