import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createAppDatabase,
  migrateLegacyStorage,
  sessionPathForId,
} from "../electron/app-database.mjs";
import { createDatabaseSessionManager } from "../electron/session-database-adapter.mjs";

function withTempDir(run) {
  const directory = mkdtempSync(path.join(tmpdir(), "pi-bot-database-test-"));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function profile(id, workspace, overrides = {}) {
  return {
    id,
    name: id[0].toUpperCase() + id.slice(1),
    initials: id.slice(0, 2).toUpperCase(),
    description: "",
    instructions: "",
    workspace,
    workspaceKind: "external",
    workspaceTrusted: false,
    defaultModelKey: "",
    thinkingLevel: "medium",
    archived: false,
    pinned: false,
    ...overrides,
  };
}

function sessionEntries(id, cwd, messages = []) {
  const header = {
    type: "session",
    version: 3,
    id,
    timestamp: "2026-08-15T00:00:00.000Z",
    cwd,
  };
  return [
    header,
    ...messages.map((message, index) => ({
      type: "message",
      id: `${id}-message-${index + 1}`,
      parentId: index === 0 ? null : `${id}-message-${index}`,
      timestamp: `2026-08-15T00:00:0${index + 1}.000Z`,
      message,
    })),
  ];
}

function writeJsonl(file, entries) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
}

function migrationOptions(directory, overrides = {}) {
  const workspace = path.join(directory, "workspace");
  mkdirSync(workspace, { recursive: true });
  return {
    settingsPath: path.join(directory, "settings.json"),
    sessionsRoot: path.join(directory, "sessions"),
    defaultAgentId: "assistant",
    defaultAgent: profile("assistant", workspace),
    normalizeAgent: (id, value, fallback) => profile(id, value.workspace || fallback.workspace, { ...fallback, ...value, id }),
    ...overrides,
  };
}

test("creates a versioned SQLite store with explicit durability pragmas", () => withTempDir((directory) => {
  const databasePath = path.join(directory, "pi-bot.sqlite");
  const database = createAppDatabase(databasePath);

  assert.equal(existsSync(databasePath), true);
  assert.equal(database.schemaVersion(), 6);
  assert.equal(database.pragma("foreign_keys"), 1);
  assert.equal(database.pragma("busy_timeout"), 5000);
  assert.equal(database.pragma("journal_mode"), "wal");
  assert.deepEqual(database.listSessions(), []);

  database.close();
  assert.equal(existsSync(path.join(directory, "settings.json")), false);
  assert.equal(existsSync(path.join(directory, "sessions")), false);
}));

test("persists agent descriptions and pin state", () => withTempDir((directory) => {
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  const agent = profile("assistant", path.join(directory, "workspace"), { description: "Helps ship releases", pinned: true });

  database.saveState({
    setupComplete: true,
    executionRiskAccepted: true,
    activeAgentId: agent.id,
    thinkingLevel: "medium",
    agents: [agent],
    currentSessions: {},
  });

  assert.equal(database.getState().agents[0]?.description, "Helps ship releases");
  assert.equal(database.getState().agents[0]?.pinned, true);
  database.close();
}));

