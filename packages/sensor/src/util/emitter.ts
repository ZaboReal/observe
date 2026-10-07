export type Listener<T> = (value: T) => void;

/** Minimal synchronous emitter. Listener errors are isolated so one bad subscriber cannot break capture. */
export class Emitter<T> {
  private listeners = new Set<Listener<T>>();

  on(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  emit(value: T): void {
    for (const fn of this.listeners) {
      try {
        fn(value);
      } catch {
        /* isolate subscriber errors */
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }

  get size(): number {
    return this.listeners.size;
  }
}
