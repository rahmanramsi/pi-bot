const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("piBot", {
  connect: () => ipcRenderer.invoke("pi:connect"),
  chooseFolder: () => ipcRenderer.invoke("pi:choose-folder"),
  selectAgent: (agentId) => ipcRenderer.invoke("pi:select-agent", agentId),
  createAgent: (draft) => ipcRenderer.invoke("pi:create-agent", draft),
  updateAgent: (profile) => ipcRenderer.invoke("pi:update-agent", profile),
  duplicateAgent: (agentId) => ipcRenderer.invoke("pi:duplicate-agent", agentId),
  archiveAgent: (agentId, archived) => ipcRenderer.invoke("pi:archive-agent", agentId, archived),
  deleteAgent: (agentId) => ipcRenderer.invoke("pi:delete-agent", agentId),
  newSession: () => ipcRenderer.invoke("pi:new-session"),
  openSession: (sessionPath) => ipcRenderer.invoke("pi:open-session", sessionPath),
  getSessions: () => ipcRenderer.invoke("pi:get-sessions"),
  prompt: (message) => ipcRenderer.invoke("pi:prompt", message),
  abort: () => ipcRenderer.invoke("pi:abort"),
  setModel: (key) => ipcRenderer.invoke("pi:set-model", key),
  setThinkingLevel: (level) => ipcRenderer.invoke("pi:set-thinking-level", level),
  onEvent: (listener) => {
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on("pi:event", handler);
    return () => ipcRenderer.removeListener("pi:event", handler);
  },
});
