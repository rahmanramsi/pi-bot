import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { createAppDatabase } from "../electron/app-database.mjs";
import {
  createMemoryContextExtension,
  createMemoryTool,
  memoryScopeForProfile,
  memoryToolName,
} from "../electron/memory.mjs";

async function withTempDir(run) {
  const directory = mkdtempSync(path.join(tmpdir(), "pi-bot-memory-test-"));
  try {
    return await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function profile(id, workspace) {
  return {
    id,
    name: id,
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
  };
}

function setup(directory) {
  const workspace = path.join(directory, "workspace");
  mkdirSync(workspace, { recursive: true });
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  const agent = profile("assistant", workspace);
  database.saveState({
    setupComplete: true,
    executionRiskAccepted: true,
    activeAgentId: agent.id,
    thinkingLevel: "medium",
    agents: [agent],
    currentSessions: {},
  });
  return { database, agent, workspace };
}

function contextSnapshot(database, agent) {
  let handler;
  createMemoryContextExtension({ database, profile: agent })({
    on(eventName, nextHandler) {
      assert.equal(eventName, "before_agent_start");
      handler = nextHandler;
    },
  });
  return handler({ systemPrompt: "base system prompt" }).systemPrompt;
}

test("executes memory CRUD through the real tool definition and SDK allowlist", async () => withTempDir(async (directory) => {
  const { database, agent, workspace } = setup(directory);
  const tool = createMemoryTool({
    database,
    profile: agent,
    sessionManager: { getSessionId: () => "session-1" },
    idFactory: () => "memory-1",
  });

  assert.equal(tool.name, memoryToolName);
  assert.equal(tool.executionMode, "sequential");
  assert.deepEqual(tool.parameters.required, ["action"]);

  const empty = await tool.execute("call-1", { action: "list" });
  assert.equal(empty.details.count, 0);
  const added = await tool.execute("call-2", { action: "add", content: "Prefer concise plans." });
  assert.equal(added.details.memoryId, "memory-1");
  assert.equal(database.listMemories(agent.id, workspace)[0].sourceSessionId, "session-1");

  const updated = await tool.execute("call-3", { action: "update", id: "memory-1", content: "Prefer short plans." });
  assert.equal(updated.details.memoryId, "memory-1");
  const listed = await tool.execute("call-4", { action: "list" });
  assert.match(listed.content[0].text, /Prefer short plans\./);

  const deleted = await tool.execute("call-5", { action: "delete", id: "memory-1" });
  assert.equal(deleted.details.memoryId, "memory-1");
  assert.deepEqual(database.listMemories(agent.id, workspace), []);

  const resourceLoader = new DefaultResourceLoader({
    cwd: workspace,
    agentDir: path.join(directory, "runtime"),
    settingsManager: SettingsManager.inMemory(),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();
  const sdkSession = await createAgentSession({
    cwd: workspace,
    tools: [memoryToolName],
    customTools: [tool],
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory(),
    resourceLoader,
  });
  assert.deepEqual(sdkSession.session.getActiveToolNames(), [memoryToolName]);
  assert.equal(sdkSession.session.getAllTools().some((entry) => entry.name === memoryToolName), true);
  sdkSession.session.dispose();
  database.close();
}));

test("context injection reads a fresh snapshot after add, update, and delete", async () => withTempDir(async (directory) => {
  const { database, agent } = setup(directory);
  const tool = createMemoryTool({
    database,
    profile: agent,
    idFactory: () => "memory-1",
  });

  const before = contextSnapshot(database, agent);
  assert.match(before, /\(No saved memories\.\)/);

  await tool.execute("call-1", { action: "add", content: "Prefer concise plans." });
  const afterAdd = contextSnapshot(database, agent);
  assert.match(afterAdd, /Prefer concise plans\./);

  await tool.execute("call-2", { action: "update", id: "memory-1", content: "Prefer short plans." });
  const afterUpdate = contextSnapshot(database, agent);
  assert.doesNotMatch(afterUpdate, /Prefer concise plans\./);
  assert.match(afterUpdate, /Prefer short plans\./);

  await tool.execute("call-3", { action: "delete", id: "memory-1" });
  const afterDelete = contextSnapshot(database, agent);
  assert.doesNotMatch(afterDelete, /Prefer short plans\./);
  assert.match(afterDelete, /\(No saved memories\.\)/);
  assert.equal(memoryScopeForProfile(agent).agentId, agent.id);
  database.close();
}));
