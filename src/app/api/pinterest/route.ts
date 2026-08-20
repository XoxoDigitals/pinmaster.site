import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPinterestUser, resolvePinterestUsername } from "@/lib/pinterest";

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

  for (const account of accounts) {
    if (account.username) continue;
    try {
      const profile = await getPinterestUser(account.accessToken);
      const username = resolvePinterestUsername(profile);
      if (!username) continue;
      await prisma.pinterestAccount.update({
        where: { id: account.id },
        data: { username },
      });
      account.username = username;
    } catch {
      // Token may be expired; UI falls back to id until reconnect
    }
  }

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

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const account = await prisma.pinterestAccount.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!account) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.pinterestAccount.delete({ where: { id: account.id } });
  return NextResponse.json({ ok: true });
}
