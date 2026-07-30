// Admin utility: reset a user's password directly in Postgres.
// Usage: node scripts/reset-password.js <email> <newPassword>
//
// Standalone on purpose -- not a web API route -- so this can only be run
// by someone with direct access to the server/repo, not hit remotely.
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { neon } = require("@neondatabase/serverless");

const SALT_ROUNDS = 12;

function loadConnectionString() {
  const envPath = path.join(__dirname, "..", ".env.local");
  const env = fs.readFileSync(envPath, "utf8");
  const names = [
    "POSTGRES_URL",
    "DATABASE_URL",
    "POSTGRES_URL_NON_POOLING",
    "DATABASE_URL_UNPOOLED",
    "POSTGRES_PRISMA_URL",
  ];
  for (const name of names) {
    const match = env.match(new RegExp(`^${name}=\"?([^\"\n]+)\"?`, "m"));
    if (match) return match[1];
  }
  throw new Error(`No Postgres connection string found in .env.local (checked ${names.join(", ")}).`);
}

async function main() {
  const [, , email, newPassword] = process.argv;
  if (!email || !newPassword) {
    console.error("Usage: node scripts/reset-password.js <email> <newPassword>");
    process.exit(1);
  }
  if (newPassword.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const sql = neon(loadConnectionString());
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  const rows = await sql`
    UPDATE users SET password_hash = ${passwordHash} WHERE email = ${email.trim().toLowerCase()}
    RETURNING email
  `;

  if (rows.length === 0) {
    console.error(`No account found for ${email}.`);
    process.exit(1);
  }

  console.log(`Password reset for ${rows[0].email}.`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
