import { rmSync } from "node:fs";
import path from "node:path";

export function migrateAppOwnedWorkspaces(profiles, onError = () => {}) {
  for (const profile of Object.values(profiles ?? {})) {
    if (profile?.workspaceKind !== "app" || typeof profile.workspace !== "string" || !profile.workspace) continue;
    try {
      rmSync(path.join(profile.workspace, "AGENTS.md"), { force: true });
    } catch (error) {
      onError(profile, error);
    }
  }
}
