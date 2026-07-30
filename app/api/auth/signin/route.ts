import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { getUserByEmail, touchLastLogin } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { email, password } = (await request.json()) as { email?: string; password?: string };
  if (typeof email !== "string" || typeof password !== "string") {
    return Response.json({ error: "Email and password are required." }, { status: 400 });
  }

  const user = await getUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return Response.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  await touchLastLogin(user.id);
  await createSession(user.id);

  return Response.json({ email: user.email, approved: user.approved, isAdmin: user.isAdmin });
}
