const scheduledDateParts = ["year", "month", "day", "hour", "minute", "second"] as const;

type ScheduledDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function formatterFor(timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
  } catch {
    return null;
  }
}

function partsFor(date: Date, timeZone: string): ScheduledDateParts | null {
  const formatter = formatterFor(timeZone);
  if (!formatter) return null;
  const values = Object.fromEntries(formatter.formatToParts(date)
    .filter((part) => scheduledDateParts.includes(part.type as typeof scheduledDateParts[number]))
    .map((part) => [part.type, Number(part.value)]));
  if (values.hour === 24) values.hour = 0;
  if (scheduledDateParts.some((part) => !Number.isInteger(values[part]))) return null;
  return values as ScheduledDateParts;
}

function utcTimestamp(parts: ScheduledDateParts) {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0);
  return date.getTime();
}

function daysInMonth(year: number, month: number) {
  const date = new Date(0);
  date.setUTCFullYear(year, month, 0);
  return date.getUTCDate();
}

export function scheduledDateFromWallClock(value: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const parts: ScheduledDateParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: 0,
  };
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > daysInMonth(parts.year, parts.month) || parts.hour > 23 || parts.minute > 59) return null;

  const wallClock = utcTimestamp(parts);
  let candidate = wallClock;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const actual = partsFor(new Date(candidate), timeZone);
    if (!actual) return null;
    const offset = utcTimestamp(actual) - candidate;
    candidate = wallClock - offset;
  }

  const result = new Date(candidate);
  const resolved = partsFor(result, timeZone);
  if (!resolved || scheduledDateParts.some((part) => resolved[part] !== parts[part])) return null;
  return result;
}
