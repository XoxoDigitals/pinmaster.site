import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import {
  getGoogleAppCredentials,
  type GoogleAppCredentials,
  type OAuthCredentialOptions,
} from "@/lib/credentials";

export function createGoogleOAuthClient(creds: GoogleAppCredentials) {
  return new google.auth.OAuth2(creds.clientId, creds.clientSecret, creds.redirectUri);
}

export async function getGoogleOAuthClient(
  userId?: string | null,
  options?: OAuthCredentialOptions
) {
  const creds = await getGoogleAppCredentials(userId, options);
  if (!creds.clientId || !creds.clientSecret) {
    throw new Error("Google Client ID and Secret are not configured in Settings");
  }
  return { client: createGoogleOAuthClient(creds), creds };
}

export async function getGoogleAuthUrl(state: string, options?: OAuthCredentialOptions) {
  const { client } = await getGoogleOAuthClient(state, options);
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

export async function exchangeGoogleCode(
  code: string,
  userId: string,
  options?: OAuthCredentialOptions
) {
  const { client } = await getGoogleOAuthClient(userId, options);
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

/**
 * Collect unique labels/categories from recent posts on a Blogger blog.
 * Blogger has no dedicated categories API — labels live on posts.
 */
export async function fetchBlogCategories(
  googleAccountId: string,
  blogId: string
): Promise<string[]> {
  const blogger = await getAuthedBloggerClient(googleAccountId);
  const labels = new Set<string>();

  for (const status of [["live"], ["draft"]] as const) {
    let pageToken: string | undefined;
    for (let page = 0; page < 3; page++) {
      const res = await blogger.posts.list({
        blogId,
        maxResults: 100,
        fetchBodies: false,
        fetchImages: false,
        status: [...status],
        pageToken,
      });

      for (const post of res.data.items || []) {
        for (const label of post.labels || []) {
          const trimmed = String(label).trim();
          if (trimmed) labels.add(trimmed);
        }
      }

      pageToken = res.data.nextPageToken || undefined;
      if (!pageToken) break;
    }
  }

  return [...labels].sort((a, b) => a.localeCompare(b));
}
