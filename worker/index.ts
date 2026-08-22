import { prisma } from "../src/lib/prisma";
import {
  QUEUE_NAMES,
  enqueueExtract,
  enqueueRewrite,
  enqueueImages,
  enqueueBlogger,
  enqueuePinterest,
  enqueueCrawl,
  enqueueSchedulerTick,
  parseTags,
  stringifyTags,
} from "../src/lib/queue";
import { parseSitemapEntries, extractArticleContent, titleFromSourceUrl } from "../src/lib/extract";
import { mergeOriginalImages } from "../src/lib/rewrite-html";
import { hashUrl } from "../src/lib/crypto";
import { rewriteArticle, generateImage, buildImagePrompt } from "../src/lib/openrouter";
import { generatePinCopy } from "../src/lib/pin-copy";
import {
  parsePinTypes,
  pinTypeForIndex,
  imageHintForPinType,
} from "../src/lib/pin-types";
import { uploadImageFromUrl } from "../src/lib/r2";
import { publishToBlogger } from "../src/lib/google";
import {
  createPinterestBoard,
  createPinterestPin,
  listPinterestBoards,
} from "../src/lib/pinterest";
import {
  canPublishBlog,
  canCreatePin,
  canGenerateImage,
  resetDailyCountersIfNeeded,
  scheduleToMs,
  isSameUtcDay,
  canRunScheduledWork,
  parsePostTimes,
  scheduledForSlot,
  nextAssignedSlotUtc,
  countExtractsStartedToday,
  dueArticleSlotsToday,
} from "../src/lib/limits";
import { parseCategories, resolveCategory } from "../src/lib/blog-categories";
import { deriveKeywordBoardName } from "../src/lib/keyword-board";

const MAX_ATTEMPTS = 3;
const POLL_MS = 2000;
const SCHEDULER_EVERY_MS = 15 * 60 * 1000;

type JobRow = {
  id: string;
  queueName: string;
  payload: string | null;
  articleId: string | null;
  userId: string | null;
  attempts: number;
};

