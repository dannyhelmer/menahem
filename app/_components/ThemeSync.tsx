"use client";

import { useEffect } from "react";
import { applyTheme, getStoredThemePreference } from "@/lib/theme/theme";

// Keeps data-theme live-updated when the OS theme changes while "System" is
// selected and the app is already open (the blocking head script only
// handles the initial load). Mounted once in the root layout.
export default function ThemeSync() {
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange() {
      if (getStoredThemePreference() === "system") applyTheme("system");
    }
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return null;
}
