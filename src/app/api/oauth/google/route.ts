import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGoogleAuthUrl } from "@/lib/google";
import { getGoogleAppCredentials, siteBaseUrl } from "@/lib/credentials";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const baseUrl = siteBaseUrl(req.url);
  const creds = await getGoogleAppCredentials(session.user.id, { baseUrl });
  if (!creds.clientId || !creds.clientSecret) {
    return NextResponse.redirect(new URL("/dashboard/settings?error=google_keys", baseUrl));
  }

  try {
    const url = await getGoogleAuthUrl(session.user.id, { baseUrl });
    return NextResponse.redirect(url);
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(new URL("/dashboard/settings?error=google_keys", baseUrl));
  }
}