function payloadOf(job: JobRow): Record<string, unknown> {
  if (!job.payload) return {};
  try {
    return JSON.parse(job.payload) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function claimNextJob(): Promise<JobRow | null> {
  const now = new Date();
  const next = await prisma.jobRun.findFirst({
    where: {
      status: "QUEUED",
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
    },
    // Only ready jobs (due or unscheduled); oldest first.
    orderBy: { createdAt: "asc" },
  });
  if (!next) return null;

  const updated = await prisma.jobRun.updateMany({
    where: { id: next.id, status: "QUEUED" },
    data: {
      status: "ACTIVE",
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });

  if (updated.count === 0) return null;
  return prisma.jobRun.findUnique({ where: { id: next.id } });
}

async function completeJob(id: string) {
  await prisma.jobRun.update({
    where: { id },
    data: { status: "COMPLETED", finishedAt: new Date(), error: null },
  });
}

async function failJob(job: JobRow, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const retry = job.attempts < MAX_ATTEMPTS;

  await prisma.jobRun.update({
    where: { id: job.id },
    data: {
      status: retry ? "QUEUED" : "FAILED",
      error: message,
      finishedAt: retry ? null : new Date(),
    },
  });

  const articleId =
    job.articleId || (payloadOf(job).articleId as string | undefined);
  if (!retry && articleId) {
    const art = await prisma.article.findUnique({
      where: { id: articleId },
      select: { bloggerPostUrl: true, bloggerPostId: true },
    });
    if (art?.bloggerPostUrl || art?.bloggerPostId) {
      await prisma.article.update({
        where: { id: articleId },
        data: {
          status: "COMPLETED",
          errorMessage: `Pins skipped: ${message}`,
        },
      });
    } else {
      await prisma.article.update({
        where: { id: articleId },
        data: { status: "FAILED", errorMessage: message },
      });
    }
  }
}

async function handleCrawl(job: JobRow) {
  const { sitemapSourceId } = payloadOf(job) as { sitemapSourceId: string };
  const source = await prisma.sitemapSource.findUniqueOrThrow({
    where: { id: sitemapSourceId },
    include: { blogLinks: true },
  });

  const entries = await parseSitemapEntries(source.url);
  let urlsNew = 0;
  const defaultBlogId = source.blogLinks[0]?.bloggerBlogId;
  const settings = await prisma.aiSettings.findUnique({
    where: { userId: source.userId },
  });
  const blog = defaultBlogId
    ? await prisma.bloggerBlog.findUnique({ where: { id: defaultBlogId } })
    : null;
  const discoveredCount = defaultBlogId
    ? await prisma.article.count({
        where: { bloggerBlogId: defaultBlogId, status: "DISCOVERED" },
      })
    : 0;
  const now = new Date();

  for (const entry of entries) {
    const sourceUrlHash = hashUrl(entry.loc);
    const title = (entry.title || "").trim() || titleFromSourceUrl(entry.loc);
    const scheduledAt = defaultBlogId
      ? nextAssignedSlotUtc(
          settings || {},
          discoveredCount + urlsNew,
          now,
          blog?.dailyLimit || 5
        )
      : null;
    try {
      await prisma.article.create({
        data: {
          userId: source.userId,
          sitemapSourceId: source.id,
          bloggerBlogId: defaultBlogId,
          sourceUrl: entry.loc,
          sourceUrlHash,
          status: "DISCOVERED",
          originalTitle: title,
          scheduledAt,
          originalMeta: entry.images.length
            ? JSON.stringify({ sitemapImages: entry.images })
            : undefined,
        },
      });
      urlsNew += 1;
      // Do NOT auto-enqueue extract/rewrite — scheduler respects dailyLimit.
    } catch {
      // duplicate
    }
  }

  await prisma.crawlHistory.create({
    data: {
      sitemapSourceId: source.id,
      urlsFound: entries.length,
      urlsNew,
      status: "success",
    },
  });

  await prisma.sitemapSource.update({
    where: { id: source.id },
    data: { lastCrawledAt: new Date(), lastError: null },
  });
}

async function handleExtract(job: JobRow) {
  const { articleId } = payloadOf(job) as { articleId: string };
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });

  await prisma.article.update({
    where: { id: article.id },
    data: { status: "EXTRACTING", errorMessage: null },
  });

  let priorMeta: Record<string, unknown> = {};
  try {
    priorMeta = article.originalMeta ? JSON.parse(article.originalMeta) : {};
  } catch {
    priorMeta = {};
  }
  const extraImages = Array.isArray(priorMeta.sitemapImages)
    ? priorMeta.sitemapImages.filter((u: unknown): u is string => typeof u === "string")
    : [];
  const forcePublishNow = Boolean(priorMeta.forcePublishNow);

  const extracted = await extractArticleContent(article.sourceUrl, { extraImages });

  const nextMeta: Record<string, unknown> = {
    ...priorMeta,
    metaDescription: extracted.metaDescription,
    headings: extracted.headings,
    images: extracted.images,
    tags: extracted.tags,
    featuredImage: extracted.featuredImage,
    sitemapImages: extraImages,
  };
  if (forcePublishNow) nextMeta.forcePublishNow = true;
  else delete nextMeta.forcePublishNow;

  await prisma.article.update({
    where: { id: article.id },
    data: {
      originalTitle: extracted.title,
      originalContent: extracted.content,
      metaDescription: extracted.metaDescription || undefined,
      originalMeta: JSON.stringify(nextMeta),
      tags: stringifyTags(extracted.tags),
      status: forcePublishNow ? "PUBLISHING" : "REWRITING",
    },
  });

  if (forcePublishNow) {
    await enqueueBlogger(article.id, article.userId, null, { immediate: true });
  } else {
    await enqueueRewrite(article.id, article.userId);
  }
}

async function handleRewrite(job: JobRow) {
  const { articleId } = payloadOf(job) as { articleId: string };
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: articleId },
    include: { bloggerBlog: true },
  });

  if (!article.originalContent) {
    throw new Error("Missing original content");
  }

  const categories = parseCategories(article.bloggerBlog?.categories);
  let meta: Record<string, unknown> = {};
  try {
    meta = article.originalMeta ? JSON.parse(article.originalMeta) : {};
  } catch {
    meta = {};
  }
  const extraImageUrls = [
    typeof meta.featuredImage === "string" ? meta.featuredImage : "",
    ...(Array.isArray(meta.images)
      ? meta.images.filter((u: unknown): u is string => typeof u === "string")
      : []),
  ].filter(Boolean);

  const result = await rewriteArticle(article.userId, {
    title: article.originalTitle || titleFromSourceUrl(article.sourceUrl),
    content: article.originalContent,
    url: article.sourceUrl,
    categories,
    extraImageUrls,
  });

  const html = mergeOriginalImages(
    article.originalContent,
    result.faqHtml ? `${result.html}\n<section class="faq">${result.faqHtml}</section>` : result.html,
    extraImageUrls,
    article.sourceUrl
  );

  const bloggerCategory = resolveCategory(result.category, categories);

  await prisma.article.update({
    where: { id: article.id },
    data: {
      rewrittenTitle: result.title,
      rewrittenHtml: html,
      metaTitle: result.metaTitle,
      metaDescription: result.metaDescription,
      faqHtml: result.faqHtml,
      tags: stringifyTags(result.tags),
      slug: result.slug,
      bloggerCategory,
      status: "IMAGING",
    },
  });

  await enqueueImages(article.id, article.userId);
}

