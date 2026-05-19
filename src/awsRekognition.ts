import type { AwsConfig } from './types';

// ─── Pure-JS SHA-256 ──────────────────────────────────────────────────────────

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function sha256(data: Uint8Array): Uint8Array {
  const msgLen = data.length;
  const bitLen = msgLen * 8;
  const paddedLen = Math.ceil((msgLen + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[msgLen] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  dv.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667,
    h1 = 0xbb67ae85,
    h2 = 0x3c6ef372,
    h3 = 0xa54ff53a,
    h4 = 0x510e527f,
    h5 = 0x9b05688c,
    h6 = 0x1f83d9ab,
    h7 = 0x5be0cd19;

  const W = new Uint32Array(64);

  for (let off = 0; off < paddedLen; off += 64) {
    const cv = new DataView(padded.buffer, off, 64);
    for (let i = 0; i < 16; i++) W[i] = cv.getUint32(i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 =
        rotr32(W[i - 15]!, 7) ^ rotr32(W[i - 15]!, 18) ^ (W[i - 15]! >>> 3);
      const s1 =
        rotr32(W[i - 2]!, 17) ^ rotr32(W[i - 2]!, 19) ^ (W[i - 2]! >>> 10);
      W[i] = (W[i - 16]! + s0 + W[i - 7]! + s1) >>> 0;
    }

    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      e = h4,
      f = h5,
      g = h6,
      h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA256_K[i]! + W[i]!) >>> 0;
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, h0, false);
  ov.setUint32(4, h1, false);
  ov.setUint32(8, h2, false);
  ov.setUint32(12, h3, false);
  ov.setUint32(16, h4, false);
  ov.setUint32(20, h5, false);
  ov.setUint32(24, h6, false);
  ov.setUint32(28, h7, false);
  return out;
}

// ─── HMAC-SHA256 ──────────────────────────────────────────────────────────────

const BLOCK = 64;

function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  let k = key.length > BLOCK ? sha256(key) : key;
  const kPad = new Uint8Array(BLOCK);
  kPad.set(k);
  const ipad = kPad.map((b) => b ^ 0x36);
  const opad = kPad.map((b) => b ^ 0x5c);
  const inner = new Uint8Array(BLOCK + data.length);
  inner.set(ipad);
  inner.set(data, BLOCK);
  const outer = new Uint8Array(BLOCK + 32);
  outer.set(opad);
  outer.set(sha256(inner), BLOCK);
  return sha256(outer);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const enc = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function sha256hex(s: string): string {
  return toHex(sha256(enc.encode(s)));
}

function hmacBytes(key: Uint8Array | string, data: string): Uint8Array {
  const k = typeof key === 'string' ? enc.encode(key) : key;
  return hmacSha256(k, enc.encode(data));
}

function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string
): Uint8Array {
  const kDate = hmacBytes('AWS4' + secretKey, dateStamp);
  const kRegion = hmacBytes(kDate, region);
  const kService = hmacBytes(kRegion, 'rekognition');
  return hmacBytes(kService, 'aws4_request');
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function amzDate(): { amzDate: string; dateStamp: string } {
  const iso = new Date().toISOString().replace(/[-:]/g, '');
  return { amzDate: iso.slice(0, 15) + 'Z', dateStamp: iso.slice(0, 8) };
}

// ─── AWS Sig V4 signed fetch ──────────────────────────────────────────────────

async function signedFetch(config: AwsConfig, body: string): Promise<Response> {
  const { accessKeyId, secretAccessKey, region } = config;
  const host = `rekognition.${region}.amazonaws.com`;
  const url = `https://${host}/`;
  const { amzDate: xAmzDate, dateStamp } = amzDate();
  const payloadHash = sha256hex(body);

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
    '',
    canonicalHeaders,
    '',
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/rekognition/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    xAmzDate,
    credentialScope,
    sha256hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(secretAccessKey, dateStamp, region);
  const signature = toHex(hmacBytes(signingKey, stringToSign));

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
 * No AWS SDK, no Web Crypto — works on any React Native / Hermes version.
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
  if (faceMatches.length === 0) return { match: false, similarity: 0 };

  const similarity = faceMatches[0]?.Similarity ?? 0;
  return { match: similarity >= threshold, similarity };
}
