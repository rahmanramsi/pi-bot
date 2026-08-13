import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const codingTools = ["read", "bash", "edit", "write", "grep", "find", "ls"];
const thinkingLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const builtinAgentProfiles = {
  planner: {
    name: "Planner",
    initials: "PL",
    description: "Breaks work into clear next steps.",
    systemPrompt: "You are Planner, a thoughtful planning teammate. Turn the user's request into a clear, practical plan before proposing implementation. Stay concise and use the available coding tools when they help.",
    builtIn: true,
    archived: false,
  },
  researcher: {
    name: "Researcher",
    initials: "RE",
    description: "Finds evidence and explains what it means.",
    systemPrompt: "You are Researcher, an evidence-focused teammate. Inspect the selected workspace, trace relevant information, and explain findings with concrete references. Stay concise and use the available coding tools when they help.",
    builtIn: true,
    archived: false,
  },
  coder: {
    name: "Coder",
    initials: "CO",
    description: "Explains implementation details and trade-offs.",
    systemPrompt: "You are Coder, an implementation-focused teammate. Inspect the selected workspace, explain how the code works, and make the requested changes directly. Stay concise and use the available coding tools.",
    builtIn: true,
    archived: false,
  },
};
const defaultAgentId = "planner";
let agentProfiles = Object.fromEntries(Object.entries(builtinAgentProfiles).map(([id, profile]) => [id, { id, ...profile }]));

let window;
let workspace = appRoot;
let preferredModelKey;
let preferredThinkingLevel;
let activeAgentId = defaultAgentId;
let agentSessions = {};
let sessionAgents = {};
let session;
let unsubscribe;
let modelRuntime;
let availableModels = [];

function settingsFile() {
  return path.join(app.getPath("userData"), "settings.json");
}

function isAgentId(value) {
  return typeof value === "string" && Boolean(agentProfiles[value]);
}

function cleanText(value, fallback, maxLength = 4000) {
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : fallback;
}

function initialsFor(name) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return initials || "AI";
}

function normalizeProfile(id, value, { builtIn = false, fallback } = {}) {
  const base = fallback ?? {};
  const name = cleanText(value?.name, base.name || "Untitled agent", 80);
  const systemPrompt = typeof value?.systemPrompt === "string"
    ? value.systemPrompt.trim().slice(0, 8000)
    : cleanText(undefined, base.systemPrompt || `You are ${name}, a helpful workspace teammate. Use the available coding tools to read, search, and change files in the selected workspace.`, 8000);
  return {
    id,
    name,
    initials: cleanText(value?.initials, base.initials || initialsFor(name), 4).toUpperCase(),
    description: cleanText(value?.description, base.description || "A focused workspace teammate.", 180),
    systemPrompt,
    builtIn,
    archived: builtIn ? false : Boolean(value?.archived),
  };
}

function loadAgentProfiles(savedAgents) {
  const next = Object.fromEntries(Object.entries(builtinAgentProfiles).map(([id, profile]) => [id, { id, ...profile }]));
  const entries = Array.isArray(savedAgents)
    ? savedAgents.map((value) => [value?.id, value])
    : savedAgents && typeof savedAgents === "object"
      ? Object.entries(savedAgents)
      : [];

  for (const [rawId, value] of entries) {
    if (typeof rawId !== "string" || !rawId || !value || typeof value !== "object") continue;
    const existing = next[rawId];
    next[rawId] = normalizeProfile(rawId, value, {
      builtIn: Boolean(existing?.builtIn),
      fallback: existing,
    });
  }
  agentProfiles = next;
}

function listAgents({ includeArchived = true } = {}) {
  return Object.values(agentProfiles)
    .filter((agent) => includeArchived || !agent.archived)
    .sort((a, b) => Number(b.builtIn) - Number(a.builtIn) || a.name.localeCompare(b.name));
}

