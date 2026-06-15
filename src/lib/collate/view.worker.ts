/// <reference lib="webworker" />
/**
 * Off-main-thread collation. The view (variants + apparatus + metrics) can take
 * a few seconds for a long witness with an expensive option (e.g. word-order
 * matching), which would freeze the UI if run on the main thread. Running it here
 * keeps the page responsive, lets us show progress, and — because terminating a
 * worker is instant — lets the user CANCEL a recompute mid-flight.
 */
import type { Collation } from "@/types/collation";
import type { NormalizeOptions } from "./similarity";
import { deriveView, type DeriveExtra } from "./derive";

export interface ViewJob {
  id: number;
  collation: Collation;
  normalize?: NormalizeOptions;
  detectMoves?: boolean;
  extra?: DeriveExtra;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<ViewJob>) => {
  const { id, collation, normalize, detectMoves, extra } = e.data;
  try {
    const view = deriveView(collation, normalize, detectMoves, extra);
    ctx.postMessage({ id, ok: true, view });
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
