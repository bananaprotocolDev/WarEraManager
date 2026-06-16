interface Entry<V> {
  value: V;
  expiresAt: number;
}

/** Caché en memoria con expiración por TTL (ms). Pensada para datos globales. */
export class TtlCache {
  private store = new Map<string, Entry<unknown>>();

  constructor(private ttlMs: number) {}

  /** Devuelve el valor cacheado vigente, o ejecuta y cachea `loader`. */
  async getOrLoad<V>(key: string, loader: () => Promise<V>): Promise<V> {
    const hit = this.store.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value as V;
    }
    const value = await loader();
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }

  clear(): void {
    this.store.clear();
  }
}
