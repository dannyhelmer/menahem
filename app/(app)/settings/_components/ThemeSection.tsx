"use client";

import { useEffect, useState } from "react";
import { getStoredThemePreference, setThemePreference, type ThemePreference } from "@/lib/theme/theme";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export default function ThemeSection() {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    setPreference(getStoredThemePreference());
  }, []);

  function handleSelect(value: ThemePreference) {
    setPreference(value);
    setThemePreference(value);
  }

  return (
    <div className="inline-flex rounded-xl border border-neutral-200 p-1 dark:border-neutral-800">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => handleSelect(option.value)}
          className={
            preference === option.value
              ? "bg-burgundy rounded-lg px-4 py-1.5 text-sm font-medium text-white transition-colors duration-150"
              : "rounded-lg px-4 py-1.5 text-sm font-medium text-neutral-600 transition-colors duration-150 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-50"
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
