"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong. Try again.");
      setSubmitting(false);
      return;
    }

    const data = (await response.json()) as { approved: boolean };
    router.push(data.approved ? "/" : "/private-beta");
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">Create your account</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Menahem is currently in a private beta.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="focus:border-burgundy/50 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="focus:border-burgundy/50 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
          />
          <p className="text-xs text-neutral-400 dark:text-neutral-500">At least 8 characters.</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="bg-burgundy hover:bg-burgundy-dark w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors duration-150 disabled:opacity-50"
        >
          {submitting ? "Creating account…" : "Sign Up"}
        </button>
      </form>

      <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
        Already have an account?{" "}
        <Link href="/signin" className="text-burgundy hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
