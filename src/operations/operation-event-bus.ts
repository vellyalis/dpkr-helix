import type { StoredOperationEvent } from "./operation-store.js";

export type OperationEventListener = (event: StoredOperationEvent) => void;

export interface OperationEventPublicationReport {
  delivered: number;
  failed: number;
}

export class OperationEventBus {
  private readonly listeners = new Set<OperationEventListener>();

  subscribe(listener: OperationEventListener): () => void {
    this.listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(listener);
    };
  }

  publish(event: StoredOperationEvent): OperationEventPublicationReport {
    let delivered = 0;
    let failed = 0;

    for (const listener of [...this.listeners]) {
      try {
        const result = listener(event) as unknown;
        if (isPromiseLike(result)) {
          failed += 1;
          void Promise.resolve(result).catch(() => undefined);
        } else {
          delivered += 1;
        }
      } catch {
        failed += 1;
      }
    }

    return { delivered, failed };
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}
