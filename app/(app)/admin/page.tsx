import Link from "next/link";
import { requireAdminPageUser } from "@/lib/auth/session";
import { listUsers } from "@/lib/auth/users";
import AdminDashboard from "@/app/_components/AdminDashboard";

export default async function AdminPage() {
  await requireAdminPageUser();
  const users = await listUsers();

  return (
    <main className="flex-1 overflow-y-auto px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/"
          className="hover:text-burgundy mb-8 inline-block text-sm text-neutral-500 dark:text-neutral-400"
        >
          ← Back to chat
        </Link>

        <h1 className="mb-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-50">Admin</h1>
        <p className="mb-8 text-sm text-neutral-500 dark:text-neutral-400">
          Manage private beta access -- approve new accounts, revoke access, or remove accounts entirely.
        </p>

        <AdminDashboard
          initialUsers={users.map((user) => ({
            id: user.id,
            email: user.email,
            approved: user.approved,
            isAdmin: user.isAdmin,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt,
          }))}
        />
      </div>
    </main>
  );
}