async function handleImages(job: JobRow) {
  const { articleId } = payloadOf(job) as { articleId: string };
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
  let meta: Record<string, unknown> = {};
  try {
    meta = article.originalMeta ? JSON.parse(article.originalMeta) : {};
  } catch {
    meta = {};
  }
  if (Boolean(meta.forcePublishNow)) {
    delete meta.forcePublishNow;
    await prisma.article.update({
      where: { id: article.id },
      data: { originalMeta: JSON.stringify(meta), status: "PUBLISHING" },
    });
    await enqueueBlogger(article.id, article.userId, null, { immediate: true });
    return;
  }

  const settings = await prisma.aiSettings.upsert({
    where: { userId: article.userId },
    update: {},
    create: { userId: article.userId },
  });

  const pinsNeeded = Math.max(1, Math.min(20, settings.pinsPerArticle || 1));
  const pinTypes = parsePinTypes(settings.pinTypes);
  const imagesNeeded = 1 + pinsNeeded;

  if (!(await canGenerateImage(article.userId))) {
    throw new Error("Daily image limit reached");
  }

  const title = article.rewrittenTitle || article.originalTitle || "Article";
  const excerpt = article.metaDescription || article.originalContent?.slice(0, 400) || title;

  const featuredRaw = await generateImage(
    article.userId,
    buildImagePrompt(title, excerpt, false, 1),
    { vertical: false }
  );

  const pinUrls: string[] = [];
  const pinTypeOrder: string[] = [];
  for (let i = 0; i < pinsNeeded; i++) {
    const pinType = pinTypeForIndex(pinTypes, i);
    pinTypeOrder.push(pinType);
    const typeHint = imageHintForPinType(pinType);
    const prompt = `${buildImagePrompt(title, excerpt, true, i + 1, pinType)} ${typeHint}`;
    const pinRaw = await generateImage(article.userId, prompt, { vertical: true });
    pinUrls.push(await uploadImageFromUrl(pinRaw, "pinterest"));
  }

  const featuredImageUrl = await uploadImageFromUrl(featuredRaw, "featured");
  const pinterestImageUrl = pinUrls[0];

  await prisma.aiSettings.update({
    where: { userId: article.userId },
    data: {
      imagesToday: { increment: imagesNeeded },
      imagesDay: new Date(),
    },
  });

  const htmlWithImage = article.rewrittenHtml
    ? `<p><img src="${featuredImageUrl}" alt="${title}" /></p>\n${article.rewrittenHtml}`
    : article.rewrittenHtml;

  meta.pinterestImageUrls = pinUrls;
  meta.pinterestPinTypes = pinTypeOrder;

  await prisma.article.update({
    where: { id: article.id },
    data: {
      featuredImageUrl,
      pinterestImageUrl,
      rewrittenHtml: htmlWithImage,
      originalMeta: JSON.stringify(meta),
      status: "PUBLISHING",
    },
  });

  // Schedule Blogger publish for the next article time slot (GMT+5 wall clock), if configured.
  let bloggerAt: Date | null = null;
  if (article.bloggerBlogId) {
    const blog = await prisma.bloggerBlog.findUnique({ where: { id: article.bloggerBlogId } });
    if (blog) {
      const articleTimes = parsePostTimes(settings.articlePostTimes);
      const slotIndex = isSameUtcDay(blog.publishedDay) ? blog.publishedToday : 0;
      bloggerAt = scheduledForSlot(articleTimes, slotIndex);
      if (bloggerAt) {
        await prisma.article.update({
          where: { id: article.id },
          data: { scheduledAt: bloggerAt },
        });
      }
    }
  }
  await enqueueBlogger(article.id, article.userId, bloggerAt);
}

