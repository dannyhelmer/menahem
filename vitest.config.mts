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
});
