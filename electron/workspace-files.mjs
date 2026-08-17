import { readdirSync } from "node:fs";
import path from "node:path";

export const maxWorkspaceFiles = 500;
export const maxWorkspaceDepth = 4;
export const skippedWorkspaceNames = new Set([".git", "node_modules", "dist", "build", "release", "coverage", ".next", ".venv"]);

function isInsideWorkspace(workspace, target) {
  const relative = path.relative(workspace, target);
  return Boolean(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isHiddenRelativePath(relativePath) {
  return relativePath.split(path.sep).some((segment) => segment.startsWith("."));
}

export function listWorkspaceFiles(workspace, { maxFiles = maxWorkspaceFiles, maxDepth = maxWorkspaceDepth } = {}) {
  const root = path.resolve(workspace);
  const items = [];
  const visit = (directory, depth) => {
    if (items.length >= maxFiles || depth > maxDepth) return;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (items.length >= maxFiles || skippedWorkspaceNames.has(entry.name) || entry.isSymbolicLink()) continue;
      const absolutePath = path.join(directory, entry.name);
      if (!isInsideWorkspace(root, absolutePath)) continue;
      const relativePath = path.relative(root, absolutePath);
      if (isHiddenRelativePath(relativePath)) continue;
      if (entry.isDirectory()) {
        items.push({ path: relativePath, kind: "folder" });
        visit(absolutePath, depth + 1);
      } else if (entry.isFile()) {
        items.push({ path: relativePath, kind: "file" });
      }
    }
  };
  visit(root, 0);
  return items;
}