async function handleBlogger(job: JobRow) {
  const payload = payloadOf(job) as { articleId: string; immediate?: boolean };
  const { articleId } = payload;
  const immediate = Boolean(payload.immediate);
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: articleId },
    include: {
      bloggerBlog: { include: { googleAccount: true, pinterestMap: true } },
    },
  });

  if (!article.bloggerBlog) {
    throw new Error("No Blogger blog assigned to article");
  }
  if (!immediate && !(await canPublishBlog(article.bloggerBlog.id))) {
    throw new Error("Daily blog publish limit reached or blog disabled");
  }

  // Respect per-article clock times (article #1 → first slot, #2 → second, …).
  // Publish now (immediate) ignores slot delays.
  if (!immediate) {
    const aiForArticle = await prisma.aiSettings.findUnique({
      where: { userId: article.userId },
    });
    const articleTimes = parsePostTimes(aiForArticle?.articlePostTimes);
    if (articleTimes.length) {
      const slotIndex = isSameUtcDay(article.bloggerBlog.publishedDay)
        ? article.bloggerBlog.publishedToday
        : 0;
      const at = scheduledForSlot(articleTimes, slotIndex);
      if (at && at.getTime() > Date.now() + 1500) {
        await enqueueBlogger(article.id, article.userId, at);
        return;
      }
    }
  }

  const isDraft = article.bloggerBlog.publishMode === "DRAFT";
  const categoryLabel = article.bloggerCategory?.trim();
  const labels = categoryLabel
    ? [categoryLabel]
    : parseTags(article.tags).slice(0, 5);
  const content =
    (article.rewrittenHtml && article.rewrittenHtml.trim()) ||
    article.originalContent ||
    "";
  if (!content.trim()) {
    throw new Error("No article HTML to publish");
  }
  const post = await publishToBlogger({
    googleAccountId: article.bloggerBlog.googleAccountId,
    blogId: article.bloggerBlog.blogId,
    title: article.rewrittenTitle || article.originalTitle || "Untitled",
    content,
    labels,
    isDraft,
  });

  await prisma.bloggerBlog.update({
    where: { id: article.bloggerBlog.id },
    data: {
      publishedToday: { increment: 1 },
      publishedDay: new Date(),
      lastPublishedAt: new Date(),
    },
  });

  const mappedAccountId = article.bloggerBlog.pinterestMap?.pinterestAccountId;
  const hasPinImage = Boolean(article.pinterestImageUrl);
  let pinMeta: { pinterestImageUrls?: unknown } = {};
  try {
    pinMeta = article.originalMeta ? JSON.parse(article.originalMeta) : {};
  } catch {
    pinMeta = {};
  }
  const pinUrls = Array.isArray(pinMeta.pinterestImageUrls)
    ? pinMeta.pinterestImageUrls
    : [];
  const canPin = Boolean(mappedAccountId && (hasPinImage || pinUrls.length));

  await prisma.article.update({
    where: { id: article.id },
    data: {
      bloggerPostId: post.id || null,
      bloggerPostUrl: post.url || null,
      pinterestAccountId: mappedAccountId || article.pinterestAccountId,
      publishedAt: new Date(),
      status: canPin ? "PINNING" : "COMPLETED",
      errorMessage: canPin
        ? null
        : mappedAccountId
          ? "Published to Blogger. Pins skipped (no pin images)."
          : "Published to Blogger. Pins skipped (no Pinterest pair).",
    },
  });

  if (!canPin) return;

  // First pin uses the next global pin slot for today (GMT+5).
  // Publish now chains pins immediately.
  const ai = await prisma.aiSettings.findUnique({ where: { userId: article.userId } });
  const pinTimes = parsePostTimes(ai?.pinPostTimes);
  const account = await prisma.pinterestAccount.findUnique({ where: { id: mappedAccountId! } });
  const pinSlot = account && isSameUtcDay(account.pinsDay) ? account.pinsToday : 0;
  const pinAt = immediate ? null : scheduledForSlot(pinTimes, pinSlot);
  await enqueuePinterest(
    article.id,
    article.userId,
    pinAt,
    immediate ? { immediate: true } : undefined
  );
}

