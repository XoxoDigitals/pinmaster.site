import { prisma } from "@/lib/prisma";

export const QUEUE_NAMES = {
  CRAWL_SITEMAP: "crawl-sitemap",
  EXTRACT_ARTICLE: "extract-article",
  REWRITE_AI: "rewrite-ai",
  GENERATE_IMAGES: "generate-images",
  PUBLISH_BLOGGER: "publish-blogger",
  PUBLISH_PINTEREST: "publish-pinterest",
  SCHEDULER: "scheduler",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export type EnqueueOpts = {
  userId?: string;
  articleId?: string;
  /** Delay until this time (server local). Null/undefined = run ASAP. */
  scheduledFor?: Date | null;
};

async function enqueue(
  queueName: QueueName,
  payload: Record<string, unknown>,
  opts?: EnqueueOpts
) {
  return prisma.jobRun.create({
    data: {
      queueName,
      status: "QUEUED",
      payload: JSON.stringify(payload),
      userId: opts?.userId,
      articleId: opts?.articleId,
      scheduledFor: opts?.scheduledFor ?? null,
      attempts: 0,
    },
  });
}

export async function enqueueCrawl(sitemapSourceId: string, userId?: string) {
  return enqueue(QUEUE_NAMES.CRAWL_SITEMAP, { sitemapSourceId }, { userId });
}

export async function enqueueExtract(
  articleId: string,
  userId?: string,
  scheduledFor?: Date | null
) {
  return enqueue(
    QUEUE_NAMES.EXTRACT_ARTICLE,
    { articleId },
    { articleId, userId, scheduledFor: scheduledFor ?? null }
  );
}

export async function enqueueRewrite(articleId: string, userId?: string) {
  return enqueue(QUEUE_NAMES.REWRITE_AI, { articleId }, { articleId, userId });
}

export async function enqueueImages(articleId: string, userId?: string) {
  return enqueue(QUEUE_NAMES.GENERATE_IMAGES, { articleId }, { articleId, userId });
}

export async function enqueueBlogger(
  articleId: string,
  userId?: string,
  scheduledFor?: Date | null,
  opts?: { immediate?: boolean }
) {
  const immediate = Boolean(opts?.immediate);
  return enqueue(
    QUEUE_NAMES.PUBLISH_BLOGGER,
    { articleId, ...(immediate ? { immediate: true } : {}) },
    { articleId, userId, scheduledFor: immediate ? null : scheduledFor }
  );
}

export async function enqueuePinterest(
  articleId: string,
  userId?: string,
  scheduledFor?: Date | null,
  opts?: { immediate?: boolean }
) {
  const immediate = Boolean(opts?.immediate);
  return enqueue(
    QUEUE_NAMES.PUBLISH_PINTEREST,
    { articleId, ...(immediate ? { immediate: true } : {}) },
    { articleId, userId, scheduledFor: immediate ? null : scheduledFor }
  );
}

export async function enqueueSchedulerTick() {
  return enqueue(QUEUE_NAMES.SCHEDULER, {});
}

export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function stringifyTags(tags: string[]): string {
  return JSON.stringify(tags);
}
