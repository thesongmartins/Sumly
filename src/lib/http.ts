import { NextRequest } from "next/server";
import { config } from "./config";

export function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allowed = config.allowedOrigins;

  let allowOrigin: string;
  if (allowed.includes("*")) {
    allowOrigin = "*";
  } else if (origin && allowed.includes(origin)) {
    allowOrigin = origin;
  } else {
    allowOrigin = allowed[0] || "";
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, X-Extension-Version, X-Extension-Secret",
    Vary: "Origin",
  };
}

export function isAuthorized(req: NextRequest): boolean {
  const secret = config.sharedSecret;
  if (!secret) return true;
  return req.headers.get("x-extension-secret") === secret;
}

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() =>
    clearTimeout(timer),
  ) as Promise<T>;
}