async function ensureBoards(
  account: { id: string; accessToken: string },
  count: number,
  baseName: string
): Promise<Array<{ boardId: string; name: string }>> {
  const existing = await listPinterestBoards(account.accessToken);
  const boards: Array<{ boardId: string; name: string }> = [];

  for (let i = 1; i <= count; i++) {
    const name = count === 1 ? baseName : `${baseName} ${i}`;
    const found = existing.find((b) => b.name.toLowerCase() === name.toLowerCase());
    if (found) {
      await prisma.pinterestBoard.upsert({
        where: {
          pinterestAccountId_boardId: {
            pinterestAccountId: account.id,
            boardId: found.id,
          },
        },
        update: { name: found.name },
        create: {
          pinterestAccountId: account.id,
          boardId: found.id,
          name: found.name,
          description: found.description,
        },
      });
      boards.push({ boardId: found.id, name: found.name });
      continue;
    }

    const created = await createPinterestBoard(
      account.accessToken,
      name,
      `Auto-created board for ${baseName}`
    );
    await prisma.pinterestBoard.create({
      data: {
        pinterestAccountId: account.id,
        boardId: created.id,
        name: created.name,
      },
    });
    boards.push({ boardId: created.id, name: created.name });
  }

  return boards;
}

/** Create or reuse a Pinterest board named after the article's main keyword. */
async function ensureKeywordBoard(
  account: { id: string; accessToken: string },
  boardName: string
): Promise<{ boardId: string; name: string }> {
  const name = boardName.trim() || "Untitled";
  const existing = await listPinterestBoards(account.accessToken);
  const found = existing.find((b) => b.name.toLowerCase() === name.toLowerCase());
  if (found) {
    await prisma.pinterestBoard.upsert({
      where: {
        pinterestAccountId_boardId: {
          pinterestAccountId: account.id,
          boardId: found.id,
        },
      },
      update: { name: found.name },
      create: {
        pinterestAccountId: account.id,
        boardId: found.id,
        name: found.name,
        description: found.description,
      },
    });
    return { boardId: found.id, name: found.name };
  }

  const created = await createPinterestBoard(
    account.accessToken,
    name,
    `Keyword board for ${name}`
  );
  await prisma.pinterestBoard.create({
    data: {
      pinterestAccountId: account.id,
      boardId: created.id,
      name: created.name || name,
    },
  });
  return { boardId: created.id, name: created.name || name };
}

