import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

function jsonError(error: unknown, fallback: string, status = 500) {
  const message = error instanceof Error ? error.message : fallback;
  if (message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (message === "FORBIDDEN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ error: fallback }, { status });
}

export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    return jsonError(error, "Unauthorized", 401);
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      disabled: true,
      createdAt: true,
    },
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (error) {
    return jsonError(error, "Unauthorized", 401);
  }

  const body = await req.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = body.name ? String(body.name).trim() : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: await bcrypt.hash(password, 10),
      role: "USER",
      aiSettings: { create: {} },
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      disabled: true,
      createdAt: true,
    },
  });

  return NextResponse.json(user, { status: 201 });
}
