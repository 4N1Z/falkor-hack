/**
 * Short-lived tokens authorising a WebSocket connection to the Hocuspocus
 * collaboration server.
 *
 * The Auth.js session cookie is httpOnly, so the browser cannot hand it to
 * HocuspocusProvider. Instead the client calls /api/collab-token (authenticated
 * by the cookie) and passes the returned token on the socket, where
 * scripts/serve.mts verifies it.
 *
 * Dependency-free on purpose: scripts/serve.mts imports this file directly and
 * runs outside Next, so it must not pull in anything from `@/` or node_modules.
 * HS256 over AUTH_SECRET, matching the secret the app already has.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_SECONDS = 600; // 10 minutes; the provider refreshes on reconnect

export type CollabTokenPayload = {
  sub: string; // user id
  exp: number; // unix seconds
};

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64url");

function sign(data: string, secret: string) {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function signCollabToken(
  userId: string,
  secret: string,
  ttlSeconds = DEFAULT_TTL_SECONDS
): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload: CollabTokenPayload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const body = b64url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  return `${signingInput}.${sign(signingInput, secret)}`;
}

export function verifyCollabToken(
  token: string,
  secret: string
): CollabTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const expected = sign(`${header}.${body}`, secret);

  // Constant-time compare; timingSafeEqual throws on length mismatch.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: CollabTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload?.sub !== "string" || typeof payload?.exp !== "number") {
    return null;
  }
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;

  return payload;
}
