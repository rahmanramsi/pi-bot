import { SessionManager } from "@earendil-works/pi-coding-agent";

/**
 * The SDK exposes session tree operations but no persistence adapter interface.
 * Keep the small bridge in one module so its real Electron runtime path can be tested.
 */
export function createDatabaseSessionManager({ database, profile, sessionPath, entries }) {
  const header = entries[0];
  if (!header || header.type !== "session") throw new Error("Session is missing its SQLite header.");
  const manager = SessionManager.inMemory(profile.workspace, { id: header.id });
  manager.sessionId = header.id;
  manager.sessionFile = sessionPath;
  manager.sessionDir = "";
  manager.fileEntries = entries;
  manager.flushed = true;
  manager._buildIndex();
  manager._persist = (entry) => {
    database.appendSessionEntry(header.id, entry);
    manager.flushed = true;
  };
  return manager;
}

export function createDatabaseSession({ database, profile, agentId }) {
  const manager = SessionManager.inMemory(profile.workspace);
  const sessionId = manager.getSessionId();
  const header = manager.getHeader();
  const sessionPath = database.saveSession({
    id: sessionId,
    agentId,
    workspace: profile.workspace,
    entries: [header],
  });
  return createDatabaseSessionManager({ database, profile, sessionPath, entries: [header] });
}
