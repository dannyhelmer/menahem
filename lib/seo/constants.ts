export const SITE_URL = "https://menahem.dev";
export const SITE_NAME = "Menahem";
export const SITE_TITLE = "Menahem | Government Intelligence Platform";
export const SITE_DESCRIPTION =
  "Menahem is an AI-powered Government Intelligence Platform for researching legislation, public policy, government documents, and official sources.";

// Sitewide default -- individual pages extend this with their own more
// specific terms in their `keywords` metadata rather than repeating it.
export const SITE_KEYWORDS = [
  "legislation research",
  "public policy",
  "government research",
  "bill analysis",
  "official government sources",
  "AI research assistant",
  "Congress",
  "state legislatures",
  "court decisions",
  "government intelligence",
];

// One place for the unique title/description pair used by both a page's
// <Metadata> export (title tag, meta description, Open Graph, Twitter Card)
// and, where noted in that page's own component, the visible on-page
// subtitle -- so the two never drift apart.
export const PAGE_SEO = {
  home: {
    title: "Menahem | AI Research for Legislation & Public Policy",
    description: "AI-powered research for legislation, public policy, and official government sources.",
  },
  workspace: {
    title: "Political Workspace",
    description: "Organize legislation, policy research, government documents, and legislative projects.",
  },
  history: {
    title: "Conversation History",
    description: "Access and search your previous legislative and policy research conversations.",
  },
  pricing: {
    title: "Pricing",
    description: "Simple plans for AI-powered government research and legislative analysis.",
  },
  about: {
    // Just "About" -- the root layout's title template already appends
    // "| Menahem", so a title starting with "Menahem" here would render
    // as the redundant "About Menahem | Menahem".
    title: "About",
    description: "Learn how Menahem helps researchers, journalists, students, campaigns, and policymakers.",
  },
  signin: {
    title: "Sign In",
    description: "Sign in to continue your government research and legislative analysis.",
  },
  signup: {
    title: "Create Account",
    description: "Create your Menahem account to research legislation, public policy, and government sources.",
  },
  settings: {
    title: "Settings",
    description: "Customize your Menahem account, preferences, and research experience.",
  },
  notFound: {
    title: "Page Not Found",
    description: "The page you're looking for couldn't be found. Continue researching legislation and public policy.",
  },
} as const;