async function handlePinterest(job: JobRow) {
  const payload = payloadOf(job) as { articleId: string; immediate?: boolean };
  const { articleId } = payload;
  const immediate = Boolean(payload.immediate);
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: articleId },
    include: {
      bloggerBlog: { include: { pinterestMap: { include: { pinterestBoard: true } } } },
      pinterestAccount: true,
    },
  });

  const settings = await prisma.aiSettings.upsert({
    where: { userId: article.userId },
    update: {},
    create: { userId: article.userId },
  });

  const pinsPerArticle = Math.max(1, Math.min(20, settings.pinsPerArticle || 1));
  const pinTypes = parsePinTypes(settings.pinTypes);

  // Always pin via the blog's mapped Pinterest account — never a random/fallback account.
  const mappedAccountId = article.bloggerBlog?.pinterestMap?.pinterestAccountId;
  if (!mappedAccountId) {
    throw new Error(
      "Blog is not paired with a Pinterest account. Save a Pinterest pair on the Blogger page before pinning."
    );
  }

  if (article.pinterestAccountId !== mappedAccountId) {
    await prisma.article.update({
      where: { id: article.id },
      data: { pinterestAccountId: mappedAccountId },
    });
  }

  const account = await prisma.pinterestAccount.findUniqueOrThrow({
    where: { id: mappedAccountId },
  });

  let pinImageUrls: string[] = [];
  let storedPinTypes: string[] = [];
  try {
    const meta = article.originalMeta ? JSON.parse(article.originalMeta) : {};
    if (Array.isArray(meta.pinterestImageUrls)) {
      pinImageUrls = meta.pinterestImageUrls.filter((u: unknown) => typeof u === "string");
    }
    if (Array.isArray(meta.pinterestPinTypes)) {
      storedPinTypes = meta.pinterestPinTypes.filter((t: unknown) => typeof t === "string");
    }
  } catch {
    pinImageUrls = [];
  }
  if (!pinImageUrls.length && article.pinterestImageUrl) {
    pinImageUrls = [article.pinterestImageUrl];
  }
  if (!pinImageUrls.length) {
    if (article.bloggerPostUrl || article.bloggerPostId) {
      await prisma.article.update({
        where: { id: article.id },
        data: {
          status: "COMPLETED",
          errorMessage: "Published to Blogger. Pins skipped (no pin images).",
        },
      });
      return;
    }
    throw new Error("Missing Pinterest image");
  }

  const mappedBoard = article.bloggerBlog?.pinterestMap?.pinterestBoard;
  if (
    mappedBoard &&
    mappedBoard.pinterestAccountId &&
    mappedBoard.pinterestAccountId !== account.id
  ) {
    throw new Error(
      "Mapped Pinterest board does not belong to the paired account. Re-save the blog's Pinterest pair."
    );
  }

  // One keyword board per article — all pins go here (boardsPerArticle ignored).
  const keywordName = deriveKeywordBoardName(article);
  const boards = [await ensureKeywordBoard(account, keywordName)];

  const link = article.bloggerPostUrl || article.sourceUrl;
  const titleBase = article.rewrittenTitle || article.originalTitle || "Pin";
  const articleExcerpt =
    article.metaDescription ||
    article.rewrittenHtml?.replace(/<[^>]+>/g, " ").slice(0, 2000) ||
    article.originalContent?.slice(0, 2000) ||
    titleBase;

  const alreadyPinned = await prisma.pinRecord.count({ where: { articleId: article.id } });
  if (alreadyPinned >= pinsPerArticle) {
    const first = await prisma.pinRecord.findFirst({
      where: { articleId: article.id },
      orderBy: { createdAt: "asc" },
    });
    await prisma.article.update({
      where: { id: article.id },
      data: {
        pinId: first?.pinId || article.pinId,
        pinUrl: first?.pinUrl || article.pinUrl,
        status: "COMPLETED",
        errorMessage: null,
      },
    });
    return;
  }

  const i = alreadyPinned;
  if (!(await canCreatePin(account.id))) {
    throw new Error("Daily pin limit reached");
  }

  const board = boards[i % boards.length];
  const imageUrl = pinImageUrls[i % pinImageUrls.length];
  const pinType = storedPinTypes[i] || pinTypeForIndex(pinTypes, i);
  const pinTimes = parsePostTimes(settings.pinPostTimes);
  const pinSlot = isSameUtcDay(account.pinsDay) ? account.pinsToday : 0;
  const slotAt = immediate ? null : scheduledForSlot(pinTimes, pinSlot);

  // If this pin's slot is still in the future, re-queue and wait (don't dump early).
  // Publish now (immediate) skips the wait.
  if (!immediate && slotAt && slotAt.getTime() > Date.now() + 1500) {
    await enqueuePinterest(article.id, article.userId, slotAt);
    return;
  }

  const copy = await generatePinCopy(article.userId, {
    articleTitle: titleBase,
    articleExcerpt,
    pinType,
    pinIndex: i,
    link,
  });

  const pin = await createPinterestPin(account.accessToken, {
    boardId: board.boardId,
    title: copy.title,
    description: copy.description,
    link,
    imageUrl,
  });

  const pinUrl = `https://www.pinterest.com/pin/${pin.id}/`;

  await prisma.pinRecord.create({
    data: {
      userId: article.userId,
      articleId: article.id,
      pinterestAccountId: account.id,
      boardId: board.boardId,
      boardName: board.name,
      pinId: pin.id,
      pinUrl,
      title: copy.title,
      description: copy.description,
      pinType,
      scheduledFor: slotAt,
    },
  });

  await prisma.pinterestAccount.update({
    where: { id: account.id },
    data: { pinsToday: { increment: 1 }, pinsDay: new Date() },
  });

  const done = i + 1 >= pinsPerArticle;
  const firstPinId = article.pinId || pin.id;
  const firstPinUrl = article.pinUrl || pinUrl;

  await prisma.article.update({
    where: { id: article.id },
    data: {
      pinId: firstPinId,
      pinUrl: firstPinUrl,
      status: done ? "COMPLETED" : "PINNING",
      errorMessage: null,
    },
  });

  if (!done) {
    const refreshed = await prisma.pinterestAccount.findUniqueOrThrow({
      where: { id: account.id },
    });
    const nextSlot = isSameUtcDay(refreshed.pinsDay) ? refreshed.pinsToday : 0;
    const nextAt = immediate ? null : scheduledForSlot(pinTimes, nextSlot);
    await enqueuePinterest(
      article.id,
      article.userId,
      nextAt,
      immediate ? { immediate: true } : undefined
    );
  }
}

