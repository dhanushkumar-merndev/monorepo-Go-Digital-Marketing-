export interface WorkingHour {
  closesAt: string | null;
  dayOfWeek: number;
  isClosed: boolean;
  opensAt: string | null;
}

function localParts(date: Date, timezone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<string, string>;
}

function minutes(value: string): number {
  const [hour = '0', minute = '0'] = value.split(':');
  return Number(hour) * 60 + Number(minute);
}

function timezoneOffsetMilliseconds(date: Date, timezone: string): number {
  const part = localParts(date, timezone);
  const representedAsUtc = Date.UTC(
    Number(part.year),
    Number(part.month) - 1,
    Number(part.day),
    Number(part.hour),
    Number(part.minute),
    Number(part.second),
  );
  return representedAsUtc - date.getTime();
}

function localInstant(
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
  timezone: string,
): Date {
  const approximate = new Date(
    Date.UTC(year, month - 1, day, Math.floor(minuteOfDay / 60), minuteOfDay % 60),
  );
  return new Date(approximate.getTime() - timezoneOffsetMilliseconds(approximate, timezone));
}

const weekdayIndex: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function businessSlaDeadline(
  startedAt: Date,
  durationMinutes: number,
  timezone: string,
  schedule: readonly WorkingHour[],
): Date {
  let cursor = new Date(startedAt);
  let remaining = durationMinutes;
  for (let guard = 0; guard < 32 && remaining > 0; guard += 1) {
    const part = localParts(cursor, timezone);
    const dayIndex = weekdayIndex[part.weekday ?? ''] ?? -1;
    const day = schedule.find((entry) => entry.dayOfWeek === dayIndex);
    const year = Number(part.year);
    const month = Number(part.month);
    const date = Number(part.day);
    if (day && !day.isClosed && day.opensAt && day.closesAt) {
      const open = localInstant(year, month, date, minutes(day.opensAt), timezone);
      const close = localInstant(year, month, date, minutes(day.closesAt), timezone);
      if (cursor < open) cursor = open;
      if (cursor < close) {
        const available = Math.floor((close.getTime() - cursor.getTime()) / 60_000);
        if (available >= remaining) return new Date(cursor.getTime() + remaining * 60_000);
        remaining -= available;
      }
    }
    const nextLocalNoon = localInstant(year, month, date + 1, 12 * 60, timezone);
    const next = localParts(nextLocalNoon, timezone);
    cursor = localInstant(Number(next.year), Number(next.month), Number(next.day), 0, timezone);
  }
  throw new Error('Working-hours calendar cannot produce an SLA deadline.');
}

export function isWithinWorkingHours(
  instant: Date,
  timezone: string,
  schedule: readonly WorkingHour[],
): boolean {
  const part = localParts(instant, timezone);
  const day = schedule.find(
    (entry) => entry.dayOfWeek === (weekdayIndex[part.weekday ?? ''] ?? -1),
  );
  if (!day || day.isClosed || !day.opensAt || !day.closesAt) return false;
  const localMinute = Number(part.hour) * 60 + Number(part.minute);
  return localMinute >= minutes(day.opensAt) && localMinute < minutes(day.closesAt);
}
