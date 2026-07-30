// Turns a snake_case or camelCase identifier into a readable label
// (political_party -> "Political Party", policyArea -> "Policy Area").
// One generic function instead of a hand-maintained label map per
// EntityType/RelationshipType/data key -- stays correct automatically as
// new types are added later, matching this project's extensibility goal.
export function humanize(identifier: string): string {
  const spaced = identifier
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
