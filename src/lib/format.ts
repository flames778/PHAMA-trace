/**
 * Locale-correct UTC stamps for every user-visible date in the app
 * (scan feed, custody timeline, cabinet, map popups). Falls back to the
 * raw string when parsing fails, never to Invalid Date.
 */
const stampFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

export function formatStamp(iso: string): string {
  const t = Date.parse(iso);
  if (!iso || Number.isNaN(t)) return iso || "date unknown";
  return `${stampFormat.format(new Date(t))} UTC`;
}
