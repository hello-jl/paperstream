/** Delay snapshot creation as well as persistence while the user is typing. */
export function createDraftWriter<T>(write: (snapshot: T) => Promise<void>, options: {
  delayMs?: number;
  maxWaitMs?: number;
  onError?: (error: unknown) => void;
} = {}) {
  const delay = options.delayMs ?? 250;
  const maxWait = options.maxWaitMs ?? 1500;
  if (!Number.isFinite(delay) || delay < 0) throw new Error('Draft delay must be a non-negative number.');
  if (!Number.isFinite(maxWait) || maxWait < 0) throw new Error('Draft maximum wait must be a non-negative number.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let latest: (() => T) | undefined;
  let running: Promise<void> | undefined;
  let disposed = false;
  let discard = false;

  function cancelTimer() {
    if (timer !== undefined) clearTimeout(timer);
    if (maxTimer !== undefined) clearTimeout(maxTimer);
    timer = undefined; maxTimer = undefined;
  }
  function flush(): Promise<void> {
    cancelTimer();
    // A new value can arrive after the drain's final check but before its
    // promise settles. Recheck after that write instead of resolving early.
    if (running) return running.then(() => flush());
    if (!latest) return Promise.resolve();
    // Start in a microtask so even a synchronous snapshot error is represented
    // by the returned promise and running is set before the first write.
    running = Promise.resolve().then(async () => {
      while (latest) {
        const getSnapshot = latest;
        latest = undefined;
        try { await write(getSnapshot()); }
        catch (error) {
          // Never replace a newer scheduled edit with the failed older value.
          if (!latest && !discard) latest = getSnapshot;
          throw error;
        }
      }
    }).finally(() => { running = undefined; });
    return running;
  }
  function schedule(getSnapshot: () => T): void {
    if (disposed) return;
    latest = getSnapshot;
    if (timer !== undefined) clearTimeout(timer);
    const save = () => { void flush().catch(error => { options.onError?.(error); }); };
    timer = setTimeout(save, delay);
    // Continuous typing postpones the idle timer, but not this periodic attempt.
    // Neither timer can guarantee durability if the browser or storage fails.
    if (maxTimer === undefined) maxTimer = setTimeout(save, maxWait);
  }
  function dispose({ flush: save = false }: { flush?: boolean } = {}): Promise<void> {
    disposed = true;
    cancelTimer();
    if (save) return flush();
    discard = true;
    latest = undefined;
    return running ?? Promise.resolve();
  }
  return { schedule, flush, dispose };
}
