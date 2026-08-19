import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPinterestAuthUrl } from "@/lib/pinterest";
import { getPinterestAppCredentials } from "@/lib/credentials";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creds = await getPinterestAppCredentials(session.user.id);
  if (!creds.appId || !creds.appSecret) {
    return NextResponse.redirect(
      new URL(
        "/dashboard/settings?error=pinterest_keys",
        process.env.NEXTAUTH_URL || "http://localhost:3000"
      )
    );
  }

  try {
    const url = await getPinterestAuthUrl(session.user.id);
    return NextResponse.redirect(url);
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(
      new URL(
        "/dashboard/settings?error=pinterest_keys",
        process.env.NEXTAUTH_URL || "http://localhost:3000"
      )
    );
  }
}
