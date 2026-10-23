/**
 * Session cookie for the shared-password gate. Works in both the Edge middleware and Node route handlers
 * (Web Crypto only). The token is "<expiry ms>.<hex HMAC-SHA256 of the expiry>", keyed with APP_PASSWORD,
 * so changing the password signs everyone out.
 */

export const SESSION_COOKIE = "opshub_session";
export const SESSION_DAYS = 7;

const enc = new TextEncoder();

async function hmacKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex: string) => new Uint8Array((hex.match(/.{1,2}/g) ?? []).map((h) => parseInt(h, 16)));

export async function createSession(secret: string): Promise<string> {
  const exp = String(Date.now() + SESSION_DAYS * 86400000);
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(exp));
  return `${exp}.${toHex(sig)}`;
}

export async function verifySession(token: string | undefined, secret: string): Promise<boolean> {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^[0-9a-f]+$/.test(sig) || Number(exp) < Date.now()) return false;
  try {
    return await crypto.subtle.verify("HMAC", await hmacKey(secret, "verify"), fromHex(sig), enc.encode(exp));
  } catch {
    return false;
  }
}

/** Compares two strings in constant time by hashing them first */
export async function passwordMatches(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([given, expected].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** Only same-site paths: blocks open redirects such as //evil.com */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}
