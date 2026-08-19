import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  enqueueExtract,
  enqueueRewrite,
  enqueueImages,
  enqueueBlogger,
  enqueuePinterest,
} from "@/lib/queue";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = req.nextUrl.searchParams.get("status");
  const take = Number(req.nextUrl.searchParams.get("take") || 50);

  const articles = await prisma.article.findMany({
    where: {
      userId: session.user.id,
      ...(status ? { status: status as never } : {}),
    },
    include: {
      bloggerBlog: true,
      sitemapSource: true,
    },
    orderBy: { createdAt: "desc" },
    take,
  });

  return NextResponse.json(articles);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { articleId, action } = await req.json();
  const article = await prisma.article.findFirst({
    where: { id: articleId, userId: session.user.id },
  });
  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.article.update({
    where: { id: articleId },
    data: { errorMessage: null },
  });

  switch (action) {
    case "extract":
      await enqueueExtract(articleId, session.user.id);
      break;
    case "rewrite":
      await enqueueRewrite(articleId, session.user.id);
      break;
    case "images":
      await enqueueImages(articleId, session.user.id);
      break;
    case "blogger":
      await enqueueBlogger(articleId, session.user.id);
      break;
    case "pinterest":
      await enqueuePinterest(articleId, session.user.id);
      break;
    case "retry":
      await enqueueExtract(articleId, session.user.id);
      break;
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
