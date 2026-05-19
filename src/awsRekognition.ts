import type { AwsConfig } from './types';

// ─── Crypto helpers (crypto.subtle — available in Hermes / RN 0.71+) ──────────

const enc = new TextEncoder();

async function sha256hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(data));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data));
}

async function hmacHex(key: BufferSource, data: string): Promise<string> {
  const buf = await hmac(key, data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string
): Promise<ArrayBuffer> {
  const kDate = await hmac(enc.encode('AWS4' + secretKey), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, 'rekognition');
  return hmac(kService, 'aws4_request');
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function amzDate(): { amzDate: string; dateStamp: string } {
  const now = new Date();
  const iso = now.toISOString().replace(/[-:]/g, '');
  return {
    amzDate: iso.slice(0, 15) + 'Z', // YYYYMMDDTHHMMSSZ
    dateStamp: iso.slice(0, 8), // YYYYMMDD
  };
}

// ─── AWS Sig V4 signed fetch ──────────────────────────────────────────────────

async function signedFetch(config: AwsConfig, body: string): Promise<Response> {
  const { accessKeyId, secretAccessKey, region } = config;
  const host = `rekognition.${region}.amazonaws.com`;
  const url = `https://${host}/`;
  const { amzDate: xAmzDate, dateStamp } = amzDate();
  const payloadHash = await sha256hex(body);

  // Canonical headers — must be sorted alphabetically by header name.
  const canonicalHeaders = [
    `content-type:application/x-amz-json-1.1`,
    `host:${host}`,
    `x-amz-date:${xAmzDate}`,
    `x-amz-target:RekognitionService.CompareFaces`,
  ].join('\n');
  const signedHeaders = 'content-type;host;x-amz-date;x-amz-target';

  const canonicalRequest = [
    'POST',
    '/',
    '', // no query string
    canonicalHeaders,
    '', // blank line after headers
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/rekognition/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    xAmzDate,
    credentialScope,
    await sha256hex(canonicalRequest),
  ].join('\n');

  const signingKey = await getSigningKey(secretAccessKey, dateStamp, region);
  const signature = await hmacHex(signingKey, stringToSign);

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'Host': host,
      'X-Amz-Date': xAmzDate,
      'X-Amz-Target': 'RekognitionService.CompareFaces',
      'Authorization': authorization,
    },
    body,
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type RekognitionResult = {
  match: boolean;
  similarity: number;
};

/**
 * Calls AWS Rekognition CompareFaces using pure-JS AWS Signature V4 signing.
 * No AWS SDK required — uses crypto.subtle (Hermes, RN 0.71+).
 *
 * @param config  AWS credentials + region + optional similarity threshold.
 * @param sourceBase64  Reference image as raw base64 (no data URI prefix).
 * @param targetBase64  Captured image as raw base64 (no data URI prefix).
 */
export async function compareFacesWithRekognition(
  config: AwsConfig,
  sourceBase64: string,
  targetBase64: string
): Promise<RekognitionResult> {
  const threshold = config.similarityThreshold ?? 80;

  const body = JSON.stringify({
    SourceImage: { Bytes: sourceBase64 },
    TargetImage: { Bytes: targetBase64 },
    SimilarityThreshold: threshold,
  });

  const response = await signedFetch(config, body);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `[FaceVerify] Rekognition error ${response.status}: ${text}`
    );
  }

  const data = (await response.json()) as {
    FaceMatches?: Array<{ Similarity: number }>;
  };

  const faceMatches = data.FaceMatches ?? [];

  if (faceMatches.length === 0) {
    return { match: false, similarity: 0 };
  }

  const similarity = faceMatches[0]?.Similarity ?? 0;
  return { match: similarity >= threshold, similarity };
}
