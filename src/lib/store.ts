// Swappable rate-limit + cache backends (in-memory default; swap for Upstash
// on multi-instance deployments).

export interface RateLimiter {
  check(key: string): boolean;
}

export interface Cache<T> {
  get(key: string): T | null;
  set(key: string, value: T): void;
}

export class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
  ) {}

  check(key: string): boolean {
    const now = Date.now();
    this.sweep(now);

    const record = this.hits.get(key);
    if (!record || now > record.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (record.count >= this.max) return false;
    record.count++;
    return true;
  }

  private sweep(now: number): void {
    this.hits.forEach((record, key) => {
      if (now > record.resetAt) this.hits.delete(key);
    });
  }
}

export class MemoryCache<T> implements Cache<T> {
  private store = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | null {
    const now = Date.now();
    this.sweep(now);
    const entry = this.store.get(key);
    if (!entry || now >= entry.expiresAt) return null;
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  private sweep(now: number): void {
    this.store.forEach((entry, key) => {
      if (now >= entry.expiresAt) this.store.delete(key);
    });
  }
}
