import { neon } from "@neondatabase/serverless";

// Vercel's Postgres/Neon integration injects the connection string under
// slightly different names depending on how it was provisioned -- checked
// in priority order so this works with whatever name Vercel actually used,
// without needing to know it in advance.
const CONNECTION_STRING_ENV_VARS = [
  "POSTGRES_URL",
  "DATABASE_URL",
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL_UNPOOLED",
  "POSTGRES_PRISMA_URL",
];

// Neon's HTTP-based driver -- no persistent TCP connection, so this works
// identically in Node API routes and in Edge middleware (both matter here:
// middleware does a live per-request approval check against this same DB).
function getConnectionString(): string {
  for (const name of CONNECTION_STRING_ENV_VARS) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(
    "No Postgres connection string found (checked " +
      `${CONNECTION_STRING_ENV_VARS.join(", ")}) -- Menahem's accounts/private-beta system requires a ` +
      "Postgres connection in every environment, including local dev.",
  );
}

export const sql = neon(getConnectionString());
