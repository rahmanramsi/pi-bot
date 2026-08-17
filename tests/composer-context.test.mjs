import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createAgentSession,
  createExtensionRuntime,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  fauxAssistantMessage,
  fauxProvider,
  InMemoryCredentialStore,
} from "../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/index.js";
import {
  COMPOSER_CONTEXT_END,
  COMPOSER_CONTEXT_START,
  buildPromptContext,
  resolveWorkspaceMention,
  trustedSkillOptions,
} from "../electron/composer-context.mjs";
import {
  invokePrompt,
  invokePromptAndMarkSent,
  normalizeComposerSessionId,
  resolveOwnedComposerSession,
  validateComposerSessionToken,
} from "../electron/composer-session.mjs";

test("plain prompts remain byte-for-byte unchanged when no explicit context is selected", () => {
  const prompt = "  keep this text exactly  \n";
  const result = buildPromptContext(prompt, {});
  assert.equal(result.hasContext, false);
  assert.equal(result.text, prompt);
  assert.deepEqual(result.images, []);
});

test("prompt context is deterministic, delimited, and includes selected text and skill instructions", () => {
  const result = buildPromptContext("Review this", {
    workspace: [{ kind: "file", path: "src/App.tsx" }],
    skills: [{ kind: "skill", id: "reviewer" }],
    attachments: [{ id: "att-1", name: "notes.txt", mimeType: "text/plain", kind: "text", size: 5, cleanupToken: "secret-cleanup-token", data: "hello" }],
  });
  assert.equal(result.text, buildPromptContext("Review this", {
    workspace: [{ kind: "file", path: "src/App.tsx" }],
    skills: [{ kind: "skill", id: "reviewer" }],
    attachments: [{ id: "att-1", name: "notes.txt", mimeType: "text/plain", kind: "text", size: 5, cleanupToken: "secret-cleanup-token", data: "hello" }],
  }).text);
  assert.match(result.text, new RegExp(COMPOSER_CONTEXT_START));
  assert.match(result.text, new RegExp(COMPOSER_CONTEXT_END));
  assert.match(result.text, /src\/App\.tsx/);
  assert.match(result.text, /Use the available skill "reviewer" for this request\./);
  assert.match(result.text, /hello/);
  assert.doesNotMatch(result.text, /secret-cleanup-token/);
  assert.doesNotMatch(JSON.stringify(result.audit), /secret-cleanup-token/);
  assert.deepEqual(result.audit.workspace, [{ kind: "file", path: "src/App.tsx" }]);
});

test("image context is passed as runtime image content while text stays metadata-only", () => {
  const result = buildPromptContext("Look", {
    attachments: [{ id: "image-1", name: "screen.png", mimeType: "image/png", kind: "image", size: 4, cleanupToken: "image-secret", data: "aGVsbG8=" }],
  });
  assert.deepEqual(result.images, [{ type: "image", mimeType: "image/png", data: "aGVsbG8=" }]);
  assert.match(result.text, /screen\.png/);
  assert.doesNotMatch(result.text, /aGVsbG8=/);
  assert.doesNotMatch(result.text, /image-secret/);
});

test("workspace mentions must match the bounded listing and resolved entry kind", () => {
  const listed = [{ path: "src/App.tsx", kind: "file" }, { path: "docs", kind: "folder" }];
  assert.deepEqual(resolveWorkspaceMention({ path: "src/App.tsx", type: "file" }, listed, () => ({ kind: "file" })), { path: "src/App.tsx", kind: "file" });
  assert.throws(() => resolveWorkspaceMention({ path: "../outside.txt", type: "file" }, listed, () => ({ kind: "file" })), /Invalid workspace mention/);
  assert.throws(() => resolveWorkspaceMention({ path: "C:\\outside.txt", type: "file" }, listed, () => ({ kind: "file" })), /Invalid workspace mention/);
  assert.throws(() => resolveWorkspaceMention({ path: "src/App.tsx", type: "symlink" }, listed, () => ({ kind: "file" })), /Invalid workspace mention/);
  assert.throws(() => resolveWorkspaceMention({ path: "src/App.tsx", type: "file" }, listed, () => null), /outside the workspace/);
  assert.throws(() => resolveWorkspaceMention({ path: "docs", type: "file" }, listed, () => ({ kind: "file" })), /no longer available/);
});

