import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bloggerBlogId, pinterestAccountId, pinterestBoardId } = await req.json();

  if (!bloggerBlogId || !pinterestAccountId) {
    return NextResponse.json(
      { error: "bloggerBlogId and pinterestAccountId are required" },
      { status: 400 }
    );
  }

  const blog = await prisma.bloggerBlog.findFirst({
    where: {
      id: bloggerBlogId,
      googleAccount: { userId: session.user.id },
    },
  });
  if (!blog) {
    return NextResponse.json({ error: "Blog not found" }, { status: 404 });
  }

  const account = await prisma.pinterestAccount.findFirst({
    where: { id: pinterestAccountId, userId: session.user.id },
  });
  if (!account) {
    return NextResponse.json({ error: "Pinterest account not found" }, { status: 404 });
  }

  let resolvedBoardId: string | null = pinterestBoardId || null;
  if (resolvedBoardId) {
    const board = await prisma.pinterestBoard.findFirst({
      where: {
        id: resolvedBoardId,
        pinterestAccountId: account.id,
      },
    });
    if (!board) {
      return NextResponse.json(
        { error: "Board must belong to the selected Pinterest account" },
        { status: 400 }
      );
    }
  }

  const mapping = await prisma.blogPinterestMap.upsert({
    where: { bloggerBlogId },
    update: {
      pinterestAccountId,
      pinterestBoardId: resolvedBoardId,
    },
    create: {
      bloggerBlogId,
      pinterestAccountId,
      pinterestBoardId: resolvedBoardId,
    },
    include: {
      pinterestAccount: { select: { id: true, username: true } },
      pinterestBoard: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(mapping);
}
