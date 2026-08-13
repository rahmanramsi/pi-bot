const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("piBot", {
  connect: () => ipcRenderer.invoke("pi:connect"),
  chooseFolder: (agentId) => ipcRenderer.invoke("pi:choose-folder", agentId),
  selectAgent: (agentId) => ipcRenderer.invoke("pi:select-agent", agentId),
  createAgent: (draft) => ipcRenderer.invoke("pi:create-agent", draft),
  updateAgent: (profile) => ipcRenderer.invoke("pi:update-agent", profile),
  archiveAgent: (agentId, archived) => ipcRenderer.invoke("pi:archive-agent", agentId, archived),
  deleteAgent: (agentId, deleteWorkspace) => ipcRenderer.invoke("pi:delete-agent", agentId, deleteWorkspace),
  trustWorkspace: (agentId) => ipcRenderer.invoke("pi:trust-workspace", agentId),
  newSession: () => ipcRenderer.invoke("pi:new-session"),
  openSession: (sessionPath) => ipcRenderer.invoke("pi:open-session", sessionPath),
  deleteSession: (sessionPath) => ipcRenderer.invoke("pi:delete-session", sessionPath),
  getSessions: (agentId) => ipcRenderer.invoke("pi:get-sessions", agentId),
  prompt: (message) => ipcRenderer.invoke("pi:prompt", message),
  abort: () => ipcRenderer.invoke("pi:abort"),
  setAgentModel: (agentId, key) => ipcRenderer.invoke("pi:set-agent-model", agentId, key),
  setSessionModel: (agentId, key) => ipcRenderer.invoke("pi:set-session-model", agentId, key),
  setThinkingLevel: (agentId, level) => ipcRenderer.invoke("pi:set-thinking-level", agentId, level),
  setProviderApiKey: (providerId, apiKey) => ipcRenderer.invoke("pi:set-provider-api-key", providerId, apiKey),
  loginProvider: (providerId, type) => ipcRenderer.invoke("pi:login-provider", providerId, type),
  logoutProvider: (providerId) => ipcRenderer.invoke("pi:logout-provider", providerId),
  importPiAuth: () => ipcRenderer.invoke("pi:import-pi-auth"),
  respondAuth: (promptId, value) => ipcRenderer.invoke("pi:auth-respond", promptId, value),
  onEvent: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("pi:event", handler);
    return () => ipcRenderer.removeListener("pi:event", handler);
  },
});
