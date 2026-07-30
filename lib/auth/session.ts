import { cookies } from "next/headers";
import { getUserById, type User } from "./users";
import { SESSION_COOKIE_NAME, SESSION_DURATION_SECONDS, signSessionToken, verifySessionToken } from "./jwt";

export async function createSession(userId: string): Promise<void> {
  const token = await signSessionToken(userId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getSessionUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const userId = await verifySessionToken(token);
  if (!userId) return null;

  return getUserById(userId);
}

export class AuthError extends Error {
  readonly status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
  }
}

// The explicit, redundant guard called directly inside AI-calling routes
// (on top of middleware's blanket gate) -- belt and suspenders specifically
// where "never allow unapproved users to call AI endpoints" matters most.
export async function requireApprovedUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new AuthError(401, "Not authenticated.");
  if (!user.approved) throw new AuthError(403, "Account not approved.");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireApprovedUser();
  if (!user.isAdmin) throw new AuthError(403, "Admin access required.");
  return user;
}
