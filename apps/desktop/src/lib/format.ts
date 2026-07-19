/** Shared date formatting — one convention app-wide. */

const DATE = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "Jul 19, 2026" */
export function formatDate(value: string | Date): string {
  return DATE.format(new Date(value));
}

/** "Jul 19, 3:42 PM" */
export function formatDateTime(value: string | Date): string {
  return DATE_TIME.format(new Date(value));
}
