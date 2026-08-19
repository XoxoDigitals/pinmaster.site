import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
        },
        orderBy: { name: "asc" },
      },
    },
    orderBy: { email: "asc" },
  });

  return NextResponse.json(accounts);
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

  return NextResponse.json(updated);
}