test("untrusted workspaces expose no skills and trusted options use loader names", () => {
  const loaded = [{ name: "z-last", description: "Z" }, { name: "a-first", description: "A" }];
  assert.deepEqual(trustedSkillOptions(false, loaded), []);
  assert.deepEqual(trustedSkillOptions(true, loaded), [
    { id: "a-first", name: "a-first", description: "A" },
    { id: "z-last", name: "z-last", description: "Z" },
  ]);
});

test("pre-session tokens normalize to an absent session and real tokens stay session-stable", () => {
  assert.equal(normalizeComposerSessionId("new"), undefined);
  assert.doesNotThrow(() => validateComposerSessionToken("new", "session-1"));
  assert.doesNotThrow(() => validateComposerSessionToken("session-1", "session-1"));
  assert.throws(() => validateComposerSessionToken("session-2", "session-1"), /conversation changed/);
});

test("explicit attachment removal can target a prior session after navigation", () => {
  const sessions = new Map([
    ["session-a", { agent_id: "assistant", workspace: "/workspace" }],
    ["session-b", { agent_id: "assistant", workspace: "/workspace" }],
  ]);
  assert.equal(resolveOwnedComposerSession("session-a", (id) => sessions.get(id), { agentId: "assistant", workspace: "/workspace" }), "session-a");
  assert.throws(() => resolveOwnedComposerSession("session-a", (id) => sessions.get(id), { agentId: "other", workspace: "/workspace" }), /conversation changed/);
});

test("runtime image invocation uses the installed prompt options shape", async () => {
  const calls = [];
  const promptSession = { prompt: async (...args) => calls.push(args) };
  const images = [{ type: "image", data: "aGVsbG8=", mimeType: "image/png" }];
  await invokePrompt(promptSession, "Look", images);
  await invokePrompt(promptSession, "Plain", []);
  assert.deepEqual(calls, [
    ["Look", { images }],
    ["Plain"],
  ]);
});

test("installed AgentSession forwards runtime image content to a deterministic faux provider", async () => {
  // This crosses the installed createAgentSession -> AgentSession.prompt -> ModelRuntime path;
  // the registered faux provider is deterministic and never performs network I/O.
  const workspace = mkdtempSync(path.join(tmpdir(), "pi-bot-sdk-image-test-"));
  const faux = fauxProvider({
    api: "issue28-faux-api",
    provider: "issue28-faux",
    models: [{ id: "issue28-image-model", input: ["text", "image"] }],
  });
  const image = { type: "image", data: "aGVsbG8=", mimeType: "image/png" };
  let receivedContext;
  faux.setResponses([ (context) => {
    receivedContext = context;
    return fauxAssistantMessage("ok");
  }]);
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  modelRuntime.registerNativeProvider(faux.provider);
  await modelRuntime.refresh({ allowNetwork: false });
  const resourceLoader = {
    getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => "You are a test assistant.",
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => {},
    reload: async () => {},
  };
  const { session } = await createAgentSession({
    cwd: workspace,
    agentDir: workspace,
    modelRuntime,
    model: faux.models[0],
    thinkingLevel: "off",
    noTools: "all",
    resourceLoader,
    sessionManager: SessionManager.inMemory(workspace),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
  });
  try {
    await session.prompt("Look", { images: [image] });
  } finally {
    session.dispose();
    rmSync(workspace, { recursive: true, force: true });
  }
  assert.equal(faux.state.callCount, 1);
  assert.deepEqual(receivedContext?.messages.at(-1)?.content, [
    { type: "text", text: "Look" },
    image,
  ]);
});

test("attachment sent marking waits for a successful prompt and supports retry", async () => {
  let marked = 0;
  const failingSession = { prompt: async () => { throw new Error("provider unavailable"); } };
  await assert.rejects(invokePromptAndMarkSent(failingSession, "Retry", [], () => { marked += 1; }), /provider unavailable/);
  assert.equal(marked, 0);

  const succeedingSession = { prompt: async () => undefined };
  await invokePromptAndMarkSent(succeedingSession, "Retry", [], () => { marked += 1; });
  assert.equal(marked, 1);
});
