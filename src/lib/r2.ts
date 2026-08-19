import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

function getR2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!accountId || !process.env.R2_ACCESS_KEY_ID) {
    return null;
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function uploadImageFromUrl(
  imageUrl: string,
  folder = "images"
): Promise<string> {
  // If already a public https URL and no R2 configured, return as-is
  const client = getR2Client();
  if (!client) {
    if (imageUrl.startsWith("http")) return imageUrl;
    throw new Error("R2 not configured and image is not a public URL");
  }

  let buffer: Buffer;
  let contentType = "image/png";

  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:(.+?);base64,(.+)$/);
    if (!match) throw new Error("Invalid data URL");
    contentType = match[1];
    buffer = Buffer.from(match[2], "base64");
  } else {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
    contentType = res.headers.get("content-type") || "image/png";
    buffer = Buffer.from(await res.arrayBuffer());
  }

  const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "png";
  const key = `${folder}/${randomUUID()}.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME || "contentops",
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const publicBase = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!publicBase) {
    throw new Error("R2_PUBLIC_URL is required for public image URLs");
  }
  return `${publicBase}/${key}`;
}
