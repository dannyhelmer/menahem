import path from "node:path";
import { DATA_DIR, readJsonFile, writeJsonFileAtomic } from "@/lib/storage/json-file";

const OWNER_PROFILE_PATH = path.join(DATA_DIR, "owner-profile.json");

export interface OwnerProfile {
  name: string;
  preferredName: string;
  isOwner: boolean;
}

const DEFAULT_OWNER_PROFILE: OwnerProfile = {
  name: "Daniel Helmer",
  preferredName: "Danny",
  isOwner: true,
};

export async function getOwnerProfile(): Promise<OwnerProfile> {
  return readJsonFile<OwnerProfile>(OWNER_PROFILE_PATH, DEFAULT_OWNER_PROFILE);
}

export async function saveOwnerProfile(
  patch: Partial<Pick<OwnerProfile, "name" | "preferredName">>,
): Promise<OwnerProfile> {
  const current = await getOwnerProfile();
  const next: OwnerProfile = { ...current, ...patch };
  await writeJsonFileAtomic(OWNER_PROFILE_PATH, next);
  return next;
}
