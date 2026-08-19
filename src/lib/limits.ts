import { prisma } from "@/lib/prisma";
import type { ScheduleInterval } from "@prisma/client";
export {
  canRunScheduledWork,
  isPostingDayEnabled,
  isPreferredPostingHour,
  isWithinScheduleWindow,
  parsePostingDays,
  parsePostingHoursByDay,
  parsePostTimes,
  preferredHourForDay,
  resizePostTimes,
  scheduledForSlot,
  serializePostingDays,
  serializePostingHoursByDay,
  serializePostTimes,
  spreadPostTimesEvenly,
  weekdayKeyFromDate,
  WEEKDAYS,
} from "@/lib/schedule";

export function scheduleToMs(schedule: ScheduleInterval): number | null {
  switch (schedule) {
    case "EVERY_15_MIN":
      return 15 * 60 * 1000;
    case "HOURLY":
      return 60 * 60 * 1000;
    case "EVERY_6_HOURS":
      return 6 * 60 * 60 * 1000;
    case "DAILY":
      return 24 * 60 * 60 * 1000;
    case "MANUAL":
      return null;
  }
}

export function isSameUtcDay(a?: Date | null, b: Date = new Date()): boolean {
  if (!a) return false;
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export async function resetDailyCountersIfNeeded() {
  const blogs = await prisma.bloggerBlog.findMany();
  for (const blog of blogs) {
    if (!isSameUtcDay(blog.publishedDay)) {
      await prisma.bloggerBlog.update({
        where: { id: blog.id },
        data: { publishedToday: 0, publishedDay: new Date() },
      });
    }
  }

  const accounts = await prisma.pinterestAccount.findMany();
  for (const account of accounts) {
    if (!isSameUtcDay(account.pinsDay)) {
      await prisma.pinterestAccount.update({
        where: { id: account.id },
        data: { pinsToday: 0, pinsDay: new Date() },
      });
    }
  }

  const settings = await prisma.aiSettings.findMany();
  for (const s of settings) {
    if (!isSameUtcDay(s.imagesDay)) {
      await prisma.aiSettings.update({
        where: { id: s.id },
        data: { imagesToday: 0, imagesDay: new Date() },
      });
    }
  }
}

export async function canPublishBlog(blogId: string): Promise<boolean> {
  const blog = await prisma.bloggerBlog.findUnique({ where: { id: blogId } });
  if (!blog || !blog.enabled) return false;
  if (!isSameUtcDay(blog.publishedDay)) return true;
  return blog.publishedToday < blog.dailyLimit;
}

export async function canCreatePin(accountId: string): Promise<boolean> {
  const account = await prisma.pinterestAccount.findUnique({ where: { id: accountId } });
  if (!account) return false;
  if (!isSameUtcDay(account.pinsDay)) return true;
  return account.pinsToday < account.dailyPinLimit;
}

export async function canGenerateImage(userId: string): Promise<boolean> {
  const settings = await prisma.aiSettings.findUnique({ where: { userId } });
  if (!settings) return true;
  if (!isSameUtcDay(settings.imagesDay)) return true;
  return settings.imagesToday < settings.dailyImageLimit;
}
