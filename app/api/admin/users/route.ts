import { withAdmin } from "@/lib/auth/with-auth";
import { listUsers } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

// Data Transfer Object -- never send password_hash to the client, admin
// dashboard or not.
function toDTO(user: Awaited<ReturnType<typeof listUsers>>[number]) {
  return {
    id: user.id,
    email: user.email,
    approved: user.approved,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export const GET = withAdmin(async (request: Request) => {
  const search = new URL(request.url).searchParams.get("search") ?? undefined;
  const users = await listUsers({ search });
  return Response.json({ users: users.map(toDTO) });
});
