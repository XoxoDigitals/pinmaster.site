export const WEEKDAYS = [
  { key: "mon", label: "Mon", jsDay: 1 },
  { key: "tue", label: "Tue", jsDay: 2 },
  { key: "wed", label: "Wed", jsDay: 3 },
  { key: "thu", label: "Thu", jsDay: 4 },
  { key: "fri", label: "Fri", jsDay: 5 },
  { key: "sat", label: "Sat", jsDay: 6 },
  { key: "sun", label: "Sun", jsDay: 0 },
] as const;

export type WeekdayKey = (typeof WEEKDAYS)[number]["key"];

export type ScheduleSettingsLike = {
  scheduleHour?: number | null;
  postingDays?: string | null;
  postingHoursByDay?: string | null;
  scheduleWindowStart?: number | null;
  scheduleWindowEnd?: number | null;
  articlePostTimes?: string | null;
};

const DEFAULT_DAYS = WEEKDAYS.map((d) => d.key);

export function parsePostingDays(raw?: string | null): WeekdayKey[] {
  if (!raw?.trim()) return [...DEFAULT_DAYS];
  const allowed = new Set(WEEKDAYS.map((d) => d.key));
  const parsed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is WeekdayKey => allowed.has(s as WeekdayKey));
  return parsed.length ? parsed : [...DEFAULT_DAYS];
}

export function serializePostingDays(days: string[]): string {
  const allowed = new Set(WEEKDAYS.map((d) => d.key));
  const unique = [...new Set(days.map((d) => d.toLowerCase()).filter((d) => allowed.has(d as WeekdayKey)))];
  return unique.length ? unique.join(",") : DEFAULT_DAYS.join(",");
}

