interface Window {
  count: number;
  resetAt: number;
}

/** Rate-limiter de ventana fija en memoria. Clave típica: IP del cliente. */
export class RateLimiter {
  private windows = new Map<string, Window>();

  constructor(private limit: number, private windowMs: number) {}

  /** Devuelve true si la petición está permitida (y la contabiliza). */
  allow(key: string): boolean {
    const now = Date.now();
    const w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (w.count >= this.limit) return false;
    w.count++;
    return true;
  }
}
