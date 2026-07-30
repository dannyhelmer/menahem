import path from "node:path";
import { DATA_DIR, readJsonFile, writeJsonFileAtomic } from "@/lib/storage/json-file";

const OWNER_PROFILE_PATH = path.join(DATA_DIR, "owner-profile.json");

export interface OwnerProfile {
  name: string;
  preferredName: string;
  isOwner: boolean;
}

// Falls back to this whenever no profile has been saved for this
// deployment (data/owner-profile.json is gitignored, so a fresh production
// deployment always starts here) -- public visitors must never be
// defaulted to the developer's own name.
const DEFAULT_OWNER_PROFILE: OwnerProfile = {
  name: "Guest",
  preferredName: "Guest",
  isOwner: false,
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
