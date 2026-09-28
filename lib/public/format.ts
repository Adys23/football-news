const PUBLIC_TIME_ZONE = "Europe/Warsaw";

const dateTimeFormat = new Intl.DateTimeFormat("pl-PL", {
  timeZone: PUBLIC_TIME_ZONE,
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** "28 września 2026 o 14:05" w czasie polskim, niezaleznie od strefy serwera. */
export function formatPublicDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}
