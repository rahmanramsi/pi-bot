import { app, BrowserWindow, dialog, ipcMain, session as electronSession, shell } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  loadSkillsFromDir,
  ModelRuntime,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  createAppDatabase,
  DATABASE_FILENAME,
  migrateLegacyStorage,
} from "./app-database.mjs";
import {
  createDatabaseSession,
  createDatabaseSessionManager,
} from "./session-database-adapter.mjs";
import { reasoningId, thinkingText } from "./reasoning.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const codingTools = ["read", "bash", "edit", "write", "grep", "find", "ls"];
const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const browserPartitionPrefix = "persist:pi-bot-browser-";
const configuredBrowserPartitions = new Set();
const maxWorkspaceFiles = 500;
const defaultAgentId = "assistant";
const developmentServerUrl = process.env.PI_BOT_DEV_SERVER_URL;
const developmentUserDataDir = process.env.PI_BOT_USER_DATA_DIR;

if (!app.isPackaged) {
  if (!developmentServerUrl || !developmentUserDataDir) {
    throw new Error("Run Pi Bot development through npm run dev.");
  }
  app.setPath("userData", developmentUserDataDir);
}

let window;
let agentProfiles = {};
let activeAgentId = defaultAgentId;
let setupComplete = false;
let executionRiskAccepted = false;
let currentSessions = {};
let sessionRecords = {};
let preferredThinkingLevel = "medium";
let session;
let sessionManager;
let unsubscribe;
let activeRuntimeKey;
let sessionOperation = Promise.resolve();
const sessionRuntimes = new Map();
let modelRuntime;
let availableModels = [];
let storedCredentials = {};
let appDatabase;
const pendingAuthPrompts = new Map();
let smokeTest;

ipcMain.on("pi:renderer-stage", (event, stage) => {
  if (!smokeTest || event.sender.id !== smokeTest.webContentsId || typeof stage !== "string") return;
  smokeTest.completed = stage === "setup-ready";
  writeFileSync(smokeTest.resultFile, JSON.stringify({ stage, errors: smokeTest.errors, requests: smokeTest.requests }, null, 2));
  if (smokeTest.completed) setTimeout(() => app.quit(), 100);
});

function userDataPath(...parts) {
  return path.join(app.getPath("userData"), ...parts);
}

function legacySettingsFile() {
  return userDataPath("settings.json");
}

function credentialsFile() {
  return userDataPath("credentials.json");
}

function defaultWorkspace(agentId) {
  return userDataPath("agents", agentId);
}

function isolatedRuntimeDir(agentId) {
  return userDataPath("runtime", agentId);
}

function isAgentId(value) {
  return typeof value === "string" && Boolean(agentProfiles[value]);
}

function cleanText(value, fallback, maxLength = 4000) {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, maxLength);
}

function isAllowedBrowserUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isPiBotBrowserPartition(value) {
  return typeof value === "string" && value.startsWith(browserPartitionPrefix);
}

function configureBrowserSession(partition) {
  if (configuredBrowserPartitions.has(partition)) return;
  configuredBrowserPartitions.add(partition);
  const browserSession = electronSession.fromPartition(partition);
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  browserSession.setPermissionCheckHandler(() => false);
  browserSession.on("will-download", (event) => event.preventDefault());
}

function isInsideWorkspace(workspace, target) {
  const relative = path.relative(workspace, target);
  return Boolean(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function activeWorkspaceRoot() {
  const workspace = activeProfile()?.workspace;
  if (!workspace) throw new Error("Select an agent workspace first.");
  return realpathSync(workspace);
}

function resolveWorkspaceFile(relativePath) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.length > 1200) throw new Error("Invalid file path.");
  const workspace = activeWorkspaceRoot();
  const target = realpathSync(path.resolve(workspace, relativePath));
  if (!isInsideWorkspace(workspace, target)) throw new Error("That file is outside the active workspace.");
  return target;
}

function listWorkspaceFiles() {
  const workspace = activeWorkspaceRoot();
  const items = [];
  const skippedNames = new Set([".git", "node_modules", "dist", "build", "release", "coverage", ".next", ".venv"]);
  const visit = (directory, depth) => {
    if (items.length >= maxWorkspaceFiles || depth > 4) return;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (items.length >= maxWorkspaceFiles || skippedNames.has(entry.name) || entry.isSymbolicLink()) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        items.push({ path: path.relative(workspace, absolutePath), kind: "folder" });
        visit(absolutePath, depth + 1);
      } else if (entry.isFile()) {
        items.push({ path: path.relative(workspace, absolutePath), kind: "file" });
      }
    }
  };
  visit(workspace, 0);
  return items;
}

function initialsFor(name) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return initials || "AS";
}

function defaultAgentProfile() {
  return {
    id: defaultAgentId,
    name: "Assistant",
    initials: "AS",
    instructions: "",
    workspace: defaultWorkspace(defaultAgentId),
    workspaceKind: "app",
    workspaceTrusted: true,
    defaultModelKey: "",
    thinkingLevel: preferredThinkingLevel,
    archived: false,
  };
}

