import { prisma } from "@/lib/prisma";
import { QUEUE_NAMES } from "@/lib/queue";

function sitemapIdFromPayload(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload) as { sitemapSourceId?: unknown };
    return typeof parsed.sitemapSourceId === "string" ? parsed.sitemapSourceId : null;
  } catch {
    return null;
  }
}

export async function deleteJobsForArticleIds(articleIds: string[]) {
  if (!articleIds.length) return;
  await prisma.jobRun.deleteMany({
    where: { articleId: { in: articleIds } },
  });
}

export async function deleteCrawlJobsForSitemap(
  userId: string,
  sitemapSourceId: string
) {
  const jobs = await prisma.jobRun.findMany({
    where: { userId, queueName: QUEUE_NAMES.CRAWL_SITEMAP },
    select: { id: true, payload: true },
  });
  const ids = jobs
    .filter((job) => sitemapIdFromPayload(job.payload) === sitemapSourceId)
    .map((job) => job.id);
  if (!ids.length) return;
  await prisma.jobRun.deleteMany({ where: { id: { in: ids } } });
}

export async function deleteArticlesAndJobs(
  userId: string,
  articleIds: string[]
) {
  if (!articleIds.length) return;
  await deleteJobsForArticleIds(articleIds);
  await prisma.article.deleteMany({
    where: { id: { in: articleIds }, userId },
  });
}

/**
 * Removes pipeline rows left behind after sitemap/blog deletes.
 * Covers legacy SetNull orphans so Overview stops counting deleted work.
 */
export async function purgeOrphanPipelineData(userId: string) {
  const [sitemapCount, blogCount] = await Promise.all([
    prisma.sitemapSource.count({ where: { userId } }),
    prisma.bloggerBlog.count({
      where: { googleAccount: { userId } },
    }),
  ]);

  if (sitemapCount === 0 && blogCount === 0) {
    await prisma.jobRun.deleteMany({ where: { userId } });
    await prisma.article.deleteMany({ where: { userId } });
    return;
  }

  const orphanArticles = await prisma.article.findMany({
    where: { userId, sitemapSourceId: null },
    select: { id: true },
  });
  await deleteArticlesAndJobs(
    userId,
    orphanArticles.map((a) => a.id)
  );

  if (sitemapCount === 0) {
    await prisma.jobRun.deleteMany({ where: { userId } });
    return;
  }

  // Drop article-pipeline jobs that lost their article (legacy onDelete SetNull)
  await prisma.jobRun.deleteMany({
    where: {
      userId,
      articleId: null,
      queueName: { not: QUEUE_NAMES.CRAWL_SITEMAP },
    },
  });

  const liveSitemaps = await prisma.sitemapSource.findMany({
    where: { userId },
    select: { id: true },
  });
  const liveIds = new Set(liveSitemaps.map((s) => s.id));
  const crawlJobs = await prisma.jobRun.findMany({
    where: { userId, queueName: QUEUE_NAMES.CRAWL_SITEMAP },
    select: { id: true, payload: true },
  });
  const staleCrawlIds = crawlJobs
    .filter((job) => {
      const sitemapId = sitemapIdFromPayload(job.payload);
      return !sitemapId || !liveIds.has(sitemapId);
    })
    .map((job) => job.id);
  if (staleCrawlIds.length) {
    await prisma.jobRun.deleteMany({ where: { id: { in: staleCrawlIds } } });
  }
}