test("retries migration after malformed legacy data without duplicating valid sessions", () => withTempDir((directory) => {
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  const options = migrationOptions(directory);
  const validFile = path.join(options.sessionsRoot, "assistant", "valid.jsonl");
  const malformedFile = path.join(options.sessionsRoot, "assistant", "malformed.jsonl");
  const validEntries = sessionEntries("valid-session", options.defaultAgent.workspace, [
    { role: "user", content: [{ type: "text", text: "Keep this" }], timestamp: 1786752001000 },
  ]);
  writeJsonl(validFile, validEntries);
  mkdirSync(path.dirname(malformedFile), { recursive: true });
  writeFileSync(malformedFile, `{"type":"session","id":"malformed-session"}\nnot-json\n`);
  writeFileSync(options.settingsPath, JSON.stringify({
    schemaVersion: 2,
    setupComplete: true,
    executionRiskAccepted: true,
    activeAgentId: "assistant",
    thinkingLevel: "medium",
    agents: [options.defaultAgent],
    currentSessions: { assistant: validFile },
    sessionRecords: { [validFile]: { agentId: "assistant", workspace: options.defaultAgent.workspace } },
  }));

  const first = migrateLegacyStorage(database, options);
  assert.equal(first.status, "pending");
  assert.equal(first.importedSessions, 1);
  assert.equal(database.listSessions("assistant").length, 1);
  assert.equal(database.getMigrationStatus().status, "pending");

  const second = migrateLegacyStorage(database, options);
  assert.equal(second.importedSessions, 0);
  assert.equal(database.listSessions("assistant").length, 1);
  database.appendSessionEntry("valid-session", {
    type: "message",
    id: "valid-assistant-1",
    parentId: "valid-session-message-1",
    timestamp: "2026-08-15T00:00:02.000Z",
    message: { role: "assistant", content: [{ type: "text", text: "SQLite-only reply" }], timestamp: 1786752002000 },
  });
  assert.equal(database.getSessionEntries(sessionPathForId("valid-session")).length, validEntries.length + 1);

  const retryWithSQLiteChanges = migrateLegacyStorage(database, options);
  assert.equal(retryWithSQLiteChanges.status, "pending");
  assert.equal(database.getSessionEntries(sessionPathForId("valid-session")).at(-1).message.content[0].text, "SQLite-only reply");

  writeJsonl(malformedFile, sessionEntries("malformed-session", options.defaultAgent.workspace, [
    { role: "user", content: [{ type: "text", text: "Retry me" }], timestamp: 1786752002000 },
  ]));
  const third = migrateLegacyStorage(database, options);
  assert.equal(third.status, "complete");
  assert.equal(database.listSessions("assistant").length, 2);
  assert.equal(database.getSessionEntries(sessionPathForId("valid-session")).length, validEntries.length + 1);
  assert.equal(database.getCurrentSession("assistant"), sessionPathForId("valid-session"));
}));

test("prefers recorded session workspace over a changed profile workspace", () => withTempDir((directory) => {
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  const options = migrationOptions(directory);
  const recordedWorkspace = path.join(directory, "recorded-workspace");
  const changedWorkspace = path.join(directory, "changed-workspace");
  mkdirSync(recordedWorkspace, { recursive: true });
  mkdirSync(changedWorkspace, { recursive: true });
  const file = path.join(options.sessionsRoot, "assistant", "recorded.jsonl");
  writeJsonl(file, sessionEntries("recorded-session", recordedWorkspace, [
    { role: "user", content: [{ type: "text", text: "Recorded workspace" }], timestamp: 1786752001000 },
  ]));
  writeFileSync(options.settingsPath, JSON.stringify({
    schemaVersion: 2,
    agents: [profile("assistant", changedWorkspace)],
    sessionRecords: { [file]: { agentId: "assistant", workspace: recordedWorkspace } },
  }));

  const result = migrateLegacyStorage(database, options);

  assert.equal(result.status, "complete");
  assert.equal(database.getSession(sessionPathForId("recorded-session")).workspace, recordedWorkspace);
}));

test("uses a valid session header cwd when no workspace mapping exists", () => withTempDir((directory) => {
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  const options = migrationOptions(directory);
  const headerWorkspace = path.join(directory, "header-workspace");
  mkdirSync(headerWorkspace, { recursive: true });
  const file = path.join(options.sessionsRoot, "assistant", "header.jsonl");
  writeJsonl(file, sessionEntries("header-session", headerWorkspace, [
    { role: "user", content: [{ type: "text", text: "Header workspace" }], timestamp: 1786752001000 },
  ]));

  const result = migrateLegacyStorage(database, options);

  assert.equal(result.status, "complete");
  assert.equal(database.getSession(sessionPathForId("header-session")).workspace, headerWorkspace);
}));

test("imports a valid version-one linear session after SDK normalization", () => withTempDir((directory) => {
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  const options = migrationOptions(directory);
  const file = path.join(options.sessionsRoot, "assistant", "version-one.jsonl");
  mkdirSync(path.dirname(file), { recursive: true });
  writeJsonl(file, [
    { type: "session", version: 1, id: "version-one-session", timestamp: "2026-08-15T00:00:00.000Z", cwd: options.defaultAgent.workspace },
    { type: "message", timestamp: "2026-08-15T00:00:01.000Z", message: { role: "user", content: [{ type: "text", text: "Version one" }], timestamp: 1786752001000 } },
  ]);

  const result = migrateLegacyStorage(database, options);
  const entries = database.getSessionEntries(sessionPathForId("version-one-session"));

  assert.equal(result.status, "complete");
  assert.equal(entries.length, 2);
  assert.equal(typeof entries[1].id, "string");
  assert.equal(entries[1].parentId, null);
}));

