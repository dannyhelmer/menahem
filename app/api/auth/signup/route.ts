import { createSession } from "@/lib/auth/session";
import { createUser, getUserByEmail } from "@/lib/auth/users";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: Request) {
  const { email, password } = (await request.json()) as { email?: string; password?: string };

  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return Response.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, { status: 400 });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return Response.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const user = await createUser(email, password);
  await createSession(user.id);

  return Response.json({ email: user.email, approved: user.approved, isAdmin: user.isAdmin });
}
