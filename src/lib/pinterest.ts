import {
  getPinterestAppCredentials,
  type OAuthCredentialOptions,
} from "@/lib/credentials";

const PINTEREST_API = "https://api.pinterest.com/v5";

export async function getPinterestAuthUrl(state: string, options?: OAuthCredentialOptions) {
  const creds = await getPinterestAppCredentials(state, options);
  if (!creds.appId || !creds.appSecret) {
    throw new Error("Pinterest App ID and Secret are not configured in Settings");
  }

  const params = new URLSearchParams({
    client_id: creds.appId,
    redirect_uri: creds.redirectUri,
    response_type: "code",
    scope: "boards:read,boards:write,pins:read,pins:write,user_accounts:read",
    state,
  });
  return `https://www.pinterest.com/oauth/?${params.toString()}`;
}

export async function exchangePinterestCode(
  code: string,
  userId: string,
  options?: OAuthCredentialOptions
) {
  const creds = await getPinterestAppCredentials(userId, options);
  if (!creds.appId || !creds.appSecret) {
    throw new Error("Pinterest App ID and Secret are not configured in Settings");
  }

  const basic = Buffer.from(`${creds.appId}:${creds.appSecret}`).toString("base64");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: creds.redirectUri,
  });

  const res = await fetch(`${PINTEREST_API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Pinterest token exchange failed: ${await res.text()}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }>;
}

async function pinterestFetch(accessToken: string, path: string, init?: RequestInit) {
  const res = await fetch(`${PINTEREST_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Pinterest API ${path}: ${await res.text()}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function getPinterestUser(accessToken: string) {
  return pinterestFetch(accessToken, "/user_account") as Promise<{
    username?: string;
    id?: string;
  }>;
}

export async function listPinterestBoards(accessToken: string) {
  const data = (await pinterestFetch(accessToken, "/boards?page_size=100")) as {
    items?: Array<{ id: string; name: string; description?: string }>;
  };
  return data.items || [];
}

export async function createPinterestBoard(
  accessToken: string,
  name: string,
  description?: string
) {
  return pinterestFetch(accessToken, "/boards", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  }) as Promise<{ id: string; name: string }>;
}

export async function createPinterestPin(
  accessToken: string,
  opts: {
    boardId: string;
    title: string;
    description: string;
    link: string;
    imageUrl: string;
  }
) {
  return pinterestFetch(accessToken, "/pins", {
    method: "POST",
    body: JSON.stringify({
      board_id: opts.boardId,
      title: opts.title.slice(0, 100),
      description: opts.description.slice(0, 500),
      link: opts.link,
      media_source: {
        source_type: "image_url",
        url: opts.imageUrl,
      },
    }),
  }) as Promise<{ id: string }>;
}
