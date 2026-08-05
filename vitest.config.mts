import path from "node:path";
import { defineConfig } from "vitest/config";

// Mirrors tsconfig.json's "@/*" -> "./*" path mapping. Without this, any
// test file that pulls in a module with a real (non-type-only) "@/..."
// import fails at runtime with "Cannot find package '@/...'" -- type-only
// imports are erased before module resolution ever runs, so this gap was
// invisible until a test exercised a module with a genuine runtime import
// (lib/intelligence/jurisdiction.ts importing STATE_NAME_TO_CODE).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    env: {
      // lib/db/client.ts builds its Postgres client at MODULE LOAD TIME
      // (`export const sql = neon(getConnectionString())`), so any test
      // that transitively imports it (e.g. lib/research/research-plan.ts
      // -> lib/ai/get-provider.ts -> ... -> lib/db/schema.ts) throws before
      // a single test even runs, without this. Neon's HTTP driver only
      // parses this string at import time -- it never makes a network call
      // until a query actually executes, and no test here issues one, so a
      // syntactically-valid placeholder is safe.
      DATABASE_URL: "postgres://test:test@localhost:5432/test",
    },
  },
});
