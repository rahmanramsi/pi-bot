import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createAppDatabase } from "../electron/app-database.mjs";

function withTempDir(run) {
  const directory = mkdtempSync(path.join(tmpdir(), "pi-bot-preferences-test-"));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("persists workspace panel preferences through SQLite across restart", () => withTempDir((directory) => {
  const databasePath = path.join(directory, "pi-bot.sqlite");
  const database = createAppDatabase(databasePath);
  const preferences = {
    tabs: [{ id: "files-default", kind: "files" }, { id: "browser-1", kind: "browser", url: "https://example.com/" }],
    activeTabId: "browser-1",
    open: false,
    width: 412,
  };

  database.saveWorkspacePreferences("pi-bot.workspace-panel:session-1", preferences);
  assert.deepEqual(database.getWorkspacePreferences("pi-bot.workspace-panel:session-1"), preferences);
  database.close();

  const restarted = createAppDatabase(databasePath);
  assert.deepEqual(restarted.getWorkspacePreferences("pi-bot.workspace-panel:session-1"), preferences);
  restarted.close();
}));

test("exposes only the workspace preference operations through preload", () => {
  const preload = readFileSync(path.join(process.cwd(), "electron", "preload.cjs"), "utf8");
  assert.match(preload, /getWorkspacePreferences/);
  assert.match(preload, /saveWorkspacePreferences/);
  assert.doesNotMatch(preload, /appDatabase|node:sqlite|pi-bot\.sqlite/);
});

test("guards preference writes until the current session key finishes loading", () => {
  const app = readFileSync(path.join(process.cwd(), "src", "App.tsx"), "utf8");
  assert.match(app, /loadedStorageKey/);
  assert.match(app, /loadedStorageKey\.current !== storageKey/);
});
