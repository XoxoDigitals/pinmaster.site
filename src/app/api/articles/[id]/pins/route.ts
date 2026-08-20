import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generatePinCopy } from "@/lib/pin-copy";
import { parsePinTypes, pinTypeForIndex } from "@/lib/pin-types";
import { deriveKeywordBoardName } from "@/lib/keyword-board";

function parseMeta(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const generate = req.nextUrl.searchParams.get("generate") === "1";

  const article = await prisma.article.findFirst({
    where: { id, userId: session.user.id },
    include: { pins: { orderBy: { createdAt: "asc" } } },
  });
  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const settings = await prisma.aiSettings.upsert({
    where: { userId: session.user.id },
    update: {},
    create: { userId: session.user.id },
  });

  const pinsPerArticle = Math.max(1, Math.min(20, settings.pinsPerArticle || 1));
  const pinTypes = parsePinTypes(settings.pinTypes);
  const meta = parseMeta(article.originalMeta);
  const imageUrls = Array.isArray(meta.pinterestImageUrls)
    ? meta.pinterestImageUrls.filter((u): u is string => typeof u === "string")
    : article.pinterestImageUrl
      ? [article.pinterestImageUrl]
      : [];
  const storedTypes = Array.isArray(meta.pinterestPinTypes)
    ? meta.pinterestPinTypes.filter((t): t is string => typeof t === "string")
    : [];

  const boardName = deriveKeywordBoardName(article);
  const titleBase = article.rewrittenTitle || article.originalTitle || "Pin";
  const excerpt =
    article.metaDescription ||
    article.rewrittenHtml?.replace(/<[^>]+>/g, " ").slice(0, 2000) ||
    article.originalContent?.slice(0, 2000) ||
    titleBase;

  // Prefer saved PinRecords when present
  if (article.pins.length) {
    return NextResponse.json({
      boardName,
      pins: article.pins.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        pinType: p.pinType,
        imageUrl: null as string | null,
        pinUrl: p.pinUrl,
        boardName: p.boardName || boardName,
        scheduledFor: p.scheduledFor,
        status: "published" as const,
      })),
      imageUrls,
    });
  }

  const pins: Array<{
    id: string;
    title: string | null;
    description: string | null;
    pinType: string;
    imageUrl: string | null;
    pinUrl: string | null;
    boardName: string;
    scheduledFor: null;
    status: "draft";
  }> = [];

  for (let i = 0; i < pinsPerArticle; i++) {
    const pinType = storedTypes[i] || pinTypeForIndex(pinTypes, i);
    const imageUrl = imageUrls[i % imageUrls.length] || imageUrls[0] || null;
    let title: string | null = null;
    let description: string | null = null;

    if (generate && imageUrls.length) {
      const copy = await generatePinCopy(session.user.id, {
        articleTitle: titleBase,
        articleExcerpt: excerpt,
        pinType,
        pinIndex: i,
        link: article.bloggerPostUrl || article.sourceUrl,
      });
      title = copy.title;
      description = copy.description;
    }

    pins.push({
      id: `preview-${i}`,
      title,
      description,
      pinType,
      imageUrl,
      pinUrl: null,
      boardName,
      scheduledFor: null,
      status: "draft",
    });
  }

  return NextResponse.json({ boardName, pins, imageUrls });
}
