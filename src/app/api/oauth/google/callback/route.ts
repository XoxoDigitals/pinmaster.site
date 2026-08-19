import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCode, listBlogsForAccount } from "@/lib/google";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code || !state) {
    return NextResponse.redirect(new URL("/dashboard/blogs?error=google_oauth", req.url));
  }

  try {
    const tokens = await exchangeGoogleCode(code, state);
    const account = await prisma.googleAccount.upsert({
      where: { userId_email: { userId: state, email: tokens.email } },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || undefined,
        expiresAt: tokens.expiresAt,
      },
      create: {
        userId: state,
        email: tokens.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      },
    });

    const blogs = await listBlogsForAccount(account.id);
    for (const blog of blogs) {
      if (!blog.id || !blog.name) continue;
      await prisma.bloggerBlog.upsert({
        where: {
          googleAccountId_blogId: {
            googleAccountId: account.id,
            blogId: blog.id,
          },
        },
        update: {
          name: blog.name,
          url: blog.url || undefined,
        },
        create: {
          googleAccountId: account.id,
          blogId: blog.id,
          name: blog.name,
          url: blog.url || undefined,
        },
      });
    }

    return NextResponse.redirect(new URL("/dashboard/blogs?connected=1", req.url));
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(new URL("/dashboard/blogs?error=google_oauth", req.url));
  }
}