function fallbackAgentId(excludedId) {
  const candidates = listAgents({ includeArchived: false }).filter((agent) => agent.id !== excludedId);
  return candidates.find((agent) => agent.id === defaultAgentId)?.id ?? candidates[0]?.id;
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

function reassignAgentSessions(fromId, toId) {
  for (const [pathName, agentId] of Object.entries(sessionAgents)) {
    if (agentId === fromId) sessionAgents[pathName] = toId;
  }
  for (const workspaceSessions of Object.values(agentSessions)) {
    if (!workspaceSessions || typeof workspaceSessions !== "object") continue;
    for (const [agentId, sessionPath] of Object.entries(workspaceSessions)) {
      if (agentId === fromId) {
        delete workspaceSessions[agentId];
        workspaceSessions[toId] = sessionPath;
      }
    }
  }
}

function currentAgentSessions() {
  if (!agentSessions[workspace] || typeof agentSessions[workspace] !== "object") {
    agentSessions[workspace] = {};
  }
  return agentSessions[workspace];
}

function loadSettings() {
  try {
    const saved = JSON.parse(readFileSync(settingsFile(), "utf8"));
    loadAgentProfiles(saved.agents);
    if (typeof saved.workspace === "string" && existsSync(saved.workspace)) workspace = saved.workspace;
    if (typeof saved.modelKey === "string") preferredModelKey = saved.modelKey;
    if (thinkingLevels.includes(saved.thinkingLevel)) preferredThinkingLevel = saved.thinkingLevel;
    if (isAgentId(saved.activeAgentId) && !agentProfiles[saved.activeAgentId].archived) activeAgentId = saved.activeAgentId;
    if (saved.agentSessions && typeof saved.agentSessions === "object") {
      const values = Object.values(saved.agentSessions);
      const isLegacyFlatMap = values.some((value) => typeof value === "string");
      agentSessions = isLegacyFlatMap ? { [workspace]: saved.agentSessions } : saved.agentSessions;
    }
    if (saved.sessionAgents && typeof saved.sessionAgents === "object") sessionAgents = saved.sessionAgents;
  } catch {
    // A missing or incomplete settings file is the normal first-run state.
  }
}

function saveSettings() {
  try {
    writeFileSync(settingsFile(), JSON.stringify({
      workspace,
      modelKey: preferredModelKey,
      thinkingLevel: preferredThinkingLevel,
      activeAgentId,
      agentSessions,
      sessionAgents,
      agents: listAgents(),
    }, null, 2));
  } catch (error) {
    console.warn("Could not save Pi Bot settings:", error);
  }
}

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
  return content.map((part) => {
    if (part?.type === "text") return part.text;
    if (part?.type === "thinking") return "";
    if (part?.type === "toolCall") return "";
    return "";
  }).filter(Boolean).join("\n");
}

function displayTime(timestamp) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
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
  };
}

function titleFromPrompt(prompt) {
  const compact = prompt.replace(/\s+/g, " ").trim();
  if (!compact) return "New conversation";
  return compact.length > 52 ? `${compact.slice(0, 49)}…` : compact;
}

function transcriptFromSession() {
  if (!session) return [];

  const items = [];
  const toolRows = new Map();
  const entries = session.sessionManager.buildContextEntries();

  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const message = entry.message;
    const timestamp = displayTime(message.timestamp);

    if (message.role === "user") {
      items.push({
        id: entry.id,
        kind: "user",
        label: "You",
        body: messageText(message.content),
        timestamp,
      });
      continue;
    }

    if (message.role === "assistant") {
      const body = messageText(message.content);
      if (body || message.errorMessage) {
        items.push({
          id: entry.id,
          kind: "assistant",
          label: "Pi Bot",
          body: body || message.errorMessage,
          timestamp,
          status: message.errorMessage ? "failed" : "done",
        });
      }
      for (const part of message.content ?? []) {
        if (part?.type !== "toolCall") continue;
        const tool = {
          id: part.id,
          kind: "tool",
          label: `Tool · ${part.name}`,
          body: stringify(part.arguments),
          timestamp,
          status: "done",
        };
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
          status: message.isError ? "failed" : "done",
        });
      }
    }
  }

  return items;
}

