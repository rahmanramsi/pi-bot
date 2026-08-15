import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronBinary = path.join(repositoryRoot, "node_modules", ".bin", "electron");
const databaseModule = pathToFileURL(path.join(repositoryRoot, "electron", "app-database.mjs")).href;
const adapterModule = pathToFileURL(path.join(repositoryRoot, "electron", "session-database-adapter.mjs")).href;

function withTempDir(run) {
  const directory = mkdtempSync(path.join(tmpdir(), "pi-bot-electron-database-test-"));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runElectron(script) {
  const result = spawnSync(electronBinary, ["-e", script], {
    cwd: repositoryRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `Electron failed:\n${result.stderr}`);
  const output = result.stdout.trim().split("\n").at(-1);
  assert.ok(output, `Electron produced no JSON output. stderr: ${result.stderr}`);
  return JSON.parse(output);
}

test("Electron migration, append, and restart preserve the SQLite session tree", () => withTempDir((directory) => {
  const workspace = path.join(directory, "workspace");
  const sessionsRoot = path.join(directory, "sessions");
  const settingsPath = path.join(directory, "settings.json");
  const databasePath = path.join(directory, "pi-bot.sqlite");
  const legacyPath = path.join(sessionsRoot, "assistant", "legacy.jsonl");
  mkdirSync(workspace, { recursive: true });
  mkdirSync(path.dirname(legacyPath), { recursive: true });
  const agent = {
    id: "assistant",
    name: "Assistant",
    initials: "AS",
    instructions: "",
    workspace,
    workspaceKind: "external",
    workspaceTrusted: false,
    defaultModelKey: "",
    thinkingLevel: "medium",
    archived: false,
  };
  const entries = [
    { type: "session", version: 3, id: "legacy-electron-session", timestamp: "2026-08-15T00:00:00.000Z", cwd: workspace },
    {
      type: "message",
      id: "legacy-prompt",
      parentId: null,
      timestamp: "2026-08-15T00:00:01.000Z",
      message: { role: "user", content: [{ type: "text", text: "Legacy prompt" }], timestamp: 1786752001000 },
    },
  ];
  writeFileSync(legacyPath, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  writeFileSync(settingsPath, JSON.stringify({
    schemaVersion: 2,
    setupComplete: true,
    executionRiskAccepted: true,
    activeAgentId: "assistant",
    agents: [agent],
    currentSessions: { assistant: legacyPath },
    sessionRecords: { [legacyPath]: { agentId: "assistant", workspace } },
  }));

  const firstRun = runElectron(`
    import { createAppDatabase, migrateLegacyStorage, sessionPathForId } from ${JSON.stringify(databaseModule)};
    import { createDatabaseSessionManager } from ${JSON.stringify(adapterModule)};
    const directory = ${JSON.stringify(directory)};
    const workspace = ${JSON.stringify(workspace)};
    const agent = ${JSON.stringify(agent)};
    const database = createAppDatabase(${JSON.stringify(databasePath)});
    const result = migrateLegacyStorage(database, {
      settingsPath: ${JSON.stringify(settingsPath)},
      sessionsRoot: ${JSON.stringify(sessionsRoot)},
      defaultAgentId: "assistant",
      defaultAgent: agent,
      normalizeAgent: (id, value, fallback) => ({ ...fallback, ...value, id }),
    });
    const sessionPath = sessionPathForId("legacy-electron-session");
    const manager = createDatabaseSessionManager({
      database,
      profile: agent,
      sessionPath,
      entries: database.getSessionEntries(sessionPath),
    });
    manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "Electron response" }], timestamp: Date.now() });
    const entries = manager.getEntries();
    database.close();
    console.log(JSON.stringify({ status: result.status, importedSessions: result.importedSessions, entries: entries.length }));
  `);
  assert.deepEqual(firstRun, { status: "complete", importedSessions: 1, entries: 2 });

  const restart = runElectron(`
    import { createAppDatabase, sessionPathForId } from ${JSON.stringify(databaseModule)};
    import { createDatabaseSessionManager } from ${JSON.stringify(adapterModule)};
    const agent = ${JSON.stringify(agent)};
    const database = createAppDatabase(${JSON.stringify(databasePath)});
    const sessionPath = sessionPathForId("legacy-electron-session");
    const manager = createDatabaseSessionManager({
      database,
      profile: agent,
      sessionPath,
      entries: database.getSessionEntries(sessionPath),
    });
    const entries = manager.getEntries();
    database.close();
    console.log(JSON.stringify({ entries: entries.length, lastText: entries.at(-1)?.message?.content?.[0]?.text }));
  `);
  assert.deepEqual(restart, { entries: 2, lastText: "Electron response" });
}));
