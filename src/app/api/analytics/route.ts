import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { purgeOrphanPipelineData } from "@/lib/pipeline-cleanup";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  // Heal legacy orphans left when sitemap/blog deletes used SetNull instead of cascade
  await purgeOrphanPipelineData(userId);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    articlesProcessed,
    articlesPublished,
    pinsCreated,
    imagesGenerated,
    failedJobs,
    completedJobs,
    queueActive,
    recentArticles,
    recentJobs,
    apiUsage,
    pinRecords,
    pinsThisWeek,
    bloggerPublished,
    bloggerThisWeek,
    blogsByPublish,
    pinsByBoard,
    recentPins,
  ] = await Promise.all([
    prisma.article.count({ where: { userId } }),
    prisma.article.count({
      where: { userId, bloggerPostId: { not: null } },
    }),
    prisma.pinRecord.count({ where: { userId } }),
    prisma.apiUsage.aggregate({
      where: { userId, service: "openrouter-image" },
      _sum: { units: true },
    }),
    prisma.jobRun.count({ where: { userId, status: "FAILED" } }),
    prisma.jobRun.count({ where: { userId, status: "COMPLETED" } }),
    prisma.jobRun.count({ where: { userId, status: "ACTIVE" } }),
    prisma.article.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        sourceUrl: true,
        rewrittenTitle: true,
        originalTitle: true,
        status: true,
        bloggerPostUrl: true,
        pinUrl: true,
        updatedAt: true,
        errorMessage: true,
      },
    }),
    prisma.jobRun.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.apiUsage.groupBy({
      by: ["service"],
      where: { userId },
      _sum: { units: true },
    }),
    prisma.pinRecord.count({ where: { userId } }),
    prisma.pinRecord.count({
      where: { userId, createdAt: { gte: weekAgo } },
    }),
    prisma.article.count({
      where: { userId, bloggerPostId: { not: null } },
    }),
    prisma.article.count({
      where: {
        userId,
        bloggerPostId: { not: null },
        publishedAt: { gte: weekAgo },
      },
    }),
    prisma.article.groupBy({
      by: ["bloggerBlogId"],
      where: { userId, bloggerPostId: { not: null } },
      _count: { _all: true },
    }),
    prisma.pinRecord.groupBy({
      by: ["boardName"],
      where: { userId },
      _count: { _all: true },
      orderBy: { _count: { boardName: "desc" } },
      take: 10,
    }),
    prisma.pinRecord.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        article: {
          select: { rewrittenTitle: true, originalTitle: true, bloggerPostUrl: true },
        },
      },
    }),
  ]);

  const blogIds = blogsByPublish
    .map((b) => b.bloggerBlogId)
    .filter((id): id is string => Boolean(id));
  const blogs = blogIds.length
    ? await prisma.bloggerBlog.findMany({
        where: { id: { in: blogIds } },
        select: { id: true, name: true, url: true, publishedToday: true, dailyLimit: true },
      })
    : [];
  const blogMap = new Map(blogs.map((b) => [b.id, b]));

  const totalFinished = failedJobs + completedJobs;
  const successRate =
    totalFinished === 0 ? 100 : Math.round((completedJobs / totalFinished) * 100);

  return NextResponse.json({
    metrics: {
      articlesProcessed,
      articlesPublished,
      pinsCreated: Math.max(pinsCreated, pinRecords),
      imagesGenerated: imagesGenerated._sum.units || 0,
      failedJobs,
      queueActive,
      successRate,
    },
    bloggerAnalytics: {
      totalPublished: bloggerPublished,
      publishedThisWeek: bloggerThisWeek,
      byBlog: blogsByPublish.map((row) => ({
        blogId: row.bloggerBlogId,
        name: row.bloggerBlogId
          ? blogMap.get(row.bloggerBlogId)?.name || "Unknown blog"
          : "Unassigned",
        url: row.bloggerBlogId ? blogMap.get(row.bloggerBlogId)?.url : null,
        count: row._count._all,
        publishedToday: row.bloggerBlogId
          ? blogMap.get(row.bloggerBlogId)?.publishedToday || 0
          : 0,
        dailyLimit: row.bloggerBlogId
          ? blogMap.get(row.bloggerBlogId)?.dailyLimit || 0
          : 0,
      })),
    },
    pinAnalytics: {
      totalPins: pinRecords,
      pinsThisWeek,
      byBoard: pinsByBoard.map((row) => ({
        boardName: row.boardName || "Unknown board",
        count: row._count._all,
      })),
      recentPins: recentPins.map((pin) => ({
        id: pin.id,
        title: pin.title,
        boardName: pin.boardName,
        pinUrl: pin.pinUrl,
        createdAt: pin.createdAt,
        articleTitle:
          pin.article.rewrittenTitle || pin.article.originalTitle || "Untitled",
        bloggerPostUrl: pin.article.bloggerPostUrl,
      })),
    },
    apiUsage,
    recentArticles,
    recentJobs,
  });
}
