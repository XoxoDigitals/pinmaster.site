import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.pinterestAccount.findMany({
    where: { userId: session.user.id },
    include: { boards: true, mappings: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(accounts);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { accountId, dailyPinLimit } = body;

  const account = await prisma.pinterestAccount.findFirst({
    where: { id: accountId, userId: session.user.id },
  });
  if (!account) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.pinterestAccount.update({
    where: { id: accountId },
    data: {
      ...(typeof dailyPinLimit === "number" ? { dailyPinLimit } : {}),
    },
  });

  return NextResponse.json(updated);
}
