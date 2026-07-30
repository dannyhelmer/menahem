import { AuthError, requireAdmin, requireApprovedUser } from "./session";
import type { User } from "./users";

// Wraps a route handler so every one of them gets the same authoritative,
// DB-backed approved/admin check with one line, instead of hand-repeating
// try/catch in ~20 route files (easy to get subtly wrong or forget in one).
type RouteHandler<Ctx> = (request: Request, ctx: Ctx, user: User) => Promise<Response> | Response;

function wrap<Ctx>(
  handler: RouteHandler<Ctx>,
  check: () => Promise<User>,
): (request: Request, ctx: Ctx) => Promise<Response> {
  return async (request: Request, ctx: Ctx) => {
    let user: User;
    try {
      user = await check();
    } catch (error) {
      if (error instanceof AuthError) {
        return Response.json({ error: error.message }, { status: error.status });
      }
      console.error("[withAuth] auth check threw an unexpected error:", error);
      return Response.json(
        { error: error instanceof Error ? error.message : "Authentication check failed." },
        { status: 500 },
      );
    }

    try {
      return await handler(request, ctx, user);
    } catch (error) {
      // Previously this rethrew, which Next.js turns into a generic
      // non-JSON 500 -- the client's response.json() then fails to parse
      // it, and every failure surfaced as the same unhelpful fallback
      // message regardless of what actually broke. Returning the real
      // error as JSON here is what makes route.ts's actual failure (a bad
      // API key, a DB error, etc.) visible instead of masked.
      console.error("[withAuth] route handler threw:", error);
      return Response.json(
        { error: error instanceof Error ? error.message : "Something went wrong." },
        { status: 500 },
      );
    }
  };
}

export function withAuth<Ctx = unknown>(handler: RouteHandler<Ctx>) {
  return wrap(handler, requireApprovedUser);
}

export function withAdmin<Ctx = unknown>(handler: RouteHandler<Ctx>) {
  return wrap(handler, requireAdmin);
}
