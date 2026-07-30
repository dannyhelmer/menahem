import { neon } from "@neondatabase/serverless";

// Neon's HTTP-based driver -- no persistent TCP connection, so this works
// identically in Node API routes and in Edge middleware (both matter here:
// middleware does a live per-request approval check against this same DB).
function getConnectionString(): string {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "POSTGRES_URL is not set -- Menahem's accounts/private-beta system requires a Postgres connection " +
        "(Neon) in every environment, including local dev.",
    );
  }
  return url;
}

export const sql = neon(getConnectionString());
