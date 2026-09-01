// Pretty text in development, single-line JSON in production.
type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const MIN_LEVEL: Level =
  (process.env.LOG_LEVEL as Level) ||
  (process.env.NODE_ENV === "production" ? "info" : "debug");

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;

  const sink =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;

  if (process.env.NODE_ENV === "production") {
    sink(JSON.stringify({ level, scope: "sumly", msg, ...meta }));
  } else {
    sink(`[sumly] ${level.toUpperCase()} ${msg}`, meta ?? "");
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) =>
    emit("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) =>
    emit("error", msg, meta),
};
