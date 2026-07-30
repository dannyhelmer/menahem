import { jwtVerify, SignJWT } from "jose";

// Pure, no next/headers dependency -- usable from both Node API routes and
// Edge middleware (middleware does its own live per-request DB check, so
// it needs to verify/read this cookie without pulling in server-only APIs).
export const SESSION_COOKIE_NAME = "menahem_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 days, rolling

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

// Deliberately returns only the user id, never approved/isAdmin -- those
// must always be re-checked live against Postgres so a revoke takes effect
// on the user's very next request instead of whenever their token expires.
export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