function sessionSummary(info) {
  const assignedAgentId = isAgentId(sessionAgents[info.path]) ? sessionAgents[info.path] : defaultAgentId;
  return {
    path: info.path,
    id: info.id,
    agentId: assignedAgentId,
    name: info.name || titleFromPrompt(info.firstMessage || "New conversation"),
    created: info.created instanceof Date ? info.created.toISOString() : info.created,
    modified: info.modified instanceof Date ? info.modified.toISOString() : info.modified,
    messageCount: info.messageCount,
  };
}

async function listSessions(agentId = activeAgentId) {
  const sessions = await SessionManager.list(workspace);
  return sessions
    .filter((info) => info.messageCount > 0 && (sessionAgents[info.path] ?? defaultAgentId) === agentId)
    .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
    .map(sessionSummary);
}

function currentSessionSummary() {
  if (!session) return null;
  const manager = session.sessionManager;
  const entries = manager.getEntries();
  const firstUser = entries.find((entry) => entry.type === "message" && entry.message.role === "user");
  return {
    path: manager.getSessionFile(),
    id: manager.getSessionId(),
    agentId: activeAgentId,
    name: session.sessionName || manager.getSessionName() || (firstUser ? titleFromPrompt(messageText(firstUser.message.content)) : "New conversation"),
  };
}

function currentConfig() {
  const currentModel = session?.model;
  return {
    agentId: activeAgentId,
    workspace,
    model: currentModel?.name ?? currentModel?.id ?? "No model",
    modelKey: modelKey(currentModel),
    provider: currentModel?.provider ?? "",
    thinkingLevel: session?.thinkingLevel ?? "off",
    availableThinkingLevels: session?.getAvailableThinkingLevels?.() ?? [],
    models: availableModels.map(modelOption),
    tools: codingTools,
    session: currentSessionSummary(),
  };
}

async function bootstrap() {
  return {
    config: currentConfig(),
    transcript: transcriptFromSession(),
    sessions: await listSessions(activeAgentId),
    agents: listAgents(),
  };
}

function relay(event) {
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent.type === "text_delta"
  ) {
    send({ type: "assistant-delta", delta: event.assistantMessageEvent.delta });
  }

  if (event.type === "tool_execution_start") {
    send({
      type: "tool-start",
      id: event.toolCallId,
      name: event.toolName,
      detail: stringify(event.args),
    });
  }

  if (event.type === "tool_execution_update") {
    send({
      type: "tool-update",
      id: event.toolCallId,
      detail: stringify(event.partialResult),
    });
  }

  if (event.type === "tool_execution_end") {
    send({
      type: "tool-end",
      id: event.toolCallId,
      failed: event.isError,
      detail: stringify(event.result),
    });
  }

  if (event.type === "turn_end" && event.message?.role === "assistant" && event.message.errorMessage) {
    if (event.message.stopReason === "aborted") {
      send({ type: "aborted" });
    } else {
      send({ type: "error", message: event.message.errorMessage });
    }
  }

  if (event.type === "agent_start") send({ type: "agent-start" });
  if (event.type === "agent_end") send({ type: "agent-end", retrying: event.willRetry });
  if (event.type === "agent_settled") send({ type: "agent-settled" });
}

async function ensureRuntime() {
  modelRuntime ??= await ModelRuntime.create();
  availableModels = [...await modelRuntime.getAvailable()];
  if (availableModels.length === 0) {
    throw new Error("No authenticated Pi model found. Run `pi` once and sign in to a provider.");
  }
}

