// Vercel sets VERCEL=1 on every deployment; NODE_ENV=production covers any
// other production build. Shared by anything that must never touch the
// developer's own machine (Ollama) or must behave differently because of
// Vercel's read-only serverless filesystem (local JSON-file storage).
export function isProductionDeployment(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}
