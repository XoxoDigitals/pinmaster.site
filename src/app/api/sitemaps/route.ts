import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enqueueCrawl } from "@/lib/queue";
import {
  deleteArticlesAndJobs,
  deleteCrawlJobsForSitemap,
  purgeOrphanPipelineData,
} from "@/lib/pipeline-cleanup";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sources = await prisma.sitemapSource.findMany({
    where: { userId: session.user.id },
    include: {
      crawlHistory: { orderBy: { createdAt: "desc" }, take: 5 },
      blogLinks: true,
      _count: { select: { articles: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(sources);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const url = String(body.url || "").trim();
  const type = body.type || "SITEMAP";
  const bloggerBlogId = body.bloggerBlogId as string | undefined;

  if (!url) {
    return NextResponse.json({ error: "URL required" }, { status: 400 });
  }

  const source = await prisma.sitemapSource.upsert({
    where: { userId_url: { userId: session.user.id, url } },
    update: { type, enabled: true },
    create: {
      userId: session.user.id,
      url,
      type,
    },
  });

  if (bloggerBlogId) {
    await prisma.blogSitemapLink.upsert({
      where: {
        bloggerBlogId_sitemapSourceId: {
          bloggerBlogId,
          sitemapSourceId: source.id,
        },
      },
      update: {},
      create: { bloggerBlogId, sitemapSourceId: source.id },
    });
  }

  await enqueueCrawl(source.id, session.user.id);
  return NextResponse.json(source, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const userId = session.user.id;

  const articles = await prisma.article.findMany({
    where: { sitemapSourceId: id, userId },
    select: { id: true },
  });

  await deleteCrawlJobsForSitemap(userId, id);
  await deleteArticlesAndJobs(
    userId,
    articles.map((a) => a.id)
  );

  await prisma.sitemapSource.deleteMany({
    where: { id, userId },
  });

  await purgeOrphanPipelineData(userId);

  return NextResponse.json({ ok: true });
}
