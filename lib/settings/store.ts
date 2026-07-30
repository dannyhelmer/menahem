import path from "node:path";
import { DATA_DIR, readJsonFile, writeJsonFileAtomic } from "@/lib/storage/json-file";

const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");

type SettingsRecord = Record<string, unknown>;

async function loadSettings(): Promise<SettingsRecord> {
  return readJsonFile<SettingsRecord>(SETTINGS_PATH, {});
}

async function saveSettings(settings: SettingsRecord): Promise<void> {
  await writeJsonFileAtomic(SETTINGS_PATH, settings);
}

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const settings = await loadSettings();
  return key in settings ? (settings[key] as T) : defaultValue;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const settings = await loadSettings();
  settings[key] = value;
  await saveSettings(settings);
}
