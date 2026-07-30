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
    try {
      const user = await check();
      return await handler(request, ctx, user);
    } catch (error) {
      if (error instanceof AuthError) {
        return Response.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  };
}

export function withAuth<Ctx = unknown>(handler: RouteHandler<Ctx>) {
  return wrap(handler, requireApprovedUser);
}

export function withAdmin<Ctx = unknown>(handler: RouteHandler<Ctx>) {
  return wrap(handler, requireAdmin);
}
