import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGoogleAuthUrl } from "@/lib/google";
import { getGoogleAppCredentials } from "@/lib/credentials";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const creds = await getGoogleAppCredentials(session.user.id);
  if (!creds.clientId || !creds.clientSecret) {
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=google_keys", process.env.NEXTAUTH_URL || "http://localhost:3000")
    );
  }

  try {
    const url = await getGoogleAuthUrl(session.user.id);
    return NextResponse.redirect(url);
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(
      new URL("/dashboard/settings?error=google_keys", process.env.NEXTAUTH_URL || "http://localhost:3000")
    );
  }
}