function readInstructions(workspace) {
  const file = path.join(workspace, "AGENTS.md");
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function normalizeProfile(id, value = {}, fallback = {}) {
  const name = cleanText(value.name, fallback.name || "Untitled agent", 80) || "Untitled agent";
  const workspace = cleanText(value.workspace, fallback.workspace || defaultWorkspace(id), 2000) || defaultWorkspace(id);
  const workspaceKind = value.workspaceKind === "external" || fallback.workspaceKind === "external" ? "external" : "app";
  return {
    id,
    name,
    initials: (cleanText(value.initials, fallback.initials || initialsFor(name), 4) || initialsFor(name)).toUpperCase(),
    instructions: typeof value.instructions === "string" ? value.instructions.slice(0, 20000) : readInstructions(workspace),
    workspace,
    workspaceKind,
    workspaceTrusted: workspaceKind === "app" || value.workspaceTrusted === true || fallback.workspaceTrusted === true,
    defaultModelKey: cleanText(value.defaultModelKey ?? value.modelKey, fallback.defaultModelKey || "", 240),
    thinkingLevel: thinkingLevels.includes(value.thinkingLevel) ? value.thinkingLevel : fallback.thinkingLevel || preferredThinkingLevel,
    archived: Boolean(value.archived),
  };
}

function loadSettings() {
  agentProfiles = { [defaultAgentId]: defaultAgentProfile() };
  activeAgentId = defaultAgentId;
  setupComplete = false;
  executionRiskAccepted = false;
  currentSessions = {};
  sessionRecords = {};
  const saved = appDatabase.getState();
  const next = {};
  for (const value of saved.agents) {
    if (!value || typeof value.id !== "string" || !value.id) continue;
    next[value.id] = normalizeProfile(value.id, value, value.id === defaultAgentId ? defaultAgentProfile() : {});
  }
  if (Object.keys(next).length > 0) agentProfiles = next;
  if (typeof saved.activeAgentId === "string" && isAgentId(saved.activeAgentId)) activeAgentId = saved.activeAgentId;
  else if (!isAgentId(activeAgentId)) activeAgentId = Object.keys(agentProfiles)[0] ?? null;
  setupComplete = saved.setupComplete;
  executionRiskAccepted = saved.executionRiskAccepted;
  if (thinkingLevels.includes(saved.thinkingLevel)) preferredThinkingLevel = saved.thinkingLevel;
  currentSessions = saved.currentSessions;
  for (const info of appDatabase.listSessions()) {
    sessionRecords[info.path] = { agentId: info.agentId, workspace: info.workspace };
  }
}

function saveSettings() {
  try {
    appDatabase.saveState({
      setupComplete,
      executionRiskAccepted,
      activeAgentId,
      thinkingLevel: preferredThinkingLevel,
      currentSessions,
      agents: Object.values(agentProfiles),
    });
  } catch (error) {
    console.warn("Could not save Pi Bot settings:", error);
  }
}

function loadCredentials() {
  storedCredentials = {};
  try {
    const parsed = JSON.parse(readFileSync(credentialsFile(), "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) storedCredentials = parsed;
  } catch {
    // No credentials is the normal first-run state.
  }
}

function saveCredentials() {
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(credentialsFile(), JSON.stringify(storedCredentials), { mode: 0o600 });
}

const credentialStore = {
  async read(providerId) {
    return storedCredentials[providerId];
  },
  async list() {
    return Object.entries(storedCredentials).map(([providerId, credential]) => ({
      providerId,
      type: credential?.type === "oauth" ? "oauth" : "api_key",
    }));
  },
  async modify(providerId, fn) {
    const next = await fn(storedCredentials[providerId]);
    if (next !== undefined) {
      storedCredentials[providerId] = next;
      saveCredentials();
    }
    return storedCredentials[providerId];
  },
  async delete(providerId) {
    delete storedCredentials[providerId];
    saveCredentials();
  },
};

function send(payload) {
  window?.webContents.send("pi:event", payload);
}

function stringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function messageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => part?.type === "text" ? part.text : "").filter(Boolean).join("\n");
}

function displayTime(timestamp) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function modelKey(model) {
  return model ? `${model.provider}/${model.id}` : "";
}

function modelOption(model) {
  return {
    key: modelKey(model),
    id: model.id,
    name: model.name ?? model.id,
    provider: model.provider,
    reasoning: Boolean(model.reasoning),
    contextWindow: model.contextWindow ?? 0,
  };
}

function titleFromPrompt(prompt) {
  const compact = prompt.replace(/\s+/g, " ").trim();
  if (!compact) return "New conversation";
  return compact.length > 58 ? `${compact.slice(0, 55)}…` : compact;
}

function listAgents({ includeArchived = true } = {}) {
  return Object.values(agentProfiles)
    .filter((agent) => includeArchived || !agent.archived)
    .map((agent) => ({ ...agent, instructions: readInstructions(agent.workspace) }))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
}

function fallbackAgentId(excludedId) {
  return listAgents({ includeArchived: false }).find((agent) => agent.id !== excludedId)?.id ?? null;
}

function uniqueAgentId(seed) {
  const base = cleanText(seed, "agent", 48)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "agent";
  let id = base;
  let suffix = 2;
  while (agentProfiles[id]) id = `${base}-${suffix++}`;
  return id;
}

function ensureWorkspace(profile) {
  mkdirSync(profile.workspace, { recursive: true });
  const agentsFile = path.join(profile.workspace, "AGENTS.md");
  if (!existsSync(agentsFile)) writeFileSync(agentsFile, "");
  mkdirSync(path.join(profile.workspace, ".agents", "skills"), { recursive: true });
}

function ensureAllWorkspaces() {
  for (const profile of Object.values(agentProfiles)) {
    try {
      ensureWorkspace(profile);
    } catch (error) {
      console.warn(`Could not prepare workspace for ${profile.name}:`, error);
    }
  }
}

function activeProfile() {
  return isAgentId(activeAgentId) ? agentProfiles[activeAgentId] : undefined;
}

function transcriptFromManager(manager, profile = activeProfile()) {
  if (!manager) return [];
  const items = [];
  const toolRows = new Map();
  for (const entry of manager.buildContextEntries()) {
    if (entry.type !== "message") continue;
    const message = entry.message;
    const timestamp = displayTime(message.timestamp);
    const timestampMs = new Date(entry.timestamp).getTime();
    if (message.role === "user") {
      items.push({ id: entry.id, kind: "user", label: "You", body: messageText(message.content), timestamp, timestampMs });
      continue;
    }
    if (message.role === "assistant") {
      const reasoning = thinkingText(message.content);
      if (reasoning) {
        items.push({
          id: `reasoning-${entry.id}`,
          kind: "reasoning",
          label: "Reasoning",
          body: reasoning,
          timestamp,
          timestampMs,
          status: "done",
        });
      }
      const body = messageText(message.content);
      if (body || message.errorMessage) {
        items.push({
          id: entry.id,
          kind: "assistant",
          label: profile?.name ?? "Assistant",
          body: body || message.errorMessage,
          timestamp,
          timestampMs,
          status: message.errorMessage ? "failed" : "done",
        });
      }
      for (const part of message.content ?? []) {
        if (part?.type !== "toolCall") continue;
        const input = stringify(part.arguments);
        const tool = { id: part.id, kind: "tool", label: `Tool · ${part.name}`, body: input, input, timestamp, timestampMs, status: "done" };
        items.push(tool);
        toolRows.set(part.id, tool);
      }
      continue;
    }
    if (message.role === "toolResult") {
      const tool = toolRows.get(message.toolCallId);
      const body = messageText(message.content);
      if (tool) {
        tool.body = body || tool.body;
        tool.status = message.isError ? "failed" : "done";
      } else {
        items.push({
          id: message.toolCallId,
          kind: "tool",
          label: `Tool · ${message.toolName}`,
          body,
          timestamp,
          timestampMs,
          status: message.isError ? "failed" : "done",
        });
      }
    }
  }
  return items;
}

function sessionSummary(info, agentId, workspace) {
  const entries = appDatabase.getSessionEntries(info.path);
  const named = [...entries].reverse().find((entry) => entry.type === "session_info" && typeof entry.name === "string" && entry.name.trim());
  const firstUser = entries.find((entry) => entry.type === "message" && entry.message?.role === "user");
  return {
    path: info.path,
    id: info.id,
    agentId,
    workspace,
    name: named?.name || titleFromPrompt(firstUser ? messageText(firstUser.message.content) : "New conversation"),
    created: info.created,
    modified: info.modified,
    messageCount: info.messageCount,
  };
}

async function listSessions(agentId = activeAgentId) {
  const profile = isAgentId(agentId) ? agentProfiles[agentId] : undefined;
  if (!profile) return [];
  try {
    return appDatabase.listSessions(agentId, profile.workspace)
      .filter((info) => info.messageCount > 0)
      .map((info) => {
        sessionRecords[info.path] = { agentId, workspace: profile.workspace };
        return sessionSummary(info, agentId, profile.workspace);
      });
  } catch {
    return [];
  }
}

async function sessionsByAgent() {
  const result = {};
  for (const profile of listAgents({ includeArchived: false })) result[profile.id] = await listSessions(profile.id);
  return result;
}

function activeRuntime() {
  return activeRuntimeKey ? sessionRuntimes.get(activeRuntimeKey) : undefined;
}

function activateRuntime(runtime) {
  activeAgentId = runtime.agentId;
  activeRuntimeKey = runtime.key;
  session = runtime.session;
  sessionManager = runtime.sessionManager;
  unsubscribe = runtime.unsubscribe;
}

function clearActiveRuntime() {
  activeRuntimeKey = undefined;
  session = undefined;
  sessionManager = undefined;
  unsubscribe = undefined;
}

function transcriptForRuntime(runtime) {
  return runtime?.transcript ?? transcriptFromManager(runtime?.sessionManager, agentProfiles[runtime?.agentId]);
}

function currentSessionSummary(runtime = activeRuntime()) {
  const manager = runtime?.sessionManager ?? sessionManager;
  const currentSession = runtime?.session ?? session;
  if (!manager) return null;
  const entries = manager.getEntries();
  const firstUser = entries.find((entry) => entry.type === "message" && entry.message.role === "user");
  return {
    path: manager.getSessionFile(),
    id: manager.getSessionId(),
    name: currentSession?.sessionName || manager.getSessionName() || (firstUser ? titleFromPrompt(messageText(firstUser.message.content)) : "New conversation"),
  };
}

function currentSavedModel(manager = activeRuntime()?.sessionManager ?? sessionManager) {
  const saved = manager?.buildSessionContext().model;
  if (!saved) return undefined;
  return modelRuntime?.getModel(saved.provider, saved.modelId);
}

function currentConfig(runtime = activeRuntime()) {
  const profile = activeProfile();
  const currentSession = runtime?.session ?? session;
  const manager = runtime?.sessionManager ?? sessionManager;
  const currentModel = currentSession?.model ?? currentSavedModel(manager);
  const currentKey = modelKey(currentModel) || profile?.defaultModelKey || "";
  const available = availableModels.some((model) => modelKey(model) === currentKey);
  const contextUsage = currentSession?.getContextUsage?.();
  const contextWindow = contextUsage?.contextWindow ?? currentModel?.contextWindow ?? 0;
  return {
    agentId: activeAgentId,
    workspace: profile?.workspace ?? "",
    workspaceKind: profile?.workspaceKind ?? "",
    workspaceTrusted: profile?.workspaceTrusted ?? false,
    model: currentModel?.name ?? (currentKey ? "Model unavailable" : "No model selected"),
    modelKey: currentKey,
    defaultModelKey: profile?.defaultModelKey ?? "",
    modelAvailable: available,
    provider: currentModel?.provider ?? currentKey.split("/")[0] ?? "",
    thinkingLevel: currentSession?.thinkingLevel ?? profile?.thinkingLevel ?? preferredThinkingLevel,
    availableThinkingLevels: currentSession?.getAvailableThinkingLevels?.() ?? (currentModel?.reasoning ? thinkingLevels : ["off"]),
    streaming: Boolean(currentSession?.isStreaming),
    context: {
      tokens: contextUsage?.tokens ?? null,
      contextWindow,
      percent: contextUsage?.percent ?? null,
    },
    models: availableModels.map(modelOption),
    tools: codingTools,
    session: currentSessionSummary(runtime),
  };
}

function authProviders() {
  return (modelRuntime?.getProviders?.() ?? []).map((provider) => {
    const status = modelRuntime.getProviderAuthStatus(provider.id);
    const methods = [];
    if (provider.auth?.apiKey) methods.push("api_key");
    if (provider.auth?.oauth) methods.push("oauth");
    if (methods.length === 0 && status.configured) methods.push("api_key");
    return {
      id: provider.id,
      name: provider.name ?? provider.id,
      methods,
      configured: Boolean(status.configured),
      source: status.source,
      label: status.label,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function piAuthFile() {
  return path.join(getAgentDir(), "auth.json");
}

function importablePiCredentials() {
  try {
    const parsed = JSON.parse(readFileSync(piAuthFile(), "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function setupState() {
  return {
    required: !setupComplete || !executionRiskAccepted,
    canContinue: availableModels.length > 0,
    canImportPiAuth: !setupComplete && Object.keys(importablePiCredentials()).length > 0,
    piAuthPath: piAuthFile(),
    credentialStorage: "protected-app-file",
    providers: authProviders(),
  };
}

async function bootstrap() {
  const profile = activeProfile();
  const runtime = activeRuntime();
  return {
    config: currentConfig(runtime),
    transcript: runtime ? transcriptForRuntime(runtime) : transcriptFromManager(sessionManager, profile),
    sessions: await listSessions(activeAgentId),
    sessionsByAgent: await sessionsByAgent(),
    agents: listAgents(),
    setup: setupState(),
    authenticated: availableModels.length > 0,
    activeAgentId,
    profile,
  };
}

function updateRuntimeTranscript(runtime, event) {
  runtime.transcript ??= transcriptFromManager(runtime.sessionManager, agentProfiles[runtime.agentId]);
  const assistantMessageEvent = event.type === "message_update" ? event.assistantMessageEvent : undefined;
  if (assistantMessageEvent?.type === "thinking_start") {
    const id = reasoningId(event.message);
    const existing = runtime.transcript.find((item) => item.id === id);
    if (existing) {
      if (existing.body) existing.body = `${existing.body}\n\n`;
      existing.status = "running";
    } else {
      runtime.transcript.push({
        id,
        kind: "reasoning",
        label: "Reasoning",
        body: "",
        status: "running",
        timestamp: displayTime(event.message.timestamp),
        timestampMs: event.message.timestamp,
      });
    }
  }
  if (assistantMessageEvent?.type === "thinking_delta") {
    const item = runtime.transcript.find((entry) => entry.id === reasoningId(event.message));
    if (item) item.body = `${item.body}${assistantMessageEvent.delta}`;
  }
  if (event.type === "message_end" && event.message?.role === "assistant") {
    const id = reasoningId(event.message);
    const item = runtime.transcript.find((entry) => entry.id === id);
    if (item && item.body.trim()) item.status = "done";
    else if (item) runtime.transcript = runtime.transcript.filter((entry) => entry.id !== id);
  }
  if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
    const last = runtime.transcript.at(-1);
    if (last?.kind === "assistant" && last.status === "running") {
      last.body = `${last.body}${event.assistantMessageEvent.delta}`;
    } else {
      const timestampMs = Date.now();
      runtime.transcript.push({
        id: `assistant-${timestampMs}`,
        kind: "assistant",
        label: agentProfiles[runtime.agentId]?.name ?? "Assistant",
        body: event.assistantMessageEvent.delta,
        status: "running",
        timestamp: displayTime(timestampMs),
        timestampMs,
      });
    }
  }
  if (event.type === "tool_execution_start") {
    const timestampMs = Date.now();
    runtime.transcript.push({
      id: event.toolCallId,
      kind: "tool",
      label: `Tool · ${event.toolName}`,
      body: stringify(event.args),
      input: stringify(event.args),
      status: "running",
      timestamp: displayTime(timestampMs),
      timestampMs,
    });
  }
  if (event.type === "tool_execution_update") {
    const item = runtime.transcript.find((entry) => entry.id === event.toolCallId);
    if (item) item.body = stringify(event.partialResult);
  }
  if (event.type === "tool_execution_end") {
    const item = runtime.transcript.find((entry) => entry.id === event.toolCallId);
    if (item) {
      item.body = stringify(event.result);
      item.status = event.isError ? "failed" : "done";
    }
  }
  if (event.type === "agent_settled" || event.type === "aborted" || (event.type === "agent_end" && !event.willRetry)) {
    runtime.transcript = transcriptFromManager(runtime.sessionManager, agentProfiles[runtime.agentId]);
  }
}

async function sendSessionSync(runtime) {
  if (!runtime || runtime.key !== activeRuntimeKey) return;
  const key = runtime.key;
  const sessions = await listSessions(runtime.agentId);
  const grouped = await sessionsByAgent();
  if (activeRuntimeKey !== key) return;
  send({
    type: "session-sync",
    transcript: transcriptForRuntime(runtime),
    sessions,
    sessionsByAgent: grouped,
    config: currentConfig(runtime),
    agents: listAgents(),
    setup: setupState(),
    authenticated: availableModels.length > 0,
    activeAgentId: runtime.agentId,
  });
}

function relay(runtime, event) {
  updateRuntimeTranscript(runtime, event);
  updatePendingSession(runtime, event);
  if (runtime.key !== activeRuntimeKey) return;
  if (event.type === "message_update" && event.assistantMessageEvent?.type === "thinking_start") {
    send({ type: "reasoning-start", id: reasoningId(event.message) });
  }
  if (event.type === "message_update" && event.assistantMessageEvent?.type === "thinking_delta") {
    send({ type: "reasoning-delta", id: reasoningId(event.message), delta: event.assistantMessageEvent.delta });
  }
  if (event.type === "message_end" && event.message?.role === "assistant") {
    send({ type: "reasoning-end", id: reasoningId(event.message) });
  }
  if (event.type === "message_update" && event.assistantMessageEvent?.type === "text_delta") {
    send({ type: "assistant-delta", delta: event.assistantMessageEvent.delta });
  }
  if (event.type === "tool_execution_start") {
    send({ type: "tool-start", id: event.toolCallId, name: event.toolName, detail: stringify(event.args) });
  }
  if (event.type === "tool_execution_update") {
    send({ type: "tool-update", id: event.toolCallId, detail: stringify(event.partialResult) });
  }
  if (event.type === "tool_execution_end") {
    send({ type: "tool-end", id: event.toolCallId, failed: event.isError, detail: stringify(event.result) });
  }
  if (event.type === "turn_end" && event.message?.role === "assistant" && event.message.errorMessage) {
    if (event.message.stopReason === "aborted") send({ type: "aborted" });
    else send({ type: "error", message: event.message.errorMessage });
  }
  if (event.type === "agent_start") send({ type: "agent-start" });
  if (event.type === "agent_end") send({ type: "agent-end", retrying: event.willRetry });
  if (event.type === "agent_settled") send({ type: "agent-settled" });
}

function updatePendingSession(_runtime, _event) {
  // SQLite writes each SessionManager entry synchronously; no JSONL pending copy is needed.
}

async function refreshRuntime() {
  modelRuntime ??= await ModelRuntime.create({ credentials: credentialStore, refreshOnCreate: false });
  try {
    await modelRuntime.refresh({ allowNetwork: false });
  } catch {
    // Static models and stored credentials remain usable when a catalog refresh fails.
  }
  try {
    availableModels = [...await modelRuntime.getAvailable()];
  } catch {
    availableModels = [];
  }
  return modelRuntime;
}

async function closeCurrentSession() {
  const runtime = activeRuntime();
  if (!runtime) {
    clearActiveRuntime();
    return;
  }
  await disposeRuntime(runtime.key);
}

async function disposeRuntime(key) {
  const runtime = sessionRuntimes.get(key);
  if (!runtime) return;
  await runtime.session?.abort().catch(() => {});
  runtime.unsubscribe?.();
  runtime.session?.dispose();
  sessionRuntimes.delete(key);
  if (activeRuntimeKey === key) clearActiveRuntime();
}

async function closeAgentSessions(agentId) {
  const keys = [...sessionRuntimes.values()]
    .filter((runtime) => runtime.agentId === agentId)
    .map((runtime) => runtime.key);
  for (const key of keys) await disposeRuntime(key);
}

async function createResourceLoader(profile) {
  const skillResult = profile.workspaceTrusted
    ? loadSkillsFromDir({ dir: path.join(profile.workspace, ".agents", "skills"), source: "agent-workspace" })
    : { skills: [], diagnostics: [] };
  const agentsFile = path.join(profile.workspace, "AGENTS.md");
  const loader = new DefaultResourceLoader({
    cwd: profile.workspace,
    agentDir: isolatedRuntimeDir(profile.id),
    settingsManager: SettingsManager.inMemory(),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "You are a helpful coding teammate. Work directly in the selected agent workspace using the available tools. Be clear and concise.",
    skillsOverride: () => skillResult,
    agentsFilesOverride: () => ({
      agentsFiles: [{ path: agentsFile, content: readInstructions(profile.workspace) }],
    }),
  });
  await loader.reload();
  return loader;
}

function selectedModelFor(profile, manager, mode) {
  const saved = manager.buildSessionContext().model;
  if (saved) {
    const savedKey = `${saved.provider}/${saved.modelId}`;
    return availableModels.find((model) => modelKey(model) === savedKey);
  }
  if (profile.defaultModelKey) return availableModels.find((model) => modelKey(model) === profile.defaultModelKey);
  if (mode === "new" || mode === "continue") return availableModels[0];
  return undefined;
}

async function openSession({ mode = "continue", sessionPath, agentId = activeAgentId } = {}) {
  if (agentId !== null && !isAgentId(agentId)) throw new Error("Invalid agent.");
  if (!agentId) {
    await closeCurrentSession();
    activeAgentId = null;
    saveSettings();
    return bootstrap();
  }
  const profile = agentProfiles[agentId];
  if (profile.archived) throw new Error("That agent is archived. Restore it before selecting it.");
  ensureWorkspace(profile);
  await refreshRuntime();

  const mappedPath = currentSessions[agentId];
  const mapped = typeof mappedPath === "string" ? appDatabase.getSession(mappedPath) : null;
  const mappedPathExists = Boolean(mapped && mapped.agent_id === agentId && mapped.workspace === profile.workspace);
  const requestedPath = mode === "open" ? sessionPath : mode === "continue" && mappedPathExists ? mappedPath : undefined;
  const existingRuntime = requestedPath ? sessionRuntimes.get(requestedPath) : undefined;
  if (existingRuntime) {
    currentSessions[agentId] = requestedPath;
    activateRuntime(existingRuntime);
    saveSettings();
    return bootstrap();
  }
  let manager;
  if (requestedPath) {
    const stored = appDatabase.getSession(requestedPath);
    if (!stored || stored.agent_id !== agentId || stored.workspace !== profile.workspace) throw new Error("That conversation is not in this workspace.");
    manager = createDatabaseSessionManager({
      database: appDatabase,
      profile,
      sessionPath: stored.path,
      entries: appDatabase.getSessionEntries(stored.path),
    });
  } else {
    const recent = mode === "continue" ? appDatabase.listSessions(agentId, profile.workspace)[0] : undefined;
    manager = recent
      ? createDatabaseSessionManager({
        database: appDatabase,
        profile,
        sessionPath: recent.path,
        entries: appDatabase.getSessionEntries(recent.path),
      })
      : createDatabaseSession({ database: appDatabase, profile, agentId });
  }

  const sessionFile = manager.getSessionFile();
  if (sessionFile) {
    currentSessions[agentId] = sessionFile;
    sessionRecords[sessionFile] = { agentId, workspace: profile.workspace };
  }
  const selectedModel = selectedModelFor(profile, manager, mode);
  if (!selectedModel) {
    activeAgentId = agentId;
    clearActiveRuntime();
    sessionManager = manager;
    saveSettings();
    return bootstrap();
  }

  const resourceLoader = await createResourceLoader(profile);
  const result = await createAgentSession({
    cwd: profile.workspace,
    agentDir: isolatedRuntimeDir(profile.id),
    modelRuntime,
    model: selectedModel,
    thinkingLevel: profile.thinkingLevel,
    tools: codingTools,
    sessionManager: manager,
    settingsManager: SettingsManager.inMemory(),
    resourceLoader,
  });
  const runtime = {
    key: sessionFile ?? `${agentId}:${manager.getSessionId()}`,
    agentId,
    workspace: profile.workspace,
    session: result.session,
    sessionManager: manager,
    transcript: transcriptFromManager(manager, profile),
  };
  runtime.unsubscribe = runtime.session.subscribe((event) => relay(runtime, event));
  sessionRuntimes.set(runtime.key, runtime);
  activeAgentId = agentId;
  activateRuntime(runtime);
  if (!profile.defaultModelKey && runtime.session.model) {
    profile.defaultModelKey = modelKey(runtime.session.model);
  }
  saveSettings();
  return bootstrap();
}

function createSession(options = {}) {
  const operation = sessionOperation.then(() => openSession(options), () => openSession(options));
  sessionOperation = operation.catch(() => undefined);
  return operation;
}

async function finishSetup() {
  if (!executionRiskAccepted) throw new Error("Confirm the execution warning before continuing.");
  await refreshRuntime();
  if (availableModels.length === 0) throw new Error("Add a provider credential before continuing.");
  setupComplete = true;
  ensureAllWorkspaces();
  saveSettings();
  return createSession({ agentId: activeAgentId || defaultAgentId });
}

function acceptExecutionRisk(accepted) {
  if (executionRiskAccepted) return;
  if (accepted !== true) throw new Error("Confirm the execution warning before continuing.");
  executionRiskAccepted = true;
  saveSettings();
}

async function respondToAuthPrompt(promptId, value) {
  const pending = pendingAuthPrompts.get(promptId);
  if (!pending) return;
  pendingAuthPrompts.delete(promptId);
  pending.resolve(String(value ?? ""));
}

async function cancelAuthPrompt(promptId) {
  const pending = pendingAuthPrompts.get(promptId);
  if (!pending) return;
  pendingAuthPrompts.delete(promptId);
  pending.reject(new Error("Authentication was cancelled."));
}

function authInteraction() {
  return {
    prompt: (prompt) => new Promise((resolve, reject) => {
      const id = randomUUID();
      pendingAuthPrompts.set(id, { resolve, reject });
      send({ type: "auth-prompt", id, prompt });
    }),
    notify: (event) => {
      if (event.type === "auth_url") void shell.openExternal(event.url);
      send({ type: "auth-notify", event });
    },
  };
}

ipcMain.handle("pi:connect", async () => {
  await refreshRuntime();
  if (!setupComplete || !executionRiskAccepted) return bootstrap();
  return createSession({ agentId: activeAgentId });
});

ipcMain.handle("pi:select-agent", async (_event, agentId) => {
  if (!isAgentId(agentId) || agentProfiles[agentId].archived) throw new Error("That agent is not available.");
  return createSession({ agentId });
});

ipcMain.handle("pi:create-agent", async (_event, draft) => {
  if (!draft || typeof draft !== "object") throw new Error("Invalid agent profile.");
  const name = cleanText(draft.name, "", 80);
  if (!name) throw new Error("Give the agent a name first.");
  const id = uniqueAgentId(name);
  const assistant = agentProfiles[defaultAgentId];
  const profile = normalizeProfile(id, {
    name,
    initials: draft.initials,
    instructions: "",
    defaultModelKey: assistant?.defaultModelKey || "",
    workspace: defaultWorkspace(id),
    workspaceKind: "app",
    workspaceTrusted: true,
  });
  agentProfiles[id] = profile;
  ensureWorkspace(profile);
  activeAgentId = id;
  saveSettings();
  return setupComplete ? createSession({ agentId: id }) : bootstrap();
});

ipcMain.handle("pi:update-agent", async (_event, value) => {
  if (!value || typeof value !== "object" || !isAgentId(value.id)) throw new Error("Invalid agent profile.");
  if (session?.isStreaming && value.id === activeAgentId) throw new Error("Wait for the response to finish before changing this agent.");
  const current = agentProfiles[value.id];
  const next = normalizeProfile(value.id, {
    ...current,
    ...value,
    workspace: current.workspace,
    workspaceKind: current.workspaceKind,
    workspaceTrusted: current.workspaceTrusted,
  }, current);
  agentProfiles[value.id] = next;
  ensureWorkspace(next);
  writeFileSync(path.join(next.workspace, "AGENTS.md"), next.instructions ?? "");
  saveSettings();
  return bootstrap();
});

ipcMain.handle("pi:archive-agent", async (_event, agentId, archived) => {
  if (!isAgentId(agentId)) throw new Error("Invalid agent.");
  if (session?.isStreaming && agentId === activeAgentId) throw new Error("Wait for the response to finish first.");
  agentProfiles[agentId].archived = Boolean(archived);
  if (agentProfiles[agentId].archived && activeAgentId === agentId) {
    const fallback = fallbackAgentId(agentId);
    if (fallback) return createSession({ agentId: fallback });
    await closeCurrentSession();
    activeAgentId = null;
  }
  if (!agentProfiles[agentId].archived && !activeAgentId) return createSession({ agentId });
  saveSettings();
  return bootstrap();
});

ipcMain.handle("pi:delete-agent", async (_event, agentId, deleteWorkspace = false) => {
  if (!isAgentId(agentId)) throw new Error("Invalid agent.");
  if (session?.isStreaming && agentId === activeAgentId) throw new Error("Wait for the response to finish first.");
  const profile = agentProfiles[agentId];
  await closeAgentSessions(agentId);
  if (agentId === activeAgentId) clearActiveRuntime();
  for (const [file, record] of Object.entries(sessionRecords)) if (record?.agentId === agentId) delete sessionRecords[file];
  delete currentSessions[agentId];
  delete agentProfiles[agentId];
  appDatabase.deleteAgent(agentId);
  if (deleteWorkspace && profile.workspaceKind === "app" && profile.workspace === defaultWorkspace(agentId)) {
    try { rmSync(profile.workspace, { recursive: true, force: true }); } catch { /* Keep profile deletion successful. */ }
  }
  if (activeAgentId === agentId) activeAgentId = fallbackAgentId(agentId);
  saveSettings();
  return activeAgentId ? createSession({ agentId: activeAgentId }) : bootstrap();
});

ipcMain.handle("pi:choose-folder", async (_event, agentId = activeAgentId) => {
  if (!isAgentId(agentId)) throw new Error("Select an agent first.");
  if (session?.isStreaming) throw new Error("Wait for the response to finish before changing the workspace.");
  const profile = agentProfiles[agentId];
  const result = await dialog.showOpenDialog(window, {
    properties: ["openDirectory"],
    defaultPath: profile.workspace,
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const selectedWorkspace = result.filePaths[0];
  let trusted = false;
  const trust = await dialog.showMessageBox(window, {
    type: "question",
    buttons: ["Load workspace skills", "Use without skills"],
    defaultId: 0,
    cancelId: 1,
    title: "Trust workspace skills?",
    message: "Allow Pi Bot to load skills from this workspace's .agents/skills folder?",
    detail: "AGENTS.md is loaded from the workspace. Skills stay disabled until you trust this folder.",
  });
  trusted = trust.response === 0;
  profile.workspace = selectedWorkspace;
  profile.workspaceKind = "external";
  profile.workspaceTrusted = trusted;
  ensureWorkspace(profile);
  saveSettings();
  return createSession({ mode: "new", agentId });
});

ipcMain.handle("pi:trust-workspace", async (_event, agentId) => {
  if (!isAgentId(agentId)) throw new Error("Invalid agent.");
  if (session?.isStreaming && agentId === activeAgentId) throw new Error("Wait for the response to finish first.");
  agentProfiles[agentId].workspaceTrusted = true;
  saveSettings();
  return agentId === activeAgentId ? createSession({ agentId }) : bootstrap();
});

ipcMain.handle("pi:new-session", () => createSession({ mode: "new", agentId: activeAgentId }));

ipcMain.handle("pi:open-session", async (_event, sessionPath, agentId) => {
  if (typeof sessionPath !== "string" || !sessionPath) throw new Error("Invalid session path.");
  if (!isAgentId(agentId)) throw new Error("Invalid agent.");
  const sessions = await listSessions(agentId);
  if (!sessions.some((entry) => entry.path === sessionPath)) throw new Error("That conversation is not in this workspace.");
  return createSession({ mode: "open", sessionPath, agentId });
});

ipcMain.handle("pi:get-sessions", (_event, agentId = activeAgentId) => listSessions(agentId));

ipcMain.handle("pi:delete-session", async (_event, sessionPath) => {
  const sessions = await listSessions(activeAgentId);
  if (!sessions.some((entry) => entry.path === sessionPath)) throw new Error("That conversation is not available.");
  const wasCurrent = sessionManager?.getSessionFile() === sessionPath;
  const runtime = [...sessionRuntimes.values()].find((entry) => entry.sessionManager.getSessionFile() === sessionPath);
  if (runtime) await disposeRuntime(runtime.key);
  else if (wasCurrent) await closeCurrentSession();
  appDatabase.deleteSession(sessionPath);
  delete sessionRecords[sessionPath];
  if (currentSessions[activeAgentId] === sessionPath) delete currentSessions[activeAgentId];
  saveSettings();
  return wasCurrent ? createSession({ mode: "new" }) : bootstrap();
});

ipcMain.handle("pi:prompt", async (_event, message) => {
  if (typeof message !== "string" || !message.trim()) return;
  if (!activeRuntime()?.session) {
    if (!activeProfile() || !currentConfig().modelAvailable) throw new Error("Choose an available model in App Settings before sending a message.");
    await createSession({ mode: "new", agentId: activeAgentId });
  }
  const runtime = activeRuntime();
  const promptSession = runtime?.session;
  if (!runtime || !promptSession) throw new Error("Choose an available model in App Settings before sending a message.");
  if (promptSession.isStreaming) throw new Error("The agent is already responding. Stop the current response first.");
  const hasUserMessage = runtime.sessionManager.getEntries().some((entry) => entry.type === "message" && entry.message.role === "user");
  if (!hasUserMessage) runtime.sessionManager.appendSessionInfo(titleFromPrompt(message));
  runtime.transcript = transcriptFromManager(runtime.sessionManager, agentProfiles[runtime.agentId]);
  const timestampMs = Date.now();
  runtime.transcript.push({
    id: `user-${timestampMs}`,
    kind: "user",
    label: "You",
    body: message,
    timestamp: displayTime(timestampMs),
    timestampMs,
  });
  try {
    await promptSession.prompt(message);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (runtime.key === activeRuntimeKey && text !== "Request was aborted") send({ type: "error", message: text });
    throw error;
  } finally {
    runtime.transcript = transcriptFromManager(runtime.sessionManager, agentProfiles[runtime.agentId]);
    await sendSessionSync(runtime);
  }
});

ipcMain.handle("pi:abort", () => session?.abort());

ipcMain.handle("pi:set-agent-model", async (_event, agentId, key) => {
  if (!isAgentId(agentId) || typeof key !== "string") throw new Error("Invalid model selection.");
  if (!availableModels.some((model) => modelKey(model) === key)) throw new Error("That model is not available.");
  agentProfiles[agentId].defaultModelKey = key;
  saveSettings();
  return bootstrap();
});

ipcMain.handle("pi:set-session-model", async (_event, agentId, key) => {
  if (!isAgentId(agentId) || typeof key !== "string") throw new Error("Invalid model selection.");
  const selectedModel = availableModels.find((model) => modelKey(model) === key);
  if (!selectedModel) throw new Error("That model is not available.");
  if (agentId !== activeAgentId) throw new Error("Select this agent before changing its model.");
  if (session?.isStreaming) throw new Error("Stop the current response before changing the model.");
  if (session) {
    await session.setModel(selectedModel);
    return bootstrap();
  }
  agentProfiles[agentId].defaultModelKey = key;
  saveSettings();
  return createSession({ agentId });
});

ipcMain.handle("pi:set-thinking-level", async (_event, agentId, level) => {
  if (!isAgentId(agentId) || !thinkingLevels.includes(level)) throw new Error("Invalid thinking level.");
  if (agentId === activeAgentId && session) {
    if (session.isStreaming) throw new Error("Stop the current response before changing reasoning.");
    if (!session.getAvailableThinkingLevels().includes(level)) throw new Error("That reasoning level is not supported by this model.");
    session.setThinkingLevel(level);
  }
  agentProfiles[agentId].thinkingLevel = level;
  saveSettings();
  return bootstrap();
});

ipcMain.handle("pi:complete-setup", async (_event, accepted) => {
  acceptExecutionRisk(accepted);
  return finishSetup();
});

ipcMain.handle("pi:set-provider-api-key", async (_event, providerId, apiKey, accepted) => {
  if (typeof providerId !== "string" || typeof apiKey !== "string" || !apiKey.trim()) throw new Error("Enter an API key first.");
  acceptExecutionRisk(accepted);
  await credentialStore.modify(providerId, async () => ({ type: "api_key", key: apiKey.trim() }));
  await refreshRuntime();
  return finishSetup();
});

ipcMain.handle("pi:login-provider", async (_event, providerId, type, accepted) => {
  if (typeof providerId !== "string" || (type !== "api_key" && type !== "oauth")) throw new Error("Invalid authentication method.");
  acceptExecutionRisk(accepted);
  await refreshRuntime();
  await modelRuntime.login(providerId, type, authInteraction());
  saveCredentials();
  return finishSetup();
});

ipcMain.handle("pi:logout-provider", async (_event, providerId) => {
  if (typeof providerId !== "string") throw new Error("Invalid provider.");
  await modelRuntime?.logout(providerId).catch(() => {});
  await credentialStore.delete(providerId);
  await refreshRuntime();
  return bootstrap();
});

ipcMain.handle("pi:import-pi-auth", async (_event, accepted) => {
  if (setupComplete) throw new Error("Pi auth import is only available during first setup.");
  acceptExecutionRisk(accepted);
  const imported = importablePiCredentials();
  const entries = Object.entries(imported);
  if (entries.length === 0) throw new Error("No Pi auth was found on this computer.");
  for (const [providerId, credential] of entries) {
    if (credential && typeof credential === "object") storedCredentials[providerId] = credential;
  }
  saveCredentials();
  return finishSetup();
});

ipcMain.handle("pi:auth-respond", (_event, promptId, value) => respondToAuthPrompt(promptId, value));
ipcMain.handle("pi:auth-cancel", (_event, promptId) => cancelAuthPrompt(promptId));
ipcMain.handle("pi:get-theme", () => appDatabase.getTheme());
ipcMain.handle("pi:save-theme", (_event, theme) => appDatabase.saveTheme(theme));
ipcMain.handle("pi:get-workspace-preferences", (_event, key) => appDatabase.getWorkspacePreferences(key));
ipcMain.handle("pi:save-workspace-preferences", (_event, key, preferences) => appDatabase.saveWorkspacePreferences(key, preferences));
ipcMain.handle("pi:list-workspace-files", () => listWorkspaceFiles());
ipcMain.handle("pi:open-workspace-file", async (_event, relativePath) => {
  const target = resolveWorkspaceFile(relativePath);
  if (!lstatSync(target).isFile()) throw new Error("That item is not a file.");
  const error = await shell.openPath(target);
  if (error) throw new Error(error);
});
ipcMain.handle("pi:reveal-workspace-file", (_event, relativePath) => {
  const target = resolveWorkspaceFile(relativePath);
  shell.showItemInFolder(target);
});
ipcMain.handle("pi:open-external", async (_event, url) => {
  if (typeof url !== "string" || !isAllowedBrowserUrl(url)) throw new Error("Only safe HTTP(S) links can be opened.");
  await shell.openExternal(url);
});
function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1000,
    minHeight: 700,
    title: "Pi Bot",
    titleBarStyle: "hidden",
    ...(process.platform === "darwin" ? { trafficLightPosition: { x: 18, y: 20 } } : {}),
    backgroundColor: "#111214",
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });
  window.webContents.on("will-attach-webview", (event, preferences, params) => {
    delete preferences.preload;
    preferences.nodeIntegration = false;
    preferences.nodeIntegrationInSubFrames = false;
    preferences.contextIsolation = true;
    preferences.sandbox = true;
    preferences.webSecurity = true;
    preferences.allowRunningInsecureContent = false;
    preferences.webviewTag = false;
    if (!isPiBotBrowserPartition(params.partition) || !isAllowedBrowserUrl(params.src)) {
      event.preventDefault();
      return;
    }
    configureBrowserSession(params.partition);
  });
  window.webContents.on("did-attach-webview", (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-navigate", (event, url) => { if (!isAllowedBrowserUrl(url)) event.preventDefault(); });
    contents.on("will-redirect", (event, url) => { if (!isAllowedBrowserUrl(url)) event.preventDefault(); });
    contents.on("will-frame-navigate", (event, url) => { if (!isAllowedBrowserUrl(url)) event.preventDefault(); });
  });
  const isSmokeTest = existsSync(userDataPath(".smoke-test"));
  if (isSmokeTest) {
    const resultFile = userDataPath("smoke-test.json");
    const errors = [];
    const requests = [];
    smokeTest = { webContentsId: window.webContents.id, resultFile, errors, requests, completed: false };
    window.webContents.on("console-message", (_event, _level, message) => errors.push(message));
    window.webContents.session.webRequest.onCompleted((details) => {
      if (details.webContentsId === window.webContents.id) requests.push({ url: details.url, statusCode: details.statusCode });
    });
    window.webContents.session.webRequest.onErrorOccurred((details) => {
      if (details.webContentsId === window.webContents.id) requests.push({ url: details.url, error: details.error });
    });
    window.webContents.once("did-fail-load", (_event, _errorCode, errorDescription, validatedURL) => {
      smokeTest.completed = true;
      writeFileSync(resultFile, JSON.stringify({ error: errorDescription, url: validatedURL, errors, requests }, null, 2));
    });
    window.webContents.once("did-finish-load", () => {
      writeFileSync(resultFile, JSON.stringify({ stage: "loaded", errors, requests }, null, 2));
    });
    setTimeout(() => {
      if (smokeTest.completed) return;
      writeFileSync(resultFile, JSON.stringify({ error: "Renderer did not become responsive.", errors, requests }, null, 2));
      app.quit();
    }, 15000);
  }
  const pageLoad = app.isPackaged
    ? window.loadFile(path.join(appRoot, "dist", "index.html"))
    : window.loadURL(developmentServerUrl);
  pageLoad.catch((error) => {
    if (isSmokeTest) writeFileSync(userDataPath("smoke-test.json"), JSON.stringify({ error: String(error) }, null, 2));
  });
}

app.whenReady().then(() => {
  appDatabase = createAppDatabase(userDataPath(DATABASE_FILENAME));
  migrateLegacyStorage(appDatabase, {
    settingsPath: legacySettingsFile(),
    sessionsRoot: userDataPath("sessions"),
    defaultAgentId,
    defaultAgent: defaultAgentProfile(),
    normalizeAgent: (id, value, fallback) => normalizeProfile(id, value, fallback),
  });
  loadSettings();
  loadCredentials();
  ensureAllWorkspaces();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("before-quit", () => {
  for (const pending of pendingAuthPrompts.values()) pending.reject(new Error("Authentication was cancelled."));
  pendingAuthPrompts.clear();
  for (const runtime of sessionRuntimes.values()) {
    runtime.unsubscribe?.();
    runtime.session?.dispose();
  }
  sessionRuntimes.clear();
  clearActiveRuntime();
  appDatabase?.close();
});
