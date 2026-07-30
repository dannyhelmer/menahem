import { getUserById, updateProfile } from "@/lib/auth/users";

// "What Menahem calls you" -- a per-account personalization setting, backed
// by the users table (full_name/preferred_name), separate from the login
// email itself. Each account has its own; nothing here is shared globally
// (this used to be a single JSON file before the private-beta multi-user
// system existed, which meant every account saw and overwrote the same
// name -- fixed by moving it onto the user's own row).
export interface OwnerProfile {
  name: string;
  preferredName: string;
}

const DEFAULT_PROFILE: OwnerProfile = { name: "", preferredName: "Guest" };

export async function getOwnerProfile(userId: string): Promise<OwnerProfile> {
  const user = await getUserById(userId);
  if (!user) return DEFAULT_PROFILE;
  return {
    name: user.fullName ?? "",
    preferredName: user.preferredName ?? "Guest",
  };
}

export async function saveOwnerProfile(
  userId: string,
  patch: Partial<Pick<OwnerProfile, "name" | "preferredName">>,
): Promise<OwnerProfile> {
  await updateProfile(userId, { fullName: patch.name, preferredName: patch.preferredName });
  return getOwnerProfile(userId);
}
