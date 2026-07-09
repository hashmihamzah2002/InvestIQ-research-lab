import { getEnv } from "@/lib/config/env";

/**
 * Structured logger. Every entry is an event name plus flat fields, emitted
 * as a JSON line (production/CI) or a readable line (development). The
 * pipeline relies on these events for per-step diagnostics.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export interface LogEntry {
  ts: string;
  level: LogLevel;
  event: string;
  fields: LogFields;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type LogSink = (line: string, entry: LogEntry) => void;

const defaultSink: LogSink = (line, entry) => {
  const stream =
    LEVEL_ORDER[entry.level] >= LEVEL_ORDER.warn ? process.stderr : process.stdout;
  stream.write(line + "\n");
};

let sink: LogSink = defaultSink;

/** Test helper: capture log output. Pass null to restore the default sink. */
export function setLogSink(custom: LogSink | null): void {
  sink = custom ?? defaultSink;
}

function formatPretty(entry: LogEntry): string {
  const time = entry.ts.slice(11, 19);
  const level = entry.level.toUpperCase().padEnd(5);
  const fields = Object.entries(entry.fields)
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" ");
  return `${time} ${level} ${entry.event}${fields ? " " + fields : ""}`;
}

function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    return { error: err.message, errorName: err.name };
  }
  return { error: String(err) };
}

export class Logger {
  constructor(private readonly base: LogFields = {}) {}

  /** New logger with extra fields attached to every entry. */
  child(fields: LogFields): Logger {
    return new Logger({ ...this.base, ...fields });
  }

  private emit(level: LogLevel, event: string, fields?: LogFields): void {
    const env = getEnv();
    if (LEVEL_ORDER[level] < LEVEL_ORDER[env.LOG_LEVEL]) return;

    const merged = { ...this.base, ...fields };
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      event,
      fields: merged,
    };
    const format =
      env.LOG_FORMAT ?? (env.NODE_ENV === "development" ? "pretty" : "json");
    const line =
      format === "json"
        ? JSON.stringify({ ts: entry.ts, level, event, ...merged })
        : formatPretty(entry);
    sink(line, entry);
  }

  debug(event: string, fields?: LogFields): void {
    this.emit("debug", event, fields);
  }
  info(event: string, fields?: LogFields): void {
    this.emit("info", event, fields);
  }
  warn(event: string, fields?: LogFields): void {
    this.emit("warn", event, fields);
  }
  error(event: string, fields?: LogFields & { err?: unknown }): void {
    const { err, ...rest } = fields ?? {};
    this.emit("error", event, err === undefined ? rest : { ...rest, ...serializeError(err) });
  }
}

export const log = new Logger();
