"use client";

import { useMemo, useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

export interface AdminUserRow {
  id: string;
  email: string;
  approved: boolean;
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminDashboard({ initialUsers }: { initialUsers: AdminUserRow[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) => user.email.toLowerCase().includes(query));
  }, [users, search]);

  async function setApproved(id: string, approved: boolean) {
    setBusyId(id);
    const response = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    });
    if (response.ok) {
      setUsers((prev) => prev.map((user) => (user.id === id ? { ...user, approved } : user)));
    }
    setBusyId(null);
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    setBusyId(id);
    const response = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (response.ok) {
      setUsers((prev) => prev.filter((user) => user.id !== id));
    }
    setBusyId(null);
  }

  const pendingDeleteUser = users.find((user) => user.id === pendingDeleteId);

  return (
    <div className="space-y-4">
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by email…"
        className="focus:border-burgundy/50 w-full max-w-sm rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
      />

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs text-neutral-400 uppercase dark:border-neutral-800 dark:text-neutral-500">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Date Joined</th>
              <th className="px-4 py-3 font-medium">Last Login</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500 dark:text-neutral-400">
                  No users found.
                </td>
              </tr>
            ) : (
              filtered.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-neutral-100 last:border-0 dark:border-neutral-900"
                >
                  <td className="px-4 py-3 text-neutral-800 dark:text-neutral-100">
                    {user.email}
                    {user.isAdmin && (
                      <span className="bg-burgundy/10 text-burgundy ml-2 rounded-full px-2 py-0.5 text-xs font-medium">
                        Admin
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-neutral-500 dark:text-neutral-400">
                    {formatDate(user.lastLoginAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        user.approved
                          ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/40 dark:text-green-400"
                          : "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                      }
                    >
                      {user.approved ? "Approved" : "Pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setApproved(user.id, !user.approved)}
                        disabled={busyId === user.id}
                        className="hover:text-burgundy text-sm font-medium text-neutral-600 disabled:opacity-50 dark:text-neutral-300"
                      >
                        {user.approved ? "Revoke" : "Approve"}
                      </button>
                      <button
                        onClick={() => setPendingDeleteId(user.id)}
                        disabled={busyId === user.id}
                        className="text-sm font-medium text-neutral-400 hover:text-red-600 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete this account?"
        message={
          pendingDeleteUser
            ? `Delete "${pendingDeleteUser.email}"? This permanently removes their account. This can't be undone.`
            : ""
        }
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
