import type { DashboardRange, DateFormatOption } from "./constants";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatDisplayDate(
  input: string | Date,
  format: DateFormatOption = "DD MMM YYYY",
): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";

  const day = String(date.getDate()).padStart(2, "0");
  const monthNum = String(date.getMonth() + 1).padStart(2, "0");
  const monthShort = MONTHS_SHORT[date.getMonth()];
  const year = String(date.getFullYear());

  switch (format) {
    case "MM/DD/YYYY":
      return `${monthNum}/${day}/${year}`;
    case "YYYY-MM-DD":
      return `${year}-${monthNum}-${day}`;
    case "DD MMM YYYY":
    default:
      return `${day} ${monthShort} ${year}`;
  }
}

export function toDateInputValue(input: string | Date = new Date()): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDateRangeBounds(
  range: DashboardRange,
  customStart?: string,
  customEnd?: string,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  switch (range) {
    case "TODAY":
      return { start, end };
    case "WEEK": {
      const dayOfWeek = start.getDay();
      start.setDate(start.getDate() - dayOfWeek);
      return { start, end };
    }
    case "MONTH": {
      start.setDate(1);
      return { start, end };
    }
    case "YEAR": {
      start.setMonth(0, 1);
      return { start, end };
    }
    case "CUSTOM": {
      const parsedStart = customStart ? new Date(customStart) : start;
      const parsedEnd = customEnd ? new Date(customEnd) : end;
      if (!Number.isNaN(parsedStart.getTime())) {
        parsedStart.setHours(0, 0, 0, 0);
      }
      if (!Number.isNaN(parsedEnd.getTime())) {
        parsedEnd.setHours(23, 59, 59, 999);
      }
      return {
        start: Number.isNaN(parsedStart.getTime()) ? start : parsedStart,
        end: Number.isNaN(parsedEnd.getTime()) ? end : parsedEnd,
      };
    }
  }
}
