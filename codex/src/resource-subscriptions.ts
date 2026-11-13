interface HostSubscriptions {
  subscribe(params: { uri: string }): Promise<unknown>;
  unsubscribe(params: { uri: string }): Promise<unknown>;
}

/** Keep host subscription changes in order across rapid file switches.
 * In particular, an old A unsubscribe must settle before reopening A. */
export class ResourceSubscriptions {
  private pending: Promise<unknown> = Promise.resolve();

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => {});
    return result;
  }

  open(resources: HostSubscriptions, uri: string) {
    let closed = false;
    let subscribed = false;
    let closing: Promise<void> | undefined;
    const ready = this.enqueue(async () => {
      if (closed) return;
      await resources.subscribe({ uri });
      subscribed = true;
    });
    return {
      ready,
      close: () => {
        if (closing) return closing;
        closed = true;
        closing = this.enqueue(async () => {
          if (subscribed) await resources.unsubscribe({ uri });
        });
        return closing;
      },
    };
  }
}
