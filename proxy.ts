import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/jwt";

// Next.js renamed `middleware` to `proxy` in v16 (middleware.ts is
// deprecated) and this project's docs explicitly warn that Proxy runs on
// every request -- including prefetches -- so it must stay a cheap,
// DB-free "optimistic" check, never the real security boundary. This only
// verifies the session cookie's signature/expiry and redirects based on
// presence alone. The actual approved/admin enforcement (which needs a
// live Postgres read) happens in every route/page itself via
// lib/auth/with-auth.ts and lib/auth/session.ts's requireApproved*
// helpers -- see those for why relying on this file alone would be wrong.
const PUBLIC_PATHS = ["/signin", "/signup", "/privacy", "/terms", "/about"];
// /api/auth/me deliberately allows both logged-in and logged-out callers --
// it always responds 200 with { user: null } when there's no session, so it
// must never be blocked here before it gets a chance to say that.
const PUBLIC_API_PATHS = ["/api/auth/signin", "/api/auth/signup", "/api/auth/me", "/api/stripe/webhook"];

function matchesAny(pathname: string, list: string[]): boolean {
  return list.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (matchesAny(pathname, PUBLIC_PATHS) || matchesAny(pathname, PUBLIC_API_PATHS)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const userId = token ? await verifySessionToken(token) : null;

  if (!userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    // Most private-beta visitors are creating an account for the first
    // time, not returning -- Sign Up is the default entry point. /signin
    // stays reachable directly (it's in PUBLIC_PATHS) for anyone who
    // already has an account.
    return NextResponse.redirect(new URL("/signup", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Crawler-facing well-known files must never require a session -- Next's
  // own docs list exactly this set as the standard exclusion pattern.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|opengraph-image|manifest.webmanifest).*)",
  ],
};
