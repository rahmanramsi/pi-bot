import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  createAppDatabase,
  sessionPathForId,
} from "../electron/app-database.mjs";
import {
  ATTENTION_TOOL_NAMES,
  createAttentionTools,
  mapExplicitAttentionEvent,
  mapFailedAttentionEvent,
} from "../electron/attention.mjs";

function withTempDir(run) {
  const directory = mkdtempSync(path.join(tmpdir(), "pi-bot-attention-test-"));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

async function withAsyncTempDir(run) {
  const directory = mkdtempSync(path.join(tmpdir(), "pi-bot-attention-test-"));
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

function sessionEntries(id, cwd) {
  return [
    { type: "session", version: 3, id, timestamp: "2026-08-15T00:00:00.000Z", cwd },
    {
      type: "message",
      id: `${id}-user`,
      parentId: null,
      timestamp: "2026-08-15T00:00:01.000Z",
      message: { role: "user", content: [{ type: "text", text: "Need help" }] },
    },
  ];
}

function seededDatabase(directory) {
  const workspace = path.join(directory, "workspace");
  mkdirSync(workspace, { recursive: true });
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  database.saveState({
    setupComplete: true,
    executionRiskAccepted: true,
    activeAgentId: "assistant",
    thinkingLevel: "medium",
    agents: [profile("assistant", workspace)],
    currentSessions: {},
  });
  database.saveSession({ id: "attention-session", agentId: "assistant", workspace, entries: sessionEntries("attention-session", workspace) });
  return database;
}

test("maps only explicit actionable runtime events and preserves failure details", () => {
  const context = { agentId: "assistant", sessionId: "attention-session" };
  assert.equal(mapExplicitAttentionEvent(context, { type: "message", message: "Please answer this" }), null);
  assert.equal(mapExplicitAttentionEvent(context, { type: "agent_settled" }), null);

  const question = mapExplicitAttentionEvent(context, {
    type: "question",
    summary: "Which environment should I use?",
    details: "The deployment target is not configured.",
    sourceEventId: "question-1",
  });
  assert.equal(question?.type, "question");
  assert.equal(question?.sourceEventId, "question-1");

  const failure = mapFailedAttentionEvent(context, {
    role: "assistant",
    stopReason: "error",
    errorMessage: "The provider timed out.",
  });
  assert.equal(failure?.type, "failed");
  assert.equal(failure?.details, "The provider timed out.");
  assert.equal(mapFailedAttentionEvent(context, { stopReason: "aborted", errorMessage: "Stopped" }), null);
});

test("app-owned Pi custom tools create explicit question and blocked items", () => withAsyncTempDir(async (directory) => {
  const database = seededDatabase(directory);
  const context = { agentId: "assistant", sessionId: "attention-session" };
  const tools = createAttentionTools({
    onAttention: (event) => database.createAttentionItem({
      ...mapExplicitAttentionEvent(context, event),
      originRunId: "run-tools",
    }),
  });
  assert.deepEqual(tools.map((tool) => tool.name), ATTENTION_TOOL_NAMES);

  const questionTool = tools[0];
  const questionResult = await questionTool.execute("call-question-1", {
    question: "Which deployment target should I use?",
    details: "No target is configured.",
  });
  assert.equal(questionResult.terminate, true);
  assert.equal(database.listAttention().find((item) => item.type === "question")?.sourceEventId, "pi_ask_user:call-question-1");

  await questionTool.execute("call-question-1", { question: "A replay", details: "A replay" });
  assert.equal(database.listAttention().length, 1);

  const blockedTool = tools[1];
  const blockedResult = await blockedTool.execute("call-blocked-1", {
    reason: "The deployment token is missing.",
    details: "Add the token before continuing.",
  });
  assert.equal(blockedResult.terminate, true);
  assert.equal(database.listAttention().length, 2);
  assert.equal(database.listAttention().find((item) => item.type === "blocked")?.originRunId, "run-tools");
  database.close();
}));

test("registers the attention tools in the supported Pi runtime", () => withAsyncTempDir(async (directory) => {
  const database = seededDatabase(directory);
  const workspace = path.join(directory, "workspace");
  const loader = new DefaultResourceLoader({
    cwd: workspace,
    agentDir: path.join(directory, "runtime"),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    skillsOverride: () => ({ skills: [], diagnostics: [] }),
    agentsFilesOverride: () => ({ agentsFiles: [] }),
  });
  await loader.reload();
  const modelRuntime = await ModelRuntime.create({
    authPath: path.join(directory, "runtime", "auth.json"),
    modelsPath: path.join(directory, "runtime", "models.json"),
  });
  const tools = createAttentionTools({
    onAttention: (event) => database.createAttentionItem({
      ...mapExplicitAttentionEvent({ agentId: "assistant", sessionId: "attention-session" }, event),
      originRunId: "runtime-run",
    }),
  });
  const { session } = await createAgentSession({
    cwd: workspace,
    agentDir: path.join(directory, "runtime"),
    modelRuntime,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
    settingsManager: SettingsManager.inMemory(),
    tools: ATTENTION_TOOL_NAMES,
    customTools: tools,
  });
  try {
    assert.deepEqual(session.getActiveToolNames(), ATTENTION_TOOL_NAMES);
    const definition = session.getToolDefinition("pi_ask_user");
    assert.equal(typeof definition?.execute, "function");
    await definition.execute("runtime-question-1", { question: "Which target?" });
    assert.equal(database.listAttention()[0].type, "question");
    assert.equal(database.listAttention()[0].originRunId, "runtime-run");
  } finally {
    session.dispose();
    database.close();
  }
}));

test("deduplicates attention events and persists them across restart", () => withTempDir((directory) => {
  const database = seededDatabase(directory);
  const first = database.createAttentionItem({
    agentId: "assistant",
    sessionId: "attention-session",
    type: "blocked",
    summary: "A dependency is unavailable.",
    details: "Install the dependency and retry.",
    sourceEventId: "blocked-1",
  });
  const replay = database.createAttentionItem({
    agentId: "assistant",
    sessionId: sessionPathForId("attention-session"),
    type: "blocked",
    summary: "A different replay summary.",
    details: "A different replay detail.",
    sourceEventId: "blocked-1",
  });
  assert.equal(first.id, replay.id);
  assert.equal(database.listAttention().length, 1);
  assert.equal(database.attentionUnreadCount(), 1);
  database.close();

  const restarted = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  assert.equal(restarted.schemaVersion(), 7);
  assert.equal(restarted.listAttention()[0].id, first.id);
  assert.equal(restarted.attentionUnreadCount(), 1);
  restarted.close();
}));

test("marks, resolves, dismisses, and automatically resolves only retryable attention types", () => withTempDir((directory) => {
  const database = seededDatabase(directory);
  database.createAttentionItem({ agentId: "assistant", sessionId: "attention-session", type: "failed", summary: "Failed", sourceEventId: "failed-1", originRunId: "run-1" });
  database.createAttentionItem({ agentId: "assistant", sessionId: "attention-session", type: "blocked", summary: "Blocked", sourceEventId: "blocked-1", originRunId: "run-2" });
  database.createAttentionItem({ agentId: "assistant", sessionId: "attention-session", type: "question", summary: "Question", sourceEventId: "question-1", originRunId: "run-question" });
  assert.equal(database.attentionUnreadCount(), 3);

  database.markAttentionRead("missing");
  assert.equal(database.attentionUnreadCount(), 3);
  assert.equal(database.resolveAttentionForRun("attention-session", "unrelated-run"), 0);
  assert.equal(database.listAttention().find((item) => item.type === "failed")?.status, "open");
  database.resolveAttentionForRun("attention-session", "run-1");
  assert.equal(database.getAttentionItem("missing"), null);
  assert.equal(database.listAttention().find((item) => item.type === "failed")?.status, "resolved");
  assert.equal(database.listAttention().find((item) => item.type === "blocked")?.status, "open");
  assert.equal(database.listAttention().find((item) => item.type === "question")?.status, "open");
  assert.equal(database.attentionUnreadCount(), 2);
  database.resolveAttentionForRun("attention-session", "run-2");
  assert.equal(database.listAttention().find((item) => item.type === "blocked")?.status, "resolved");
  assert.equal(database.attentionUnreadCount(), 1);

  const question = database.listAttention().find((item) => item.type === "question");
  database.dismissAttention(question.id);
  assert.equal(database.listAttention().some((item) => item.type === "question"), false);
  assert.equal(database.listAttention({ includeDismissed: true }).find((item) => item.type === "question")?.status, "dismissed");
  database.close();
}));

test("deleting a session or agent removes linked attention records", () => withTempDir((directory) => {
  const database = seededDatabase(directory);
  database.createAttentionItem({ agentId: "assistant", sessionId: "attention-session", type: "failed", summary: "Failed", sourceEventId: "failure-session" });
  assert.equal(database.deleteSession(sessionPathForId("attention-session")), true);
  assert.deepEqual(database.listAttention({ includeDismissed: true }), []);
  database.saveSession({ id: "attention-session-2", agentId: "assistant", workspace: path.join(directory, "workspace"), entries: sessionEntries("attention-session-2", path.join(directory, "workspace")) });
  database.createAttentionItem({ agentId: "assistant", sessionId: "attention-session-2", type: "blocked", summary: "Blocked", sourceEventId: "blocked-agent" });
  assert.equal(database.deleteAgent("assistant"), true);
  assert.deepEqual(database.listAttention({ includeDismissed: true }), []);
  database.close();
}));
