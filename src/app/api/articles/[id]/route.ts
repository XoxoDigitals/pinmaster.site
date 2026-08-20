import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCategories } from "@/lib/blog-categories";
import { deriveKeywordBoardName } from "@/lib/keyword-board";

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
    select: { pinsPerArticle: true, articlePostTimes: true, pinPostTimes: true },
  });

  return NextResponse.json({
    ...article,
    originalMeta,
    categoryList: parseCategories(article.bloggerBlog?.categories),
    keywordBoardName: deriveKeywordBoardName(article),
    pinsPerArticle: settings?.pinsPerArticle ?? 1,
    paired: Boolean(article.bloggerBlog?.pinterestMap?.pinterestAccountId),
  });
}
