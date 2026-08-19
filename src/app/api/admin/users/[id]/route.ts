import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

function jsonError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unauthorized";
  if (message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (message === "FORBIDDEN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ error: "Request failed" }, { status: 500 });
}

async function adminCount() {
  return prisma.user.count({ where: { role: "ADMIN", disabled: false } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return jsonError(error);
  }

  const { id } = await params;
  const body = await req.json();
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const data: { disabled?: boolean; name?: string | null; passwordHash?: string } = {};

  if (typeof body.disabled === "boolean") {
    if (body.disabled && target.role === "ADMIN" && (await adminCount()) <= 1) {
      return NextResponse.json({ error: "Cannot disable the last admin" }, { status: 400 });
    }
    if (body.disabled && target.id === admin.id) {
      return NextResponse.json({ error: "Cannot disable your own account" }, { status: 400 });
    }
    data.disabled = body.disabled;
  }

  if (body.name !== undefined) {
    data.name = body.name ? String(body.name).trim() : null;
  }

  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    data.passwordHash = await bcrypt.hash(body.password, 10);
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      disabled: true,
      createdAt: true,
    },
  });

  return NextResponse.json(user);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    return jsonError(error);
  }

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.id === admin.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }
  if (target.role === "ADMIN" && (await adminCount()) <= 1) {
    return NextResponse.json({ error: "Cannot delete the last admin" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
