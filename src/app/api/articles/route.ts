import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  enqueueExtract,
  enqueueRewrite,
  enqueueImages,
  enqueueBlogger,
  enqueuePinterest,
  QUEUE_NAMES,
} from "@/lib/queue";
import { parsePostTimes, scheduledForSlot, nextAssignedSlotUtc, formatGmtPlus5 } from "@/lib/schedule";
import { isSameUtcDay } from "@/lib/limits";
import { titleFromSourceUrl, shouldRefreshArticleImages } from "@/lib/extract";

function parseMeta(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function hasPinImages(article: {
  pinterestImageUrl: string | null;
  originalMeta: string | null;
}): boolean {
  if (article.pinterestImageUrl) return true;
  const meta = parseMeta(article.originalMeta);
  return Array.isArray(meta.pinterestImageUrls) && meta.pinterestImageUrls.length > 0;
}

async function setArticleMetaFlags(
  articleId: string,
  currentMeta: string | null,
  flags: { forcePublishNow?: boolean }
) {
  const meta = parseMeta(currentMeta);
  if (flags.forcePublishNow) meta.forcePublishNow = true;
  else delete meta.forcePublishNow;
  await prisma.article.update({
    where: { id: articleId },
    data: { originalMeta: JSON.stringify(meta), errorMessage: null },
  });
}

async function cancelQueuedPublishJobs(articleId: string) {
  await prisma.jobRun.updateMany({
    where: {
      articleId,
      status: "QUEUED",
      queueName: {
        in: [
          QUEUE_NAMES.PUBLISH_BLOGGER,
          QUEUE_NAMES.PUBLISH_PINTEREST,
          QUEUE_NAMES.GENERATE_IMAGES,
          QUEUE_NAMES.REWRITE_AI,
        ],
      },
    },
    data: {
      status: "FAILED",
      error: "Superseded by manual publish/schedule action",
      finishedAt: new Date(),
    },
  });
}

async function requireBlogAssigned(articleId: string, userId: string) {
  const article = await prisma.article.findFirst({
    where: { id: articleId, userId },
    include: {
      bloggerBlog: {
        include: {
          pinterestMap: true,
          googleAccount: { select: { userId: true } },
        },
      },
    },
  });
  if (!article) return { error: "Not found" as const, status: 404 as const };
  if (!article.bloggerBlogId || !article.bloggerBlog) {
    return {
      error: "Assign this article to a Blogger blog before publishing." as const,
      status: 400 as const,
    };
  }
  if (article.bloggerBlog.googleAccount.userId !== userId) {
    return { error: "Not found" as const, status: 404 as const };
  }
  return { article };
}

async function requireBlogPairing(articleId: string, userId: string) {
  const assigned = await requireBlogAssigned(articleId, userId);
  if ("error" in assigned && assigned.error) return assigned;
  if (!assigned.article.bloggerBlog?.pinterestMap?.pinterestAccountId) {
    return {
      error:
        "Pair this blog with a Pinterest account on the Blogger page before scheduling pins." as const,
      status: 400 as const,
    };
  }
  return assigned;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status");
  const bloggerBlogId = req.nextUrl.searchParams.get("bloggerBlogId") || req.nextUrl.searchParams.get("blogId");
  const googleAccountId = req.nextUrl.searchParams.get("googleAccountId");
  const take = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("take") || 50)));

  const articles = await prisma.article.findMany({
    where: {
      userId: session.user.id,
      ...(status ? { status: status as never } : {}),
      ...(bloggerBlogId ? { bloggerBlogId } : {}),
      ...(googleAccountId
        ? { bloggerBlog: { googleAccountId, googleAccount: { userId: session.user.id } } }
        : {}),
    },
    include: {
      bloggerBlog: {
        select: {
          id: true,
          name: true,
          url: true,
          dailyLimit: true,
          googleAccountId: true,
          googleAccount: { select: { id: true, email: true } },
        },
      },
      sitemapSource: { select: { id: true, url: true } },
      jobRuns: {
        where: { status: { in: ["QUEUED", "ACTIVE"] }, scheduledFor: { not: null } },
        orderBy: { scheduledFor: "asc" },
        take: 1,
        select: { scheduledFor: true },
      },
      _count: { select: { pins: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  const settings = await prisma.aiSettings.findUnique({
    where: { userId: session.user.id },
  });

  const discoveredByBlog = new Map<string, typeof articles>();
  for (const article of articles) {
    if (article.status !== "DISCOVERED" || !article.bloggerBlogId) continue;
    const list = discoveredByBlog.get(article.bloggerBlogId) || [];
    list.push(article);
    discoveredByBlog.set(article.bloggerBlogId, list);
  }
  for (const [, list] of discoveredByBlog) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  const discoveredIndex = new Map<string, number>();
  for (const [, list] of discoveredByBlog) {
    list.forEach((article, index) => discoveredIndex.set(article.id, index));
  }

  const now = new Date();
  const payload = [];
  for (const article of articles) {
    let originalTitle = article.originalTitle?.trim() || "";
    if (!originalTitle) {
      originalTitle = titleFromSourceUrl(article.sourceUrl);
      await prisma.article.update({
        where: { id: article.id },
        data: { originalTitle },
      });
    }

    let scheduledAt =
      article.scheduledAt || article.jobRuns[0]?.scheduledFor || null;
    if (!scheduledAt && article.status === "DISCOVERED" && article.bloggerBlogId) {
      const idx = discoveredIndex.get(article.id) ?? 0;
      scheduledAt = nextAssignedSlotUtc(
        settings || {},
        idx,
        now,
        article.bloggerBlog?.dailyLimit || 5
      );
      await prisma.article.update({
        where: { id: article.id },
        data: { scheduledAt },
      });
    }

    payload.push({
      ...article,
      originalTitle,
      scheduledAt,
      scheduledAtGmt5: formatGmtPlus5(scheduledAt),
    });
  }

  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { articleId, action } = body as { articleId?: string; action?: string };
  if (!articleId || !action) {
    return NextResponse.json({ error: "articleId and action required" }, { status: 400 });
  }

  const article = await prisma.article.findFirst({
    where: { id: articleId, userId: session.user.id },
    include: {
      bloggerBlog: true,
    },
  });
  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userId = session.user.id;

  switch (action) {
    case "extract":
      await prisma.article.update({
        where: { id: articleId },
        data: { errorMessage: null },
      });
      await enqueueExtract(articleId, userId);
      break;

    case "rewrite": {
      await prisma.article.update({
        where: { id: articleId },
        data: { errorMessage: null },
      });
      const meta = parseMeta(article.originalMeta);
      // Missing or sparse image extract → re-crawl first (chains to rewrite).
      if (!article.originalContent || shouldRefreshArticleImages(article.originalContent, meta)) {
        await enqueueExtract(articleId, userId);
      } else {
        await enqueueRewrite(articleId, userId);
      }
      break;
    }

    case "images":
      await prisma.article.update({
        where: { id: articleId },
        data: { errorMessage: null },
      });
      await enqueueImages(articleId, userId);
      break;

    case "blogger":
      await prisma.article.update({
        where: { id: articleId },
        data: { errorMessage: null },
      });
      await enqueueBlogger(articleId, userId);
      break;

    case "pinterest":
      await prisma.article.update({
        where: { id: articleId },
        data: { errorMessage: null },
      });
      await enqueuePinterest(articleId, userId);
      break;

    case "retry":
      await prisma.article.update({
        where: { id: articleId },
        data: { errorMessage: null },
      });
      await enqueueExtract(articleId, userId);
      break;

    case "publish_now": {
      const assigned = await requireBlogAssigned(articleId, userId);
      if ("error" in assigned && assigned.error) {
        return NextResponse.json({ error: assigned.error }, { status: assigned.status });
      }

      if (article.status === "COMPLETED" && article.bloggerPostUrl) {
        return NextResponse.json({ ok: true, message: "Already completed" });
      }

      await cancelQueuedPublishJobs(articleId);
      await setArticleMetaFlags(articleId, article.originalMeta, { forcePublishNow: true });

      const bloggerDone = Boolean(article.bloggerPostUrl || article.bloggerPostId);

      if (bloggerDone) {
        await enqueuePinterest(articleId, userId, null, { immediate: true });
      } else if (article.originalContent || article.rewrittenHtml) {
        await enqueueBlogger(articleId, userId, null, { immediate: true });
      } else {
        await enqueueExtract(articleId, userId);
      }
      break;
    }

    case "schedule": {
      const paired = await requireBlogPairing(articleId, userId);
      if ("error" in paired && paired.error) {
        return NextResponse.json({ error: paired.error }, { status: paired.status });
      }
      const full = paired.article!;

      if (article.status === "COMPLETED") {
        return NextResponse.json({ ok: true, message: "Already completed" });
      }

      await cancelQueuedPublishJobs(articleId);
      await setArticleMetaFlags(articleId, article.originalMeta, { forcePublishNow: false });

      const settings = await prisma.aiSettings.upsert({
        where: { userId },
        update: {},
        create: { userId },
      });
      const articleTimes = parsePostTimes(settings.articlePostTimes);
      const blog = full.bloggerBlog!;
      const slotIndex = isSameUtcDay(blog.publishedDay) ? blog.publishedToday : 0;
      const scheduledFor = scheduledForSlot(articleTimes, slotIndex);
      if (scheduledFor) {
        await prisma.article.update({
          where: { id: articleId },
          data: { scheduledAt: scheduledFor },
        });
      }

      const rewritten = Boolean(article.rewrittenHtml);
      const imaged = hasPinImages(article);
      const bloggerDone = Boolean(article.bloggerPostUrl || article.bloggerPostId);

      if (bloggerDone || article.status === "PINNING") {
        const pinTimes = parsePostTimes(settings.pinPostTimes);
        const accountId = blog.pinterestMap?.pinterestAccountId;
        let pinAt = scheduledForSlot(pinTimes, 0);
        if (accountId) {
          const account = await prisma.pinterestAccount.findUnique({ where: { id: accountId } });
          const pinSlot = account && isSameUtcDay(account.pinsDay) ? account.pinsToday : 0;
          pinAt = scheduledForSlot(pinTimes, pinSlot);
        }
        await enqueuePinterest(articleId, userId, pinAt);
      } else if (rewritten && imaged) {
        await enqueueBlogger(articleId, userId, scheduledFor);
      } else if (rewritten) {
        // Imaging → handleImages will attach the next article slot automatically.
        await enqueueImages(articleId, userId);
      } else if (article.originalContent) {
        await enqueueRewrite(articleId, userId);
      } else {
        await enqueueExtract(articleId, userId);
      }

      return NextResponse.json({
        ok: true,
        scheduledFor: scheduledFor?.toISOString() ?? null,
      });
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
