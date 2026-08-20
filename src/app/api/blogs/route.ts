import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchBlogCategories } from "@/lib/google";
import { parseCategories, serializeCategories } from "@/lib/blog-categories";
import { purgeOrphanPipelineData } from "@/lib/pipeline-cleanup";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.googleAccount.findMany({
    where: { userId: session.user.id },
    include: {
      blogs: {
        include: {
          pinterestMap: {
            include: {
              pinterestAccount: { select: { id: true, username: true } },
              pinterestBoard: { select: { id: true, name: true } },
            },
          },
          sitemapLinks: true,
          _count: { select: { articles: true } },
        },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { email: "asc" },
  });

  const shaped = accounts.map((account) => ({
    ...account,
    blogs: account.blogs.map((blog) => ({
      ...blog,
      categoryList: parseCategories(blog.categories),
      articleCount: blog._count.articles,
    })),
  }));

  return NextResponse.json(shaped);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action, blogId } = body as { action?: string; blogId?: string };

  if (action !== "sync_categories" || !blogId) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const blog = await prisma.bloggerBlog.findFirst({
    where: {
      id: blogId,
      googleAccount: { userId: session.user.id },
    },
  });
  if (!blog) {
    return NextResponse.json({ error: "Blog not found" }, { status: 404 });
  }

  try {
    const categories = await fetchBlogCategories(blog.googleAccountId, blog.blogId);
    const updated = await prisma.bloggerBlog.update({
      where: { id: blog.id },
      data: {
        categories: serializeCategories(categories),
        categoriesSyncedAt: new Date(),
      },
    });
    return NextResponse.json({
      ok: true,
      categories,
      categoriesSyncedAt: updated.categoriesSyncedAt,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Category sync failed" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { blogId, enabled, schedule, dailyLimit, publishMode } = body;

  const blog = await prisma.bloggerBlog.findFirst({
    where: {
      id: blogId,
      googleAccount: { userId: session.user.id },
    },
    include: { pinterestMap: true },
  });

  if (!blog) {
    return NextResponse.json({ error: "Blog not found" }, { status: 404 });
  }

  if (enabled === true && !blog.pinterestMap?.pinterestAccountId) {
    return NextResponse.json(
      {
        error:
          "Pair this blog with a Pinterest account before enabling automation.",
      },
      { status: 400 }
    );
  }

  const updated = await prisma.bloggerBlog.update({
    where: { id: blogId },
    data: {
      ...(typeof enabled === "boolean" ? { enabled } : {}),
      ...(schedule ? { schedule } : {}),
      ...(typeof dailyLimit === "number" ? { dailyLimit } : {}),
      ...(publishMode ? { publishMode } : {}),
    },
    include: {
      pinterestMap: {
        include: {
          pinterestAccount: { select: { id: true, username: true } },
          pinterestBoard: { select: { id: true, name: true } },
        },
      },
    },
  });

  return NextResponse.json({
    ...updated,
    categoryList: parseCategories(updated.categories),
  });
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

  const account = await prisma.googleAccount.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!account) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const userId = session.user.id;
  await prisma.googleAccount.delete({ where: { id: account.id } });
  // Blog rows cascade; articles were SetNull. Clear orphans if nothing remains.
  await purgeOrphanPipelineData(userId);
  return NextResponse.json({ ok: true });
}
