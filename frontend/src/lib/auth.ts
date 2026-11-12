export const SESSION_COOKIE_NAME = "ds_session";
export const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;

export const sessionCookieOptions = {
  name: SESSION_COOKIE_NAME,
  httpOnly: true,
  // v1 serves plain HTTP (EIP:80). Set AUTH_COOKIE_SECURE=true after HTTPS.
  secure: process.env.AUTH_COOKIE_SECURE === "true",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SEC,
};

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

function getAuthConfig() {
  return {
    username: process.env.AUTH_USERNAME?.trim() ?? "",
    password: process.env.AUTH_PASSWORD ?? "",
    secret: process.env.AUTH_SECRET?.trim() ?? "",
  };
}

export function authConfigured(): boolean {
  const { username, password, secret } = getAuthConfig();
  return Boolean(username && password && secret);
}

export function verifyCredentials(username: string, password: string): boolean {
  const cfg = getAuthConfig();
  if (!authConfigured()) {
    return false;
  }
  return safeEqual(username, cfg.username) && safeEqual(password, cfg.password);
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLen);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSign(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return bufferToHex(sig);
}

async function hmacVerify(
  message: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const expected = await hmacSign(message, secret);
  return safeEqual(expected, signature);
}

export async function createSessionToken(): Promise<string> {
  const { secret } = getAuthConfig();
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured");
  }
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC;
  const payloadB64 = base64UrlEncode(JSON.stringify({ exp, v: 1 }));
  const sig = await hmacSign(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

export async function verifySessionToken(token: string): Promise<boolean> {
  const { secret } = getAuthConfig();
  if (!secret || !token) {
    return false;
  }
  const dot = token.lastIndexOf(".");
  if (dot <= 0) {
    return false;
  }
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!(await hmacVerify(payloadB64, sig, secret))) {
    return false;
  }
  try {
    const payload = JSON.parse(base64UrlDecode(payloadB64)) as { exp?: number };
    if (typeof payload.exp !== "number") {
      return false;
    }
    return payload.exp >= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
