export type LogLevel = "debug" | "info" | "warn" | "error";

const levelRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const sensitiveKeyPattern = /(api[-_]?key|authorization|password|secret|token|cookie)/i;
const redacted = "[REDACTED]";

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, seen));
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack
    };
  }

  const result: Record<string, unknown> = {};

  for (const [key, nested] of Object.entries(value)) {
    result[key] = sensitiveKeyPattern.test(key) ? redacted : redactValue(nested, seen);
  }

  return result;
}

export function redact(value: unknown): unknown {
  return redactValue(value, new WeakSet<object>());
}

export interface LoggerOptions {
  level?: LogLevel;
  sink?: (line: string) => void;
}

export interface Logger {
  debug(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  error(message: string, context?: unknown): void;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? "info";
  const sink = options.sink ?? ((line: string) => console.log(line));

  function write(entryLevel: LogLevel, message: string, context?: unknown): void {
    if (levelRank[entryLevel] < levelRank[level]) {
      return;
    }

    const entry = {
      time: new Date().toISOString(),
      level: entryLevel,
      message,
      ...(context === undefined ? {} : { context: redact(context) })
    };

    sink(JSON.stringify(entry));
  }

  return {
    debug: (message, context) => write("debug", message, context),
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
    error: (message, context) => write("error", message, context)
  };
}
