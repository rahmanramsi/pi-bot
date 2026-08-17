import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DefaultResourceLoader,
  loadSkillsFromDir,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { createAppDatabase } from "../electron/app-database.mjs";
import { migrateAppOwnedWorkspaces } from "../electron/agent-workspace.mjs";
import { refreshAgentRuntime } from "../electron/agent-runtime.mjs";

const mainSource = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");

async function withTempDir(run) {
  const directory = mkdtempSync(path.join(tmpdir(), "pi-bot-agent-instructions-test-"));
  try {
    return await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("agent instructions are app-owned resource context", () => {
  const normalizeProfile = mainSource.match(/function normalizeProfile\([\s\S]*?\n}\n\nfunction loadSettings/)[0];
  const listAgents = mainSource.match(/function listAgents\([\s\S]*?\n}\n\nfunction fallbackAgentId/)[0];
  const ensureWorkspace = mainSource.match(/function ensureWorkspace\([\s\S]*?\n}\n\nfunction ensureAllWorkspaces/)[0];
  const resourceLoader = mainSource.match(/async function createResourceLoader\([\s\S]*?\n}\n\nfunction selectedModelFor/)[0];
  const updateAgent = mainSource.match(/ipcMain\.handle\("pi:update-agent"[\s\S]*?ipcMain\.handle\("pi:archive-agent"/)[0];

  assert.doesNotMatch(normalizeProfile, /readInstructions|AGENTS\.md/);
  assert.doesNotMatch(listAgents, /readInstructions|AGENTS\.md/);
  assert.doesNotMatch(ensureWorkspace, /AGENTS\.md|writeFileSync/);
  assert.match(mainSource, /instructions\.slice\(0, 20000\)/);
  assert.match(resourceLoader, /noContextFiles: true/);
  assert.match(resourceLoader, /appendSystemPromptOverride: \(base\) => profile\.instructions \? \[\.\.\.base, profile\.instructions\] : base/);
  assert.doesNotMatch(resourceLoader, /AGENTS\.md|agentsFilesOverride|readInstructions/);
  assert.doesNotMatch(updateAgent, /AGENTS\.md|writeFileSync/);
  assert.match(updateAgent, /session\?\.isStreaming && value\.id === activeAgentId/);
  assert.match(updateAgent, /refreshAgentRuntime\(\{/);
  assert.match(mainSource, /detail: "Skills stay disabled until you trust this folder\."/);
});

test("active agent runtime refresh preserves a historical workspace override", async () => {
  const calls = [];
  const result = await refreshAgentRuntime({
    agentId: "assistant",
    currentWorkspace: "/app/assistant",
    activeRuntime: { agentId: "assistant", workspace: "/history/assistant" },
    closeAgentSessions: async (agentId) => calls.push(["close", agentId]),
    createSession: async (options) => {
      calls.push(["create", options]);
      return "recreated";
    },
    bootstrap: () => {
      calls.push(["bootstrap"]);
      return "bootstrapped";
    },
  });

  assert.equal(result, "recreated");
  assert.deepEqual(calls, [
    ["close", "assistant"],
    ["create", { agentId: "assistant", workspaceOverride: "/history/assistant" }],
  ]);
});

test("active agent runtime refresh omits an unchanged workspace override", async () => {
  const calls = [];
  await refreshAgentRuntime({
    agentId: "assistant",
    currentWorkspace: "/app/assistant",
    activeRuntime: { agentId: "assistant", workspace: "/app/assistant" },
    closeAgentSessions: async (agentId) => calls.push(["close", agentId]),
    createSession: async (options) => {
      calls.push(["create", options]);
      return "recreated";
    },
    bootstrap: () => {
      calls.push(["bootstrap"]);
      return "bootstrapped";
    },
  });

  assert.deepEqual(calls, [
    ["close", "assistant"],
    ["create", { agentId: "assistant" }],
  ]);
});

test("inactive agent runtime refresh closes stale runtimes and bootstraps", async () => {
  const calls = [];
  const result = await refreshAgentRuntime({
    agentId: "inactive",
    currentWorkspace: "/app/inactive",
    activeRuntime: { agentId: "assistant", workspace: "/app/assistant" },
    closeAgentSessions: async (agentId) => calls.push(["close", agentId]),
    createSession: async (options) => {
      calls.push(["create", options]);
      return "unexpected-session";
    },
    bootstrap: () => {
      calls.push(["bootstrap"]);
      return "bootstrapped";
    },
  });

  assert.equal(result, "bootstrapped");
  assert.deepEqual(calls, [
    ["close", "inactive"],
    ["bootstrap"],
  ]);
});

test("app workspace migration removes only app-owned instruction files", () => withTempDir((directory) => {
  const appWorkspace = path.join(directory, "app-owned-workspace");
  const externalWorkspace = path.join(directory, "external-workspace");
  mkdirSync(appWorkspace, { recursive: true });
  mkdirSync(externalWorkspace, { recursive: true });
  const appInstructions = path.join(appWorkspace, "AGENTS.md");
  const externalInstructions = path.join(externalWorkspace, "AGENTS.md");
  writeFileSync(appInstructions, "Pi Bot generated instructions");
  writeFileSync(externalInstructions, "User-owned instructions");

  migrateAppOwnedWorkspaces({
    app: { id: "app", workspace: appWorkspace, workspaceKind: "app" },
    external: { id: "external", workspace: externalWorkspace, workspaceKind: "external" },
  });

  assert.equal(existsSync(appInstructions), false);
  assert.equal(existsSync(externalInstructions), true);
}));

test("resource loader injects profile instructions and still loads trusted workspace skills", async () => withTempDir(async (directory) => {
  const workspace = path.join(directory, "workspace");
  const runtimeDir = path.join(directory, "runtime");
  const skillsDir = path.join(workspace, ".agents", "skills");
  mkdirSync(path.join(skillsDir, "test-skill"), { recursive: true });
  writeFileSync(path.join(workspace, "AGENTS.md"), "workspace file must not be loaded");
  writeFileSync(path.join(skillsDir, "test-skill", "SKILL.md"), "---\nname: test-skill\ndescription: A trusted test skill\n---\nUse this skill.");

  const instructions = "Follow the saved agent instructions.";
  const skillResult = loadSkillsFromDir({ dir: skillsDir, source: "agent-workspace" });
  const loader = new DefaultResourceLoader({
    cwd: workspace,
    agentDir: runtimeDir,
    settingsManager: SettingsManager.inMemory(),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "base system prompt",
    appendSystemPromptOverride: (base) => [...base, instructions],
    skillsOverride: () => skillResult,
  });

  await loader.reload();

  assert.deepEqual(loader.getAgentsFiles().agentsFiles, []);
  assert.deepEqual(loader.getAppendSystemPrompt(), [instructions]);
  assert.deepEqual(loader.getSkills().skills.map((skill) => skill.name), ["test-skill"]);
  assert.equal(existsSync(path.join(workspace, "AGENTS.md")), true);
}));

test("saved agent instructions survive an app database reload", () => withTempDir((directory) => {
  const databasePath = path.join(directory, "pi-bot.sqlite");
  const profile = {
    id: "assistant",
    name: "Assistant",
    initials: "AS",
    description: "",
    instructions: "Persist this exact instruction.",
    workspace: path.join(directory, "workspace"),
    workspaceKind: "app",
    workspaceTrusted: true,
    defaultModelKey: "",
    thinkingLevel: "medium",
    archived: false,
    pinned: false,
  };
  const database = createAppDatabase(databasePath);
  database.saveState({
    setupComplete: true,
    executionRiskAccepted: true,
    activeAgentId: profile.id,
    thinkingLevel: profile.thinkingLevel,
    currentSessions: {},
    agents: [profile],
  });
  database.close();

  const restarted = createAppDatabase(databasePath);
  assert.equal(restarted.getState().agents[0].instructions, profile.instructions);
  restarted.close();
}));