async function createSession({ mode = "continue", sessionPath, agentId = activeAgentId } = {}) {
  if (!isAgentId(agentId)) throw new Error("Invalid agent.");
  if (agentProfiles[agentId].archived) throw new Error("That agent is archived. Restore it before selecting it.");
  activeAgentId = agentId;
  await session?.abort();
  unsubscribe?.();
  session?.dispose();

  await ensureRuntime();

  const mappedPath = currentAgentSessions()[agentId];
  const mappedPathExists = typeof mappedPath === "string" && existsSync(mappedPath);
  const manager = mode === "open"
    ? SessionManager.open(sessionPath)
    : mode === "new"
      ? SessionManager.create(workspace)
      : mappedPathExists
        ? SessionManager.open(mappedPath)
        : agentId === defaultAgentId
          ? SessionManager.continueRecent(workspace)
          : SessionManager.create(workspace);

  const savedModel = manager.buildSessionContext().model;
  const savedModelObject = savedModel
    ? modelRuntime.getModel(savedModel.provider, savedModel.modelId)
    : undefined;
  const preferredModel = preferredModelKey
    ? availableModels.find((model) => modelKey(model) === preferredModelKey)
    : undefined;
  const selectedModel = preferredModel || savedModelObject || availableModels[0];
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false } });
  const resourceLoader = new DefaultResourceLoader({
    cwd: workspace,
    agentDir: getAgentDir(),
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: agentProfiles[agentId].systemPrompt
      ? agentProfiles[agentId].systemPrompt
      : "You are a coding teammate. Use the available tools (read, bash, edit, write, grep, find, ls) to inspect and change the selected workspace.",
  });
  await resourceLoader.reload();

  const result = await createAgentSession({
    cwd: workspace,
    modelRuntime,
    model: selectedModel,
    thinkingLevel: preferredThinkingLevel,
    tools: codingTools,
    sessionManager: manager,
    settingsManager,
    resourceLoader,
  });

  session = result.session;
  unsubscribe = session.subscribe(relay);
  const sessionFile = session.sessionManager.getSessionFile();
  currentAgentSessions()[agentId] = sessionFile;
  sessionAgents[sessionFile] = agentId;
  preferredModelKey = modelKey(session.model) || preferredModelKey;
  saveSettings();
  return bootstrap();
}

ipcMain.handle("pi:connect", () => createSession());

ipcMain.handle("pi:select-agent", async (_event, agentId) => {
  if (!isAgentId(agentId)) throw new Error("Invalid agent.");
  const previousAgentId = activeAgentId;
  try {
    return await createSession({ agentId });
  } catch (error) {
    activeAgentId = previousAgentId;
    throw error;
  }
});

ipcMain.handle("pi:create-agent", async (_event, draft) => {
  if (!draft || typeof draft !== "object") throw new Error("Invalid agent profile.");
  const template = isAgentId(draft.templateId) ? agentProfiles[draft.templateId] : undefined;
  const id = uniqueAgentId(draft.name);
  agentProfiles[id] = normalizeProfile(id, draft, { fallback: template });
  saveSettings();
  return bootstrap();
});

ipcMain.handle("pi:update-agent", async (_event, profile) => {
  if (!profile || typeof profile !== "object" || !isAgentId(profile.id)) {
    throw new Error("Invalid agent profile.");
  }
  const current = agentProfiles[profile.id];
  agentProfiles[profile.id] = normalizeProfile(profile.id, profile, {
    builtIn: current.builtIn,
    fallback: current,
  });
  if (!current.builtIn) agentProfiles[profile.id].archived = current.archived;
  saveSettings();
  if (activeAgentId === profile.id && !session?.isStreaming) {
    return createSession({ agentId: profile.id });
  }
  return bootstrap();
});

ipcMain.handle("pi:duplicate-agent", async (_event, agentId) => {
  if (!isAgentId(agentId)) throw new Error("Invalid agent.");
  const source = agentProfiles[agentId];
  const id = uniqueAgentId(source.name);
  agentProfiles[id] = normalizeProfile(id, {
    ...source,
    name: `${source.name} Copy`,
    archived: false,
  });
  saveSettings();
  return bootstrap();
});

