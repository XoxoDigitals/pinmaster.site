import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enqueueCrawl } from "@/lib/queue";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await req.json();
  const source = await prisma.sitemapSource.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!source) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await enqueueCrawl(source.id, session.user.id);
  return NextResponse.json({ ok: true });
}
