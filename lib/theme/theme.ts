// Client-only, device-local preference (not synced through Postgres --
// unrelated to the per-account owner-profile display name setting).
export type ThemePreference = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "menahem-theme";

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function resolveTheme(preference: ThemePreference): "light" | "dark" {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(preference: ThemePreference): void {
  document.documentElement.setAttribute("data-theme", resolveTheme(preference));
}

export function setThemePreference(preference: ThemePreference): void {
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  applyTheme(preference);
}

// Inlined into a blocking <script> tag in the root layout's <head> -- runs
// before first paint so the correct theme applies immediately, with no
// flash of the wrong theme while React hydrates.
export const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem("${THEME_STORAGE_KEY}");var t=s==="light"||s==="dark"?s:"system";var r=t==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;document.documentElement.setAttribute("data-theme",r);}catch(e){}})();`;
