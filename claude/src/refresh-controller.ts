import type { ResourceSession } from '../../codex/src/resource-session.ts';

export interface RefreshCallbacks {
  onStart?: (discard: boolean) => void;
  onSuccess?: (discard: boolean) => void;
  onError?: (error: unknown, discard: boolean) => void;
}

/** Coordinate window-focus reads with explicit reloads. A background read must
 * never supersede the read for which the user confirmed discarding changes. */
export function createRefreshController(session: Pick<ResourceSession, 'refresh'>, callbacks: RefreshCallbacks = {}) {
  let sequence = 0;
  let disposed = false;
  let pending: { discard: boolean; sequence: number; promise: Promise<void> } | undefined;

  function refresh(discard = false): Promise<void> {
    if (disposed) return Promise.resolve();
    if (pending && (!discard || pending.discard)) return pending.promise;
    const current = ++sequence;
    callbacks.onStart?.(discard);
    let operation: Promise<void>;
    try { operation = session.refresh(discard); }
    catch (error) { operation = Promise.reject(error); }
    const promise = operation.then(() => {
      if (!disposed && current === sequence) callbacks.onSuccess?.(discard);
    }, error => {
      if (!disposed && current === sequence) callbacks.onError?.(error, discard);
      throw error;
    }).finally(() => {
      if (pending?.sequence === current) pending = undefined;
    });
    pending = { discard, sequence: current, promise };
    return promise;
  }

  return {
    refresh,
    dispose() { disposed = true; sequence += 1; pending = undefined; },
  };
}
