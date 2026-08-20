import { NextRequest, NextResponse } from "next/server";
import {
  exchangePinterestCode,
  getPinterestUser,
  listPinterestBoards,
} from "@/lib/pinterest";
import { siteBaseUrl } from "@/lib/credentials";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const baseUrl = siteBaseUrl(req.url);

  if (error || !code || !state) {
    return NextResponse.redirect(new URL("/dashboard/pinterest?error=oauth", req.url));
  }

  try {
    // Same redirect_uri as authorize (baseUrl from request / NEXTAUTH_URL)
    const tokens = await exchangePinterestCode(code, state, { baseUrl });
    const profile = await getPinterestUser(tokens.access_token);
    const pinterestUserId = profile.id || profile.username || `user-${Date.now()}`;

    const account = await prisma.pinterestAccount.upsert({
      where: {
        userId_pinterestUserId: {
          userId: state,
          pinterestUserId,
        },
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
        username: profile.username,
      },
      create: {
        userId: state,
        pinterestUserId,
        username: profile.username,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : null,
      },
    });

    const boards = await listPinterestBoards(account.accessToken);
    for (const board of boards) {
      await prisma.pinterestBoard.upsert({
        where: {
          pinterestAccountId_boardId: {
            pinterestAccountId: account.id,
            boardId: board.id,
          },
        },
        update: { name: board.name, description: board.description },
        create: {
          pinterestAccountId: account.id,
          boardId: board.id,
          name: board.name,
          description: board.description,
        },
      });
    }

    return NextResponse.redirect(new URL("/dashboard/pinterest?connected=1", req.url));
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(new URL("/dashboard/pinterest?error=oauth", req.url));
  }
}
