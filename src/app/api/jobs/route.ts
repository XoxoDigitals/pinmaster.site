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
  const jobs = await prisma.jobRun.findMany({
    where: {
      userId: session.user.id,
      ...(status ? { status: status as never } : {}),
    },
    include: {
      article: {
        select: { id: true, sourceUrl: true, rewrittenTitle: true, originalTitle: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(jobs);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await req.json();
  const job = await prisma.jobRun.findFirst({
    where: { id: jobId, userId: session.user.id },
  });
  if (!job || !job.articleId) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const enqueueMap: Record<string, (id: string) => Promise<unknown>> = {
    "extract-article": enqueueExtract,
    "rewrite-ai": enqueueRewrite,
    "generate-images": enqueueImages,
    "publish-blogger": enqueueBlogger,
    "publish-pinterest": enqueuePinterest,
  };

  const fn = enqueueMap[job.queueName];
  if (!fn) {
    return NextResponse.json({ error: "Cannot retry this queue" }, { status: 400 });
  }

  await fn(job.articleId);
  return NextResponse.json({ ok: true });
}
