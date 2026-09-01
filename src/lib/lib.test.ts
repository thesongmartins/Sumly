import { NextRequest } from "next/server";
import { MemoryRateLimiter, MemoryCache } from "./store";
import { withTimeout, TimeoutError, corsHeaders, isAuthorized } from "./http";
import { summarizeRequestSchema } from "./validation";

describe("MemoryRateLimiter", () => {
  it("allows up to max then blocks within the window", () => {
    const rl = new MemoryRateLimiter(60_000, 3);
    expect(rl.check("a")).toBe(true);
    expect(rl.check("a")).toBe(true);
    expect(rl.check("a")).toBe(true);
    expect(rl.check("a")).toBe(false);
  });

  it("tracks keys independently", () => {
    const rl = new MemoryRateLimiter(60_000, 1);
    expect(rl.check("a")).toBe(true);
    expect(rl.check("b")).toBe(true);
    expect(rl.check("a")).toBe(false);
  });
});

describe("MemoryCache", () => {
  it("stores and retrieves values", () => {
    const cache = new MemoryCache<number>(60_000);
    cache.set("k", 42);
    expect(cache.get("k")).toBe(42);
  });

  it("returns null for missing keys", () => {
    const cache = new MemoryCache<number>(60_000);
    expect(cache.get("nope")).toBeNull();
  });

  it("expires entries past the TTL", () => {
    jest.useFakeTimers();
    try {
      const cache = new MemoryCache<number>(1000);
      cache.set("k", 7);
      jest.advanceTimersByTime(1001);
      expect(cache.get("k")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("withTimeout", () => {
  it("resolves when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 100)).resolves.toBe("ok");
  });

  it("rejects with TimeoutError when it does not", async () => {
    const slow = new Promise((r) => setTimeout(r, 200));
    await expect(withTimeout(slow, 20)).rejects.toBeInstanceOf(TimeoutError);
  });
});

function reqWith(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost:3000/api/summarize", {
    method: "POST",
    headers,
  });
}

describe("corsHeaders", () => {
  it("reflects an allowed origin", () => {
    const original = process.env.ALLOWED_ORIGINS;
    process.env.ALLOWED_ORIGINS = "https://a.com,https://b.com";
    try {
      const h = corsHeaders(reqWith({ origin: "https://b.com" }));
      expect(h["Access-Control-Allow-Origin"]).toBe("https://b.com");
      expect(h.Vary).toBe("Origin");
    } finally {
      process.env.ALLOWED_ORIGINS = original;
    }
  });

  it("does not reflect a disallowed origin", () => {
    const original = process.env.ALLOWED_ORIGINS;
    process.env.ALLOWED_ORIGINS = "https://a.com";
    try {
      const h = corsHeaders(reqWith({ origin: "https://evil.com" }));
      expect(h["Access-Control-Allow-Origin"]).toBe("https://a.com");
    } finally {
      process.env.ALLOWED_ORIGINS = original;
    }
  });

  it("allows any origin with the '*' wildcard", () => {
    const original = process.env.ALLOWED_ORIGINS;
    process.env.ALLOWED_ORIGINS = "*";
    try {
      const h = corsHeaders(reqWith({ origin: "https://whatever.com" }));
      expect(h["Access-Control-Allow-Origin"]).toBe("*");
    } finally {
      process.env.ALLOWED_ORIGINS = original;
    }
  });
});

describe("isAuthorized", () => {
  it("is open when no secret is configured", () => {
    const original = process.env.EXTENSION_SHARED_SECRET;
    delete process.env.EXTENSION_SHARED_SECRET;
    try {
      expect(isAuthorized(reqWith({}))).toBe(true);
    } finally {
      process.env.EXTENSION_SHARED_SECRET = original;
    }
  });

  it("requires a matching header when a secret is set", () => {
    const original = process.env.EXTENSION_SHARED_SECRET;
    process.env.EXTENSION_SHARED_SECRET = "top";
    try {
      expect(isAuthorized(reqWith({}))).toBe(false);
      expect(isAuthorized(reqWith({ "x-extension-secret": "nope" }))).toBe(false);
      expect(isAuthorized(reqWith({ "x-extension-secret": "top" }))).toBe(true);
    } finally {
      process.env.EXTENSION_SHARED_SECRET = original;
    }
  });
});

describe("summarizeRequestSchema", () => {
  it("accepts a valid payload", () => {
    const r = summarizeRequestSchema.safeParse({
      content: "x".repeat(60),
      url: "https://example.com",
      wordCount: 100,
    });
    expect(r.success).toBe(true);
  });

  it("rejects content shorter than 50 non-whitespace chars", () => {
    const r = summarizeRequestSchema.safeParse({ content: "   short   " });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toMatch(/too short or empty/i);
    }
  });

  it("rejects a negative wordCount", () => {
    const r = summarizeRequestSchema.safeParse({
      content: "x".repeat(60),
      wordCount: -1,
    });
    expect(r.success).toBe(false);
  });
});
