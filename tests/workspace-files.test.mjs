import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { listWorkspaceFiles } from "../electron/workspace-files.mjs";

function withWorkspace(callback) {
  const workspace = mkdtempSync(path.join(os.tmpdir(), "pi-bot-workspace-"));
  try {
    return callback(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function paths(workspace, options) {
  return listWorkspaceFiles(workspace, options).map((entry) => `${entry.kind}:${entry.path}`);
}

test("hides root and nested dot entries while retaining visible siblings", () => withWorkspace((workspace) => {
  mkdirSync(path.join(workspace, ".agents", "skills"), { recursive: true });
  mkdirSync(path.join(workspace, "src", ".private"), { recursive: true });
  mkdirSync(path.join(workspace, "src", "public"), { recursive: true });
  writeFileSync(path.join(workspace, ".env"), "secret");
  writeFileSync(path.join(workspace, ".DS_Store"), "metadata");
  writeFileSync(path.join(workspace, ".agents", "skills", "hidden.md"), "hidden");
  writeFileSync(path.join(workspace, "src", ".private", "hidden.ts"), "hidden");
  writeFileSync(path.join(workspace, "src", "public", "visible.ts"), "visible");
  writeFileSync(path.join(workspace, "README.md"), "visible");

  assert.deepEqual(paths(workspace), [
    "folder:src",
    "folder:src/public",
    "file:src/public/visible.ts",
    "file:README.md",
  ]);
}));

test("keeps generated-directory exclusions and filesystem safety limits", () => withWorkspace((workspace) => {
  for (const name of ["node_modules", "dist", "build", "release", "coverage", ".next", ".venv"]) {
    mkdirSync(path.join(workspace, name), { recursive: true });
    writeFileSync(path.join(workspace, name, "generated.js"), "generated");
  }
  mkdirSync(path.join(workspace, "visible"), { recursive: true });
  writeFileSync(path.join(workspace, "visible", "entry.ts"), "visible");
  const outside = mkdtempSync(path.join(os.tmpdir(), "pi-bot-outside-"));
  try {
    writeFileSync(path.join(outside, "outside.txt"), "outside");
    symlinkSync(outside, path.join(workspace, "linked"));
    assert.deepEqual(paths(workspace, { maxFiles: 2 }), ["folder:visible", "file:visible/entry.ts"]);
    assert.deepEqual(paths(workspace), ["folder:visible", "file:visible/entry.ts"]);
    assert.equal(readFileSync(path.join(outside, "outside.txt"), "utf8"), "outside");
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
}));

test("does not expose entries below the traversal depth limit", () => withWorkspace((workspace) => {
  let directory = workspace;
  for (let depth = 1; depth <= 5; depth += 1) {
    directory = path.join(directory, `level-${depth}`);
    mkdirSync(directory);
    writeFileSync(path.join(directory, `file-${depth}.txt`), "file");
  }

  const listed = listWorkspaceFiles(workspace);
  assert.ok(listed.some((entry) => entry.path === "level-1/level-2/level-3/level-4/level-5"));
  assert.ok(!listed.some((entry) => entry.path.endsWith("file-5.txt")));
}));
