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
// "/" is public too -- the page itself renders a public marketing view for
// logged-out visitors (see app/(app)/page.tsx) and the real app for
// authenticated ones, so it must never be redirected before that branch
// gets a chance to run. Same reasoning for "/pricing", which already
// supports a guest view (see PricingContent.tsx). Without this, Google's
// crawler -- which is never authenticated -- only ever saw a redirect to
// /signup for both, so neither was actually crawlable or indexable.
const PUBLIC_PATHS = ["/", "/signin", "/signup", "/privacy", "/terms", "/about", "/pricing"];
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
  // google6706d9d0ef01e720.html is the Google Search Console HTML-file
  // verification token -- Google's own verifier fetches it unauthenticated,
  // so it must be reachable the same way as robots.txt/sitemap.xml.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|opengraph-image|manifest.webmanifest|google6706d9d0ef01e720.html).*)",
  ],
};