async function enqueueDailyDiscoveredArticles() {
  const blogs = await prisma.bloggerBlog.findMany({
    where: { enabled: true },
    include: { googleAccount: true, pinterestMap: true },
  });
  const now = new Date();

  for (const blog of blogs) {
    if (!blog.pinterestMap?.pinterestAccountId) continue;

    const settings = await prisma.aiSettings.findUnique({
      where: { userId: blog.googleAccount.userId },
    });

    if (
      !canRunScheduledWork(settings, {
        requirePreferredHour: blog.schedule === "DAILY",
      }, now)
    ) {
      continue;
    }

    const startedToday = await countExtractsStartedToday(blog.id);
    const dailyLimit = Math.max(0, blog.dailyLimit || 0);
    if (startedToday >= dailyLimit) continue;

    const articleTimes = parsePostTimes(settings?.articlePostTimes);
    const dueSlots = dueArticleSlotsToday(articleTimes, now);
    const slotCap = dueSlots == null ? dailyLimit : dueSlots;
    const remaining = Math.min(dailyLimit, slotCap) - startedToday;
    if (remaining <= 0) continue;

    const discovered = await prisma.article.findMany({
      where: { bloggerBlogId: blog.id, status: "DISCOVERED" },
      orderBy: { createdAt: "asc" },
      take: remaining + 5,
    });

    let enqueued = 0;
    for (const article of discovered) {
      if (enqueued >= remaining) break;
      const existing = await prisma.jobRun.findFirst({
        where: {
          articleId: article.id,
          queueName: QUEUE_NAMES.EXTRACT_ARTICLE,
          status: { in: ["QUEUED", "ACTIVE", "RETRYING"] },
        },
      });
      if (existing) continue;

      // Stagger by articlePostTimes when configured
      let scheduledFor: Date | null = null;
      if (articleTimes.length) {
        const slotIndex = startedToday + enqueued;
        scheduledFor = scheduledForSlot(articleTimes, slotIndex, now);
      }
      await enqueueExtract(article.id, blog.googleAccount.userId, scheduledFor);
      if (scheduledFor) {
        await prisma.article.update({
          where: { id: article.id },
          data: { scheduledAt: scheduledFor },
        });
      }
      enqueued += 1;
    }
  }
}

