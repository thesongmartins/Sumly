// Env-driven values use getters so they can be overridden at runtime and in tests.
export const config = {
  rateLimit: {
    windowMs: 60 * 1000,
    max: 15,
  },
  cache: {
    ttlMs: 30 * 60 * 1000,
  },
  gemini: {
    maxContentChars: 30_000,
    maxOutputTokens: 1024,
    temperature: 0.2,
    get model(): string {
      return process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    },
    get timeoutMs(): number {
      return Number(process.env.GEMINI_TIMEOUT_MS) || 30_000;
    },
  },

  get allowedOrigins(): string[] {
    return (process.env.ALLOWED_ORIGINS || "*")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },

  // Empty = auth gate disabled.
  get sharedSecret(): string {
    return process.env.EXTENSION_SHARED_SECRET || "";
  },
} as const;