ipcMain.handle("pi:archive-agent", async (_event, agentId, archived) => {
  if (!isAgentId(agentId)) throw new Error("Invalid agent.");
  const profile = agentProfiles[agentId];
  if (profile.builtIn) throw new Error("Built-in agents are always available and cannot be archived.");
  const nextArchived = Boolean(archived);
  if (nextArchived && activeAgentId === agentId) {
    const fallback = fallbackAgentId(agentId);
    if (!fallback) throw new Error("Keep at least one active agent.");
    profile.archived = true;
    saveSettings();
    return createSession({ agentId: fallback });
  }
  profile.archived = nextArchived;
  saveSettings();
  return bootstrap();
});

ipcMain.handle("pi:delete-agent", async (_event, agentId) => {
  if (!isAgentId(agentId)) throw new Error("Invalid agent.");
  const profile = agentProfiles[agentId];
  if (profile.builtIn) throw new Error("Built-in agents are templates and cannot be deleted.");
  const fallback = fallbackAgentId(agentId);
  if (!fallback) throw new Error("Keep at least one agent.");
  reassignAgentSessions(agentId, fallback);
  delete agentProfiles[agentId];
  if (activeAgentId === agentId) {
    return createSession({ agentId: fallback });
  }
  saveSettings();
  return bootstrap();
});

ipcMain.handle("pi:choose-folder", async () => {
  const result = await dialog.showOpenDialog(window, {
    properties: ["openDirectory"],
    defaultPath: workspace,
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  workspace = result.filePaths[0];
  saveSettings();
  return createSession({ mode: "continue" });
});

ipcMain.handle("pi:new-session", () => createSession({ mode: "new" }));

ipcMain.handle("pi:open-session", (_event, sessionPath) => {
  if (typeof sessionPath !== "string" || !sessionPath) throw new Error("Invalid session path.");
  return listSessions().then((sessions) => {
    if (!sessions.some((entry) => entry.path === sessionPath)) {
      throw new Error("That conversation is not available in the selected workspace.");
    }
    return createSession({ mode: "open", sessionPath, agentId: activeAgentId });
  });
});

ipcMain.handle("pi:get-sessions", () => listSessions());

ipcMain.handle("pi:prompt", async (_event, message) => {
  if (typeof message !== "string" || !message.trim()) return;
  if (!session) await createSession({ mode: "new", agentId: activeAgentId });

  if (session.isStreaming) {
    throw new Error("Pi Bot is already responding. Stop the current response before sending another prompt.");
  }

  const hasUserMessage = session.sessionManager
    .getEntries()
    .some((entry) => entry.type === "message" && entry.message.role === "user");
  if (!hasUserMessage) session.sessionManager.appendSessionInfo(titleFromPrompt(message));

  try {
    await session.prompt(message);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    if (messageText !== "Request was aborted") send({ type: "error", message: messageText });
    throw error;
  } finally {
    send({
      type: "session-sync",
      transcript: transcriptFromSession(),
      sessions: await listSessions(),
      config: currentConfig(),
      agents: listAgents(),
    });
  }
});

ipcMain.handle("pi:abort", async () => {
  await session?.abort();
});

ipcMain.handle("pi:set-model", async (_event, key) => {
  if (typeof key !== "string") throw new Error("Invalid model.");
  const nextModel = availableModels.find((model) => modelKey(model) === key);
  if (!nextModel || !session) throw new Error("Model is not available.");
  await session.setModel(nextModel);
  preferredModelKey = key;
  saveSettings();
  return currentConfig();
});

ipcMain.handle("pi:set-thinking-level", (_event, level) => {
  if (!thinkingLevels.includes(level) || !session) throw new Error("Invalid thinking level.");
  session.setThinkingLevel(level);
  preferredThinkingLevel = session.thinkingLevel;
  saveSettings();
  return currentConfig();
});

function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1000,
    minHeight: 700,
    title: "Pi Bot",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f3f1eb",
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (app.isPackaged) {
    window.loadFile(path.join(appRoot, "dist", "index.html"));
  } else {
    window.loadURL("http://127.0.0.1:5173");
  }
}

app.whenReady().then(() => {
  loadSettings();
  createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("before-quit", () => {
  unsubscribe?.();
  session?.dispose();
});