async function handleScheduler() {
  await resetDailyCountersIfNeeded();

  const sources = await prisma.sitemapSource.findMany({ where: { enabled: true } });
  const now = new Date();
  const nowMs = now.getTime();

  for (const source of sources) {
    const settings = await prisma.aiSettings.findUnique({
      where: { userId: source.userId },
    });
    const schedule = (settings?.defaultSchedule || "HOURLY") as
      | "EVERY_15_MIN"
      | "HOURLY"
      | "EVERY_6_HOURS"
      | "DAILY"
      | "MANUAL";
    const interval = scheduleToMs(schedule);
    if (interval === null) continue;

    if (
      !canRunScheduledWork(settings, {
        requirePreferredHour: schedule === "DAILY",
      }, now)
    ) {
      continue;
    }

    const last = source.lastCrawledAt?.getTime() || 0;
    if (nowMs - last >= interval) {
      await enqueueCrawl(source.id, source.userId);
    }
  }

  const blogs = await prisma.bloggerBlog.findMany({
    where: { enabled: true },
    include: { sitemapLinks: true, googleAccount: true, pinterestMap: true },
  });

  for (const blog of blogs) {
    if (!blog.pinterestMap?.pinterestAccountId) {
      console.warn(
        `[worker] skipping enabled blog ${blog.id} (${blog.name}): no Pinterest pair`
      );
      continue;
    }

    const settings = await prisma.aiSettings.findUnique({
      where: { userId: blog.googleAccount.userId },
    });
    const schedule = blog.schedule;
    const interval = scheduleToMs(schedule);
    if (interval === null) continue;

    if (
      !canRunScheduledWork(settings, {
        requirePreferredHour: schedule === "DAILY",
      }, now)
    ) {
      continue;
    }

    const last = blog.lastPublishedAt?.getTime() || 0;
    if (nowMs - last < interval) continue;
    if (!(await canPublishBlog(blog.id))) continue;
    for (const link of blog.sitemapLinks) {
      await enqueueCrawl(link.sitemapSourceId, blog.googleAccount.userId);
    }
  }

  // Start only up to dailyLimit DISCOVERED articles (extract→rewrite→…).
  await enqueueDailyDiscoveredArticles();

  // Reset old failures to DISCOVERED so they re-enter the daily quota pool (no flood).
  const failed = await prisma.article.findMany({
    where: { status: "FAILED" },
    take: 20,
    orderBy: { updatedAt: "asc" },
  });

  for (const article of failed) {
    if (!isSameUtcDay(article.updatedAt)) {
      await prisma.article.update({
        where: { id: article.id },
        data: { status: "DISCOVERED", errorMessage: null },
      });
    }
  }
}

async function processJob(job: JobRow) {
  switch (job.queueName) {
    case QUEUE_NAMES.CRAWL_SITEMAP:
      await handleCrawl(job);
      break;
    case QUEUE_NAMES.EXTRACT_ARTICLE:
      await handleExtract(job);
      break;
    case QUEUE_NAMES.REWRITE_AI:
      await handleRewrite(job);
      break;
    case QUEUE_NAMES.GENERATE_IMAGES:
      await handleImages(job);
      break;
    case QUEUE_NAMES.PUBLISH_BLOGGER:
      await handleBlogger(job);
      break;
    case QUEUE_NAMES.PUBLISH_PINTEREST:
      await handlePinterest(job);
      break;
    case QUEUE_NAMES.SCHEDULER:
      await handleScheduler();
      break;
    default:
      throw new Error(`Unknown queue: ${job.queueName}`);
  }
}

async function pollOnce() {
  const job = await claimNextJob();
  if (!job) return false;

  console.log(`[worker] ${job.queueName} ${job.id}`);
  try {
    await processJob(job);
    await completeJob(job.id);
    console.log(`[worker] completed ${job.id}`);
  } catch (error) {
    console.error(`[worker] failed ${job.id}:`, error);
    await failJob(job, error);
  }
  return true;
}

async function main() {
  console.log("ContentOps worker starting (SQLite job queue, no Redis/Docker)...");

  setInterval(() => {
    enqueueSchedulerTick().catch(console.error);
  }, SCHEDULER_EVERY_MS);

  await enqueueSchedulerTick();

  for (;;) {
    try {
      const worked = await pollOnce();
      if (!worked) {
        await new Promise((r) => setTimeout(r, POLL_MS));
      }
    } catch (error) {
      console.error("[worker] poll error:", error);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