test("upgrades older schema markers and rejects unsupported newer versions", () => withTempDir((directory) => {
  const databasePath = path.join(directory, "pi-bot.sqlite");
  const database = createAppDatabase(databasePath);
  database.db.prepare("UPDATE schema_meta SET value = ? WHERE key = 'schema_version'").run("0");
  database.close();

  const upgraded = createAppDatabase(databasePath);
  assert.equal(upgraded.schemaVersion(), 6);
  upgraded.db.exec("DROP TABLE preferences");
  upgraded.db.exec("ALTER TABLE agents DROP COLUMN description");
  upgraded.db.exec("ALTER TABLE agents DROP COLUMN pinned");
  upgraded.db.prepare("UPDATE schema_meta SET value = ? WHERE key = 'schema_version'").run("1");
  upgraded.db.prepare("DELETE FROM schema_migrations WHERE version = 2").run();
  upgraded.db.prepare("DELETE FROM schema_migrations WHERE version = 3").run();
  upgraded.db.prepare("DELETE FROM schema_migrations WHERE version = 4").run();
  upgraded.db.prepare("DELETE FROM schema_migrations WHERE version = 5").run();
  upgraded.close();

  const migrated = createAppDatabase(databasePath);
  assert.equal(migrated.schemaVersion(), 6);
  assert.equal(migrated.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'preferences'").get()?.name, "preferences");
  assert.equal(migrated.db.prepare("SELECT version FROM schema_migrations WHERE version = 2").get()?.version, 2);
  assert.equal(migrated.db.prepare("SELECT name FROM pragma_table_info('agents') WHERE name = 'description'").get()?.name, "description");
  assert.equal(migrated.db.prepare("SELECT version FROM schema_migrations WHERE version = 3").get()?.version, 3);
  assert.equal(migrated.db.prepare("SELECT version FROM schema_migrations WHERE version = 4").get()?.version, 4);
  assert.equal(migrated.db.prepare("SELECT name FROM pragma_table_info('agents') WHERE name = 'pinned'").get()?.name, "pinned");
  assert.equal(migrated.db.prepare("SELECT version FROM schema_migrations WHERE version = 5").get()?.version, 5);
  assert.equal(migrated.db.prepare("SELECT version FROM schema_migrations WHERE version = 6").get()?.version, 6);
  migrated.db.prepare("UPDATE schema_meta SET value = ? WHERE key = 'schema_version'").run("999");
  migrated.close();

  assert.throws(() => createAppDatabase(databasePath), /Unsupported database schema version/);
}));

test("creates scheduled jobs and agent pins when upgrading a description-only schema version 3 database", () => withTempDir((directory) => {
  const databasePath = path.join(directory, "pi-bot.sqlite");
  const database = createAppDatabase(databasePath);
  database.db.exec("DROP TABLE scheduled_jobs");
  database.db.exec("ALTER TABLE agents DROP COLUMN pinned");
  database.db.prepare("UPDATE schema_meta SET value = ? WHERE key = 'schema_version'").run("3");
  database.db.prepare("DELETE FROM schema_migrations WHERE version = 4").run();
  database.db.prepare("DELETE FROM schema_migrations WHERE version = 5").run();
  database.close();

  const upgraded = createAppDatabase(databasePath);
  assert.equal(upgraded.schemaVersion(), 6);
  assert.equal(upgraded.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'scheduled_jobs'").get()?.name, "scheduled_jobs");
  assert.equal(upgraded.db.prepare("SELECT version FROM schema_migrations WHERE version = 4").get()?.version, 4);
  assert.equal(upgraded.db.prepare("SELECT name FROM pragma_table_info('agents') WHERE name = 'pinned'").get()?.name, "pinned");
  assert.equal(upgraded.db.prepare("SELECT version FROM schema_migrations WHERE version = 5").get()?.version, 5);
  assert.equal(upgraded.db.prepare("SELECT version FROM schema_migrations WHERE version = 6").get()?.version, 6);
  upgraded.close();
}));

test("imports legacy settings and current mapping while recovering a pending session first", () => withTempDir((directory) => {
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  const workspace = path.join(directory, "legacy-workspace");
  mkdirSync(workspace, { recursive: true });
  const legacyFile = path.join(directory, "legacy-session.jsonl");
  const entries = sessionEntries("legacy-session", workspace, [
    { role: "user", content: [{ type: "text", text: "Legacy first prompt" }], timestamp: 1786752001000 },
  ]);
  writeJsonl(`${legacyFile}.pending`, entries);
  writeFileSync(path.join(directory, "settings.json"), JSON.stringify({
    workspace,
    modelKey: "provider/model",
    thinkingLevel: "high",
    activeAgentId: "legacy",
    agentSessions: { legacy: legacyFile },
  }));

  const options = migrationOptions(directory, {
    defaultAgent: profile("assistant", path.join(directory, "unused")),
    normalizeAgent: (id, value, fallback) => profile(id, value.workspace || fallback.workspace, { ...fallback, ...value, id }),
  });
  const result = migrateLegacyStorage(database, options);

  assert.equal(result.status, "complete");
  assert.equal(existsSync(legacyFile), true);
  assert.equal(existsSync(`${legacyFile}.pending`), false);
  assert.deepEqual(database.getState().agents.map((agent) => agent.id), ["assistant"]);
  assert.equal(database.getState().agents[0].workspace, workspace);
  assert.equal(database.getCurrentSession("assistant"), sessionPathForId("legacy-session"));
  assert.equal(readFileSync(legacyFile, "utf8").trim().split("\n").length, entries.length);
}));

test("does not complete migration for partial or header-invalid legacy entries", () => withTempDir((directory) => {
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  const options = migrationOptions(directory);
  const partialFile = path.join(options.sessionsRoot, "partial.jsonl");
  const noHeaderFile = path.join(options.sessionsRoot, "no-header.jsonl");
  mkdirSync(options.sessionsRoot, { recursive: true });
  writeFileSync(partialFile, `{"type":"session","id":"partial"}\n{"type":"message"}\n`);
  writeFileSync(noHeaderFile, `{"type":"message","id":"message-1"}\n`);

  const result = migrateLegacyStorage(database, options);

  assert.equal(result.status, "pending");
  assert.equal(result.importedSessions, 0);
  assert.equal(database.listSessions().length, 0);
  assert.equal(database.getMigrationStatus().failedPaths.length, 2);
}));

test("persists an interrupted first prompt and isolates agent/workspace sessions", () => withTempDir((directory) => {
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  const agentA = profile("planner", path.join(directory, "planner-workspace"));
  const agentB = profile("coder", path.join(directory, "coder-workspace"));
  database.saveState({
    setupComplete: true,
    executionRiskAccepted: true,
    activeAgentId: "planner",
    thinkingLevel: "medium",
    agents: [agentA, agentB],
    currentSessions: {},
  });
  const entriesA = sessionEntries("planner-session", agentA.workspace);
  const entriesB = sessionEntries("coder-session", agentB.workspace, [
    { role: "user", content: [{ type: "text", text: "Coder" }], timestamp: 1786752001000 },
    { role: "assistant", content: [{ type: "text", text: "Done" }], timestamp: 1786752002000 },
  ]);
  database.saveSession({ id: "planner-session", agentId: agentA.id, workspace: agentA.workspace, entries: entriesA });
  database.saveSession({ id: "coder-session", agentId: agentB.id, workspace: agentB.workspace, entries: entriesB });
  database.setCurrentSession(agentA.id, sessionPathForId("planner-session"));
  database.appendSessionEntry("planner-session", {
    type: "message",
    id: "planner-user-1",
    parentId: null,
    timestamp: "2026-08-15T00:00:01.000Z",
    message: { role: "user", content: [{ type: "text", text: "Interrupted" }], timestamp: 1786752001000 },
  });
  database.close();

  const restarted = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  assert.equal(restarted.getCurrentSession(agentA.id), sessionPathForId("planner-session"));
  assert.equal(restarted.getSessionEntries(sessionPathForId("planner-session")).some((entry) => entry.type === "message"), true);
  assert.deepEqual(restarted.listSessions(agentB.id).map((session) => session.workspace), [agentB.workspace]);
  assert.equal(restarted.listSessions(agentA.id)[0].workspace, agentA.workspace);
  assert.equal(restarted.listSessions(agentA.id)[0].messageCount, 1);
  assert.equal(restarted.listSessions(agentB.id)[0].messageCount, 2);
}));

test("does not attribute sessions while legacy settings are malformed", () => withTempDir((directory) => {
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  const options = migrationOptions(directory);
  const plannerWorkspace = path.join(directory, "planner-workspace");
  mkdirSync(plannerWorkspace, { recursive: true });
  const file = path.join(options.sessionsRoot, "planner", "session.jsonl");
  writeJsonl(file, sessionEntries("planner-session", plannerWorkspace, [
    { role: "user", content: [{ type: "text", text: "Planner" }], timestamp: 1786752001000 },
  ]));
  writeFileSync(options.settingsPath, "{malformed settings");

  const first = migrateLegacyStorage(database, options);

  assert.equal(first.status, "pending");
  assert.equal(first.importedSessions, 0);
  assert.equal(database.listSessions().length, 0);

  writeFileSync(options.settingsPath, JSON.stringify({
    schemaVersion: 2,
    setupComplete: true,
    activeAgentId: "planner",
    agents: [profile("planner", plannerWorkspace)],
    currentSessions: { planner: file },
    sessionRecords: { [file]: { agentId: "planner", workspace: plannerWorkspace } },
  }));
  const repaired = migrateLegacyStorage(database, options);
  const imported = database.listSessions("planner");

  assert.equal(repaired.status, "complete");
  assert.equal(repaired.importedSessions, 1);
  assert.equal(imported.length, 1);
  assert.equal(imported[0].workspace, plannerWorkspace);
}));

test("deduplicates identical session IDs and keeps the longest valid transcript", () => withTempDir((directory) => {
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  const options = migrationOptions(directory);
  const shortFile = path.join(options.sessionsRoot, "a-short.jsonl");
  const completeFile = path.join(options.sessionsRoot, "z-complete.jsonl");
  const shortEntries = sessionEntries("duplicate-session", options.defaultAgent.workspace, [
    { role: "user", content: [{ type: "text", text: "Keep" }], timestamp: 1786752001000 },
  ]);
  const completeEntries = [...shortEntries, {
    type: "message",
    id: "duplicate-session-message-2",
    parentId: "duplicate-session-message-1",
    timestamp: "2026-08-15T00:00:02.000Z",
    message: { role: "assistant", content: [{ type: "text", text: "Complete" }], timestamp: 1786752002000 },
  }];
  writeJsonl(shortFile, shortEntries);
  writeJsonl(completeFile, completeEntries);

  const result = migrateLegacyStorage(database, {
    ...options,
    defaultAgent: profile("assistant", options.defaultAgent.workspace),
  });

  assert.equal(result.status, "complete");
  assert.equal(result.importedSessions, 1);
  assert.equal(database.listSessions().length, 1);
  assert.deepEqual(database.getSessionEntries(sessionPathForId("duplicate-session")), completeEntries);
}));

test("leaves conflicting duplicate session IDs pending without overwriting either source", () => withTempDir((directory) => {
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  const options = migrationOptions(directory);
  const firstFile = path.join(options.sessionsRoot, "first.jsonl");
  const secondFile = path.join(options.sessionsRoot, "second.jsonl");
  const firstEntries = sessionEntries("conflict-session", options.defaultAgent.workspace, [
    { role: "user", content: [{ type: "text", text: "First" }], timestamp: 1786752001000 },
  ]);
  const secondEntries = sessionEntries("conflict-session", options.defaultAgent.workspace, [
    { role: "user", content: [{ type: "text", text: "Second" }], timestamp: 1786752001000 },
  ]);
  writeJsonl(firstFile, firstEntries);
  writeJsonl(secondFile, secondEntries);

  const result = migrateLegacyStorage(database, options);

  assert.equal(result.status, "pending");
  assert.equal(result.importedSessions, 0);
  assert.equal(database.listSessions().length, 0);
  assert.equal(existsSync(firstFile), true);
  assert.equal(existsSync(secondFile), true);
}));

test("normalizes v2 hook messages to current custom messages before adapter reopen", () => withTempDir((directory) => {
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  const options = migrationOptions(directory);
  const file = path.join(options.sessionsRoot, "v2.jsonl");
  writeJsonl(file, [
    { type: "session", version: 2, id: "version-two-session", timestamp: "2026-08-15T00:00:00.000Z", cwd: options.defaultAgent.workspace },
    {
      type: "message",
      id: "version-two-message",
      parentId: null,
      timestamp: "2026-08-15T00:00:01.000Z",
      message: { role: "hookMessage", customType: "legacy-hook", content: [{ type: "text", text: "Version two" }] },
    },
  ]);

  const result = migrateLegacyStorage(database, options);
  const sessionPath = sessionPathForId("version-two-session");
  const manager = createDatabaseSessionManager({
    database,
    profile: options.defaultAgent,
    sessionPath,
    entries: database.getSessionEntries(sessionPath),
  });

  assert.equal(result.status, "complete");
  assert.equal(manager.getHeader().version, 3);
  assert.equal(manager.getEntries()[0].message.role, "custom");
}));

test("rejects a session entry whose parent is not an earlier tree node", () => withTempDir((directory) => {
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  const options = migrationOptions(directory);
  const file = path.join(options.sessionsRoot, "invalid-parent.jsonl");
  writeJsonl(file, [
    { type: "session", version: 3, id: "invalid-parent-session", timestamp: "2026-08-15T00:00:00.000Z", cwd: options.defaultAgent.workspace },
    { type: "message", id: "u1", parentId: null, timestamp: "2026-08-15T00:00:01.000Z", message: { role: "user", content: "One" } },
    { type: "message", id: "a1", parentId: "u1", timestamp: "2026-08-15T00:00:02.000Z", message: { role: "assistant", content: "Answer" } },
    { type: "message", id: "u2", parentId: "missing", timestamp: "2026-08-15T00:00:03.000Z", message: { role: "user", content: "Two" } },
  ]);

  const result = migrateLegacyStorage(database, options);

  assert.equal(result.status, "pending");
  assert.equal(result.importedSessions, 0);
  assert.equal(database.listSessions().length, 0);
  assert.equal(existsSync(file), true);
}));

test("preserves existing current-session mappings when settings are malformed", () => withTempDir((directory) => {
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  const options = migrationOptions(directory);
  database.saveState({
    setupComplete: true,
    executionRiskAccepted: true,
    activeAgentId: "assistant",
    thinkingLevel: "medium",
    agents: [options.defaultAgent],
    currentSessions: {},
  });
  const sessionPath = database.saveSession({
    id: "existing-current-session",
    agentId: "assistant",
    workspace: options.defaultAgent.workspace,
    entries: sessionEntries("existing-current-session", options.defaultAgent.workspace),
  });
  database.saveState({
    setupComplete: true,
    executionRiskAccepted: true,
    activeAgentId: "assistant",
    thinkingLevel: "medium",
    agents: [options.defaultAgent],
    currentSessions: { assistant: sessionPath },
  });
  writeFileSync(options.settingsPath, "{malformed settings");

  const result = migrateLegacyStorage(database, options);

  assert.equal(result.status, "pending");
  assert.equal(database.getCurrentSession("assistant"), sessionPath);
}));

test("normalizes a versionless legacy session using v1 SDK semantics", () => withTempDir((directory) => {
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  const options = migrationOptions(directory);
  const file = path.join(options.sessionsRoot, "versionless.jsonl");
  writeJsonl(file, [
    { type: "session", id: "versionless-session", timestamp: "2026-08-15T00:00:00.000Z", cwd: options.defaultAgent.workspace },
    { type: "message", timestamp: "2026-08-15T00:00:01.000Z", message: { role: "user", content: [{ type: "text", text: "Versionless" }] } },
  ]);

  const result = migrateLegacyStorage(database, options);
  const entries = database.getSessionEntries(sessionPathForId("versionless-session"));

  assert.equal(result.status, "complete");
  assert.equal(entries[0].version, 3);
  assert.equal(typeof entries[1].id, "string");
  assert.equal(entries[1].parentId, null);
}));

test("deleting sessions and agents removes their workspace preferences", () => withTempDir((directory) => {
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  const agent = profile("assistant", path.join(directory, "workspace"));
  database.saveState({ setupComplete: true, executionRiskAccepted: true, activeAgentId: agent.id, thinkingLevel: "medium", agents: [agent], currentSessions: {} });
  const sessionPath = database.saveSession({ id: "preference-session", agentId: agent.id, workspace: agent.workspace, entries: sessionEntries("preference-session", agent.workspace) });
  database.saveWorkspacePreferences(`pi-bot.workspace-panel:${sessionPath}`, { tabs: [{ id: "browser", kind: "browser", url: "https://example.com/" }], activeTabId: "browser", open: true, width: 340 });
  database.saveWorkspacePreferences(`pi-bot.workspace-panel:${agent.id}`, { tabs: [{ id: "browser", kind: "browser", url: "https://agent.example.com/" }], activeTabId: "browser", open: true, width: 340 });

  database.deleteSession(sessionPath);
  assert.equal(database.getWorkspacePreferences(`pi-bot.workspace-panel:${sessionPath}`), null);
  assert.notEqual(database.getWorkspacePreferences(`pi-bot.workspace-panel:${agent.id}`), null);

  database.deleteAgent(agent.id);
  assert.equal(database.getWorkspacePreferences(`pi-bot.workspace-panel:${agent.id}`), null);
}));
