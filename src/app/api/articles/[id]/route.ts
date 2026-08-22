import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCategories } from "@/lib/blog-categories";
import { deriveKeywordBoardName } from "@/lib/keyword-board";
import { formatGmtPlus5, nextAssignedSlotUtc } from "@/lib/schedule";
import { titleFromSourceUrl } from "@/lib/extract";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const article = await prisma.article.findFirst({
    where: { id, userId: session.user.id },
    include: {
      bloggerBlog: {
        select: {
          id: true,
          name: true,
          url: true,
          dailyLimit: true,
          categories: true,
          categoriesSyncedAt: true,
          googleAccount: { select: { id: true, email: true } },
          pinterestMap: {
            include: {
              pinterestAccount: { select: { id: true, username: true } },
              pinterestBoard: { select: { id: true, name: true } },
            },
          },
        },
      },
      pins: { orderBy: { createdAt: "asc" } },
      sitemapSource: { select: { id: true, url: true } },
      jobRuns: {
        where: { status: { in: ["QUEUED", "ACTIVE"] }, scheduledFor: { not: null } },
        orderBy: { scheduledFor: "asc" },
        take: 1,
        select: { scheduledFor: true, queueName: true },
      },
    },
  });

  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let originalMeta: Record<string, unknown> = {};
  try {
    originalMeta = article.originalMeta ? JSON.parse(article.originalMeta) : {};
  } catch {
    originalMeta = {};
  }

  const settings = await prisma.aiSettings.findUnique({
    where: { userId: session.user.id },
  });

  let originalTitle = article.originalTitle?.trim() || "";
  if (!originalTitle) {
    originalTitle = titleFromSourceUrl(article.sourceUrl);
    await prisma.article.update({
      where: { id: article.id },
      data: { originalTitle },
    });
  }

  let scheduledAt = article.scheduledAt || article.jobRuns[0]?.scheduledFor || null;
  if (!scheduledAt && article.status === "DISCOVERED" && article.bloggerBlogId) {
    const ahead = await prisma.article.count({
      where: {
        bloggerBlogId: article.bloggerBlogId,
        status: "DISCOVERED",
        createdAt: { lt: article.createdAt },
      },
    });
    scheduledAt = nextAssignedSlotUtc(
      settings || {},
      ahead,
      new Date(),
      article.bloggerBlog?.dailyLimit || 5
    );
    await prisma.article.update({
      where: { id: article.id },
      data: { scheduledAt },
    });
  }

  return NextResponse.json({
    ...article,
    originalTitle,
    scheduledAt,
    scheduledAtGmt5: formatGmtPlus5(scheduledAt),
    originalMeta,
    categoryList: parseCategories(article.bloggerBlog?.categories),
    keywordBoardName: deriveKeywordBoardName({ ...article, originalTitle }),
    pinsPerArticle: settings?.pinsPerArticle ?? 1,
    paired: Boolean(article.bloggerBlog?.pinterestMap?.pinterestAccountId),
  });
}
