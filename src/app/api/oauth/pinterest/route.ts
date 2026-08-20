import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPinterestAuthUrl } from "@/lib/pinterest";
import { getPinterestAppCredentials, siteBaseUrl } from "@/lib/credentials";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = siteBaseUrl(req.url);
  const creds = await getPinterestAppCredentials(session.user.id, { baseUrl });
  if (!creds.appId || !creds.appSecret) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=pinterest_keys", baseUrl)
    );
  }

  try {
    const url = await getPinterestAuthUrl(session.user.id, { baseUrl });
    return NextResponse.redirect(url);
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=pinterest_keys", baseUrl)
    );
  }
}
