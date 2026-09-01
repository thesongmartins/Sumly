import { hashUrl, cacheKeyFor, rateLimiter, CACHE_TTL_MS } from "./background";

describe("hashUrl", () => {
  it("is deterministic for the same input", () => {
    expect(hashUrl("https://example.com/page")).toBe(
      hashUrl("https://example.com/page"),
    );
  });

  it("produces different hashes for different URLs", () => {
    expect(hashUrl("https://example.com/a")).not.toBe(
      hashUrl("https://example.com/b"),
    );
  });

  it("does not collide for long URLs sharing a 50+ char prefix", () => {
    // The old btoa(url).slice(0,50) key collided on shared prefixes.
    const prefix = "https://example.com/very/long/shared/path/segment/here/";
    const a = hashUrl(prefix + "alpha");
    const b = hashUrl(prefix + "omega");
    expect(a).not.toBe(b);
  });

  it("handles Unicode URLs without throwing (btoa would throw here)", () => {
    expect(() => hashUrl("https://example.com/日本語/страница/café")).not.toThrow();
    const key = hashUrl("https://example.com/日本語");
    expect(typeof key).toBe("string");
    expect(key.length).toBeGreaterThan(0);
  });

  it("returns a compact base-36 string", () => {
    expect(hashUrl("https://example.com")).toMatch(/^[0-9a-z]+$/);
  });
});

describe("cacheKeyFor", () => {
  it("prefixes the hash with 'summary_'", () => {
    const url = "https://example.com/page";
    expect(cacheKeyFor(url)).toBe(`summary_${hashUrl(url)}`);
  });

  it("yields distinct keys for distinct URLs", () => {
    expect(cacheKeyFor("https://a.com")).not.toBe(cacheKeyFor("https://b.com"));
  });
});

describe("rateLimiter", () => {
  beforeEach(() => {
    rateLimiter.requests = [];
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("allows requests up to maxRequests within the window", () => {
    for (let i = 0; i < rateLimiter.maxRequests; i++) {
      expect(rateLimiter.canMakeRequest()).toBe(true);
      rateLimiter.record();
    }
    expect(rateLimiter.canMakeRequest()).toBe(false);
  });

  it("frees up capacity once the window elapses", () => {
    for (let i = 0; i < rateLimiter.maxRequests; i++) rateLimiter.record();
    expect(rateLimiter.canMakeRequest()).toBe(false);

    // Advance just past the window so old timestamps age out.
    jest.advanceTimersByTime(rateLimiter.windowMs + 1);
    expect(rateLimiter.canMakeRequest()).toBe(true);
  });

  it("prunes stale timestamps on each check", () => {
    rateLimiter.record();
    jest.advanceTimersByTime(rateLimiter.windowMs + 1);
    rateLimiter.canMakeRequest();
    expect(rateLimiter.requests.length).toBe(0);
  });
});

describe("constants", () => {
  it("caches summaries for 30 minutes", () => {
    expect(CACHE_TTL_MS).toBe(30 * 60 * 1000);
  });
});
