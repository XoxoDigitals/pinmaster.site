import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import {
  getGoogleAppCredentials,
  type GoogleAppCredentials,
} from "@/lib/credentials";

export function createGoogleOAuthClient(creds: GoogleAppCredentials) {
  return new google.auth.OAuth2(creds.clientId, creds.clientSecret, creds.redirectUri);
}

export async function getGoogleOAuthClient(userId?: string | null) {
  const creds = await getGoogleAppCredentials(userId);
  if (!creds.clientId || !creds.clientSecret) {
    throw new Error("Google Client ID and Secret are not configured in Settings");
  }
  return { client: createGoogleOAuthClient(creds), creds };
}

export async function getGoogleAuthUrl(state: string) {
  const { client } = await getGoogleOAuthClient(state);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/blogger",
    ],
    state,
  });
}

export async function exchangeGoogleCode(code: string, userId: string) {
  const { client } = await getGoogleOAuthClient(userId);
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data: profile } = await oauth2.userinfo.get();

  return {
    email: profile.email || "unknown",
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token || null,
    expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
  };
}

export async function getAuthedBloggerClient(googleAccountId: string) {
  const account = await prisma.googleAccount.findUniqueOrThrow({
    where: { id: googleAccountId },
  });

  const { client } = await getGoogleOAuthClient(account.userId);
  client.setCredentials({
    access_token: account.accessToken,
    refresh_token: account.refreshToken || undefined,
    expiry_date: account.expiresAt?.getTime(),
  });

  client.on("tokens", async (tokens) => {
    await prisma.googleAccount.update({
      where: { id: googleAccountId },
      data: {
        accessToken: tokens.access_token || account.accessToken,
        refreshToken: tokens.refresh_token || account.refreshToken,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : account.expiresAt,
      },
    });
  });

  return google.blogger({ version: "v3", auth: client });
}

export async function listBlogsForAccount(googleAccountId: string) {
  const blogger = await getAuthedBloggerClient(googleAccountId);
  const res = await blogger.blogs.listByUser({ userId: "self" });
  return res.data.items || [];
}

export async function publishToBlogger(opts: {
  googleAccountId: string;
  blogId: string;
  title: string;
  content: string;
  labels?: string[];
  isDraft?: boolean;
}) {
  const blogger = await getAuthedBloggerClient(opts.googleAccountId);
  const res = await blogger.posts.insert({
    blogId: opts.blogId,
    isDraft: opts.isDraft ?? false,
    requestBody: {
      title: opts.title,
      content: opts.content,
      labels: opts.labels,
    },
  });
  return res.data;
}
