import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createAppDatabase, normalizeUserProfile } from "../electron/app-database.mjs";

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

test("persists the selected theme through SQLite across restart", () => withTempDir((directory) => {
  const databasePath = path.join(directory, "pi-bot.sqlite");
  const database = createAppDatabase(databasePath);

  assert.equal(database.getTheme(), "dark");
  assert.equal(database.saveTheme("light"), "light");
  database.close();

  const restarted = createAppDatabase(databasePath);
  assert.equal(restarted.getTheme(), "light");
  restarted.close();
}));

test("persists one app-owned user profile through CRUD and restart", () => withTempDir((directory) => {
  const databasePath = path.join(directory, "pi-bot.sqlite");
  const database = createAppDatabase(databasePath);

  assert.deepEqual(database.getUserProfile(), { avatar: "", name: "", about: "" });
  assert.deepEqual(database.saveUserProfile({ avatar: "🧑‍💻", name: "  Rahman  ", about: "  Builds local-first tools.  " }), {
    avatar: "🧑‍💻",
    name: "Rahman",
    about: "Builds local-first tools.",
  });
  assert.deepEqual(database.getUserProfile(), {
    avatar: "🧑‍💻",
    name: "Rahman",
    about: "Builds local-first tools.",
  });
  database.close();

  const restarted = createAppDatabase(databasePath);
  assert.deepEqual(restarted.getUserProfile(), {
    avatar: "🧑‍💻",
    name: "Rahman",
    about: "Builds local-first tools.",
  });
  assert.deepEqual(restarted.saveUserProfile({ avatar: "", name: "", about: "" }), { avatar: "", name: "", about: "" });
  assert.deepEqual(restarted.getUserProfile(), { avatar: "", name: "", about: "" });
  restarted.close();

  const clearedRestart = createAppDatabase(databasePath);
  assert.deepEqual(clearedRestart.getUserProfile(), { avatar: "", name: "", about: "" });
  assert.deepEqual(clearedRestart.getState().agents, []);
  clearedRestart.close();
}));

test("normalizes user profile input to one emoji and bounded text", () => {
  assert.deepEqual(normalizeUserProfile({ avatar: "not an emoji", name: "  A  ", about: "  B  " }), { avatar: "", name: "A", about: "B" });
  assert.equal(normalizeUserProfile({ avatar: "😀😁" }).avatar, "😀");
});

test("exposes app-owned preference operations through preload", () => {
  const preload = readFileSync(path.join(process.cwd(), "electron", "preload.cjs"), "utf8");
  const app = readFileSync(path.join(process.cwd(), "src", "App.tsx"), "utf8");
  assert.match(preload, /getTheme/);
  assert.match(preload, /saveTheme/);
  assert.match(preload, /getWorkspacePreferences/);
  assert.match(preload, /saveWorkspacePreferences/);
  assert.match(preload, /getUserProfile/);
  assert.match(preload, /saveUserProfile/);
  assert.doesNotMatch(preload, /appDatabase|node:sqlite|pi-bot\.sqlite/);
  assert.match(app, /window\.piBot\.saveTheme\(next\)/);
  assert.match(app, /Profile/);
  assert.match(app, /About you/);
  assert.doesNotMatch(app, /passwords, API keys/);
});

test("guards preference writes until the current session key finishes loading", () => {
  const app = readFileSync(path.join(process.cwd(), "src", "App.tsx"), "utf8");
  assert.match(app, /loadedStorageKey/);
  assert.match(app, /loadedStorageKey\.current !== storageKey/);
});
