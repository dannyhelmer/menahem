import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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

// The authoritative check for API routes. Proxy (proxy.ts) only ever reads
// the session cookie -- Next's own guidance for this version is that Proxy
// runs on every request (including prefetches), so it must stay a cheap,
// DB-free "optimistic" check, never the real security boundary. The actual
// approved/admin enforcement lives here, called explicitly at the top of
// every route handler (via withAuth/withAdmin below).
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

// Page-component equivalents -- same authoritative DB-backed check, but
// redirecting instead of throwing an HTTP status, for use directly inside
// Server Component pages (the "Data Access Layer" pattern Next recommends:
// checks belong at the point of data access, not just in Proxy/layouts).
export async function requirePageUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/signin");
  return user;
}

export async function requireApprovedPageUser(): Promise<User> {
  const user = await requirePageUser();
  if (!user.approved) redirect("/private-beta");
  return user;
}

export async function requireAdminPageUser(): Promise<User> {
  const user = await requireApprovedPageUser();
  if (!user.isAdmin) redirect("/");
  return user;
}
