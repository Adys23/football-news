/**
 * Logger dla Edge Functions. W tej warstwie `console.log` jest zabroniony
 * (ESLint + hook stop) - tu schodzimy na stderr, zeby nie mieszac z JSON-em
 * odpowiedzi funkcji.
 */

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export function logInfo(event: string, fields: LogFields = {}): void {
  write("info", event, fields);
}

export function logError(event: string, fields: LogFields = {}): void {
  write("error", event, fields);
}

function write(level: "info" | "error", event: string, fields: LogFields): void {
  const line = JSON.stringify({
    level,
    event,
    ts: new Date().toISOString(),
    ...fields,
  });

  if (level === "error") {
    console.error(line);
  } else {
    console.warn(line);
  }
}
