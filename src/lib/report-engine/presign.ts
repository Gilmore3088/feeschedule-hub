/**
 * Report Engine — R2 Presigned URL Generator
 * Phase 13-03: D-04 implementation
 *
 * Generates short-TTL presigned URLs for report PDF artifacts stored in
 * Cloudflare R2 (S3-compatible). URLs are never stored in the DB — generated
 * fresh on each download request after verifying user auth.
 *
 * Decision refs: D-03, D-04 (see 13-CONTEXT.md)
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// TTL per D-04: 1 hour. Short enough to limit sharing window (URL is a bearer token).
const DEFAULT_TTL_SECONDS = 3600;

/**
 * Generate a presigned URL for an R2 object.
 *
 * @param key        R2 object key (e.g. "reports/national_index/<job_id>.pdf")
 * @param ttlSeconds URL expiry in seconds — defaults to 3600 (1 hour, per D-04)
 */
export async function generatePresignedUrl(
  key: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    console.error('[presign] R2 credentials not configured — cannot generate presigned URL');
    throw new Error('Report storage not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.');
  }

  const client = new S3Client({
    endpoint,
    region: 'auto',
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  const cmd = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET ?? 'bfi-reports',
    Key: key,
  });

  return getSignedUrl(client, cmd, { expiresIn: ttlSeconds });
}