export function parsePostingHoursByDay(raw?: string | null): Partial<Record<WeekdayKey, number>> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<Record<WeekdayKey, number>> = {};
    for (const day of WEEKDAYS) {
      const value = parsed[day.key];
      if (typeof value === "number" && Number.isFinite(value)) {
        out[day.key] = Math.max(0, Math.min(23, Math.floor(value)));
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function serializePostingHoursByDay(
  hours: Partial<Record<WeekdayKey, number>>
): string {
  const cleaned: Partial<Record<WeekdayKey, number>> = {};
  for (const day of WEEKDAYS) {
    const value = hours[day.key];
    if (typeof value === "number" && Number.isFinite(value)) {
      cleaned[day.key] = Math.max(0, Math.min(23, Math.floor(value)));
    }
  }
  return JSON.stringify(cleaned);
}

export function weekdayKeyFromDate(date: Date = new Date()): WeekdayKey {
  const jsDay = date.getDay();
  const match = WEEKDAYS.find((d) => d.jsDay === jsDay);
  return match?.key ?? "mon";
}

export function preferredHourForDay(
  settings: ScheduleSettingsLike,
  day: WeekdayKey
): number {
  const byDay = parsePostingHoursByDay(settings.postingHoursByDay);
  if (typeof byDay[day] === "number") return byDay[day]!;
  return settings.scheduleHour ?? 9;
}

/** True when current local day is enabled for posting. */
export function isPostingDayEnabled(
  settings: ScheduleSettingsLike,
  now: Date = new Date()
): boolean {
  const days = parsePostingDays(settings.postingDays);
  return days.includes(weekdayKeyFromDate(now));
}

/**
 * Optional daily time window. Inclusive start, exclusive end.
 * Supports overnight windows (e.g. 22 → 6).
 * If either bound is null/undefined, window check passes.
 */
export function isWithinScheduleWindow(
  settings: ScheduleSettingsLike,
  now: Date = new Date()
): boolean {
  const start = settings.scheduleWindowStart;
  const end = settings.scheduleWindowEnd;
  if (start == null || end == null) return true;
  const hour = now.getHours();
  if (start === end) return true;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

/** For DAILY schedules: only run during the preferred hour for today. */
export function isPreferredPostingHour(
  settings: ScheduleSettingsLike,
  now: Date = new Date()
): boolean {
  const day = weekdayKeyFromDate(now);
  return now.getHours() === preferredHourForDay(settings, day);
}

/** Combined gate used by the worker before crawl/publish ticks. */
export function canRunScheduledWork(
  settings: ScheduleSettingsLike | null | undefined,
  opts: { requirePreferredHour?: boolean } = {},
  now: Date = new Date()
): boolean {
  const s = settings ?? {};
  if (!isPostingDayEnabled(s, now)) return false;
  if (!isWithinScheduleWindow(s, now)) return false;
  if (opts.requirePreferredHour && !isPreferredPostingHour(s, now)) return false;
  return true;
}

const HHMM_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Normalize a time string to "HH:mm", or null if invalid. */
export function normalizeHhMm(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const m = trimmed.match(HHMM_RE);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** Parse JSON array of "HH:mm" post times (server local clock). */
export function parsePostTimes(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeHhMm).filter((t): t is string => Boolean(t));
  } catch {
    return [];
  }
}

export function serializePostTimes(times: unknown): string {
  if (!Array.isArray(times)) return "[]";
  const cleaned = times.map(normalizeHhMm).filter((t): t is string => Boolean(t));
  return JSON.stringify(cleaned);
}

/** Spread `count` times evenly between start and end (inclusive), server local. */
export function spreadPostTimesEvenly(
  count: number,
  startHhMm = "08:00",
  endHhMm = "20:00"
): string[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const start = normalizeHhMm(startHhMm) || "08:00";
  const end = normalizeHhMm(endHhMm) || "20:00";
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin = startMin + Math.max(60, n * 30);
  if (n === 1) {
    const mid = Math.round((startMin + endMin) / 2);
    return [minutesToHhMm(mid)];
  }
  const span = endMin - startMin;
  return Array.from({ length: n }, (_, i) =>
    minutesToHhMm(Math.round(startMin + (span * i) / (n - 1)))
  );
}

function minutesToHhMm(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, total));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Resize a times list to `count`, keeping existing values and filling gaps
 * by spreading across the day window.
 * Empty input stays empty (means “publish immediately” / unconfigured).
 */
export function resizePostTimes(times: string[], count: number): string[] {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  const cleaned = times.map(normalizeHhMm).filter((t): t is string => Boolean(t));
  if (cleaned.length === 0) return [];
  if (cleaned.length === n) return cleaned;
  if (cleaned.length > n) return cleaned.slice(0, n);
  const filled = spreadPostTimesEvenly(n);
  for (let i = 0; i < cleaned.length; i++) filled[i] = cleaned[i];
  return filled;
}

/**
 * Build a Date for today (GMT+5 / Asia/Karachi) at HH:mm, stored as UTC.
 * Returns null when times are empty (caller should publish immediately).
 * If the slot time already passed, returns `now` so the job can run ASAP.
 */
export function scheduledForSlot(
  times: string[],
  slotIndex: number,
  now: Date = new Date()
): Date | null {
  const exact = exactSlotUtc(times, slotIndex, now);
  if (!exact) return null;
  if (exact.getTime() <= now.getTime()) return now;
  return exact;
}

/** Civil date/time parts in GMT+5 (Pakistan, no DST). */
export function gmtPlus5Parts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const shifted = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

export function utcFromGmtPlus5(
  year: number,
  monthIndex: number,
  day: number,
  hour: number,
  minute: number
): Date {
  return new Date(Date.UTC(year, monthIndex, day, hour - 5, minute, 0, 0));
}

export function exactSlotUtc(
  times: string[],
  slotIndex: number,
  now: Date = new Date()
): Date | null {
  if (!times.length) return null;
  const idx = Math.max(0, Math.min(times.length - 1, Math.floor(slotIndex)));
  const hhmm = normalizeHhMm(times[idx]);
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  const p = gmtPlus5Parts(now);
  return utcFromGmtPlus5(p.year, p.month, p.day, h, m);
}

export const DISPLAY_TZ = "Asia/Karachi";

export function formatGmtPlus5(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(d);
  return `${formatted} GMT+5`;
}

function karachiWeekday(year: number, monthIndex: number, day: number): number {
  return utcFromGmtPlus5(year, monthIndex, day, 12, 0).getUTCDay();
}

function addCalendarDays(
  year: number,
  monthIndex: number,
  day: number,
  add: number
): { year: number; month: number; day: number } {
  const d = new Date(Date.UTC(year, monthIndex, day + add));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

/**
 * Next rewrite/publish instant for the `queueIndex`-th waiting article (0-based),
 * using posting days + article HH:mm slots interpreted in GMT+5. Stored as UTC.
 */
export function nextAssignedSlotUtc(
  settings: ScheduleSettingsLike,
  queueIndex: number,
  now: Date = new Date(),
  dailyLimit = 5
): Date {
  const times = parsePostTimes(settings.articlePostTimes);
  const hour = settings.scheduleHour ?? 9;
  const slotTimes =
    times.length > 0
      ? times
      : [`${String(Math.max(0, Math.min(23, hour))).padStart(2, "0")}:00`];
  const perDay = Math.max(1, Math.min(slotTimes.length, Math.max(1, dailyLimit)));
  const days = parsePostingDays(settings.postingDays);
  const p = gmtPlus5Parts(now);
  let remaining = Math.max(0, Math.floor(queueIndex));
  let cursor = { year: p.year, month: p.month, day: p.day };

  for (let safety = 0; safety < 400; safety++) {
    const jsDay = karachiWeekday(cursor.year, cursor.month, cursor.day);
    const key = WEEKDAYS.find((d) => d.jsDay === jsDay)?.key ?? "mon";
    if (days.includes(key)) {
      for (let i = 0; i < perDay; i++) {
        const hhmm = normalizeHhMm(slotTimes[i] || slotTimes[0]);
        if (!hhmm) continue;
        const [h, m] = hhmm.split(":").map(Number);
        const at = utcFromGmtPlus5(cursor.year, cursor.month, cursor.day, h, m);
        const isToday = cursor.year === p.year && cursor.month === p.month && cursor.day === p.day;
        if (isToday && at.getTime() <= now.getTime()) continue;
        if (remaining === 0) return at;
        remaining -= 1;
      }
    }
    cursor = addCalendarDays(cursor.year, cursor.month, cursor.day, 1);
  }

  const [h, m] = (normalizeHhMm(slotTimes[0]) || "09:00").split(":").map(Number);
  return utcFromGmtPlus5(p.year, p.month, p.day + 1, h, m);
}
