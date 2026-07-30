import { sql } from "@/lib/db/client";
import { ensureSchema } from "@/lib/db/schema";
import { hashPassword } from "./password";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  approved: boolean;
  isAdmin: boolean;
  plan: string;
  createdAt: string;
  lastLoginAt: string | null;
  fullName: string | null;
  preferredName: string | null;
}

// A comma-separated allowlist of emails that are always treated as admin +
// approved, regardless of what's stored -- without this, a fresh deployment
// has zero admins and nobody could ever reach the dashboard to approve the
// first real user.
function getAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isDesignatedAdmin(email: string): boolean {
  return getAdminEmails().has(email.toLowerCase());
}

function applyAdminOverride(user: User): User {
  if (!isDesignatedAdmin(user.email)) return user;
  return { ...user, approved: true, isAdmin: true };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: any): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    approved: row.approved,
    isAdmin: row.is_admin,
    plan: row.plan,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
    fullName: row.full_name,
    preferredName: row.preferred_name,
  };
}

export async function createUser(email: string, rawPassword: string): Promise<User> {
  await ensureSchema();
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(rawPassword);
  const admin = isDesignatedAdmin(normalizedEmail);

  const rows = await sql`
    INSERT INTO users (email, password_hash, approved, is_admin)
    VALUES (${normalizedEmail}, ${passwordHash}, ${admin}, ${admin})
    RETURNING *
  `;
  return applyAdminOverride(mapRow(rows[0]));
}

export async function getUserByEmail(email: string): Promise<User | null> {
  await ensureSchema();
  const rows = await sql`SELECT * FROM users WHERE email = ${email.trim().toLowerCase()}`;
  return rows[0] ? applyAdminOverride(mapRow(rows[0])) : null;
}

export async function getUserById(id: string): Promise<User | null> {
  await ensureSchema();
  const rows = await sql`SELECT * FROM users WHERE id = ${id}`;
  return rows[0] ? applyAdminOverride(mapRow(rows[0])) : null;
}

export async function listUsers(options?: { search?: string }): Promise<User[]> {
  await ensureSchema();
  const search = options?.search?.trim();
  const rows = search
    ? await sql`SELECT * FROM users WHERE email ILIKE ${`%${search}%`} ORDER BY created_at DESC`
    : await sql`SELECT * FROM users ORDER BY created_at DESC`;
  return rows.map((row) => applyAdminOverride(mapRow(row)));
}

export async function setApproved(id: string, approved: boolean): Promise<void> {
  await ensureSchema();
  await sql`UPDATE users SET approved = ${approved} WHERE id = ${id}`;
}

export async function deleteUser(id: string): Promise<void> {
  await ensureSchema();
  await sql`DELETE FROM users WHERE id = ${id}`;
}

export async function touchLastLogin(id: string): Promise<void> {
  await ensureSchema();
  await sql`UPDATE users SET last_login_at = now() WHERE id = ${id}`;
}

export async function updateProfile(
  id: string,
  profile: { fullName?: string; preferredName?: string },
): Promise<void> {
  await ensureSchema();
  if (profile.fullName !== undefined) {
    await sql`UPDATE users SET full_name = ${profile.fullName} WHERE id = ${id}`;
  }
  if (profile.preferredName !== undefined) {
    await sql`UPDATE users SET preferred_name = ${profile.preferredName} WHERE id = ${id}`;
  }
}
