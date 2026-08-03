"use client";

import { useRouter } from "next/navigation";

export default function PrivateBetaContent() {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/signin");
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-white px-6 dark:bg-neutral-950">
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-neutral-200 bg-white px-8 py-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">Private Beta</h1>
        <div className="space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
          <p>Menahem is currently in a limited private beta.</p>
          <p>Your account has not yet been approved.</p>
          <p>We&apos;ll notify you once access has been granted.</p>
        </div>
        <button
          onClick={handleSignOut}
          className="bg-burgundy hover:bg-burgundy-dark rounded-xl px-5 py-2.5 text-sm font-medium text-white transition-colors duration-150"
        >
          Sign Out
        </button>
      </div>
    </main>
  );
}
