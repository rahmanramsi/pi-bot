import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { recoverPendingSessions } from "./session-persistence.mjs";

export const DATABASE_FILENAME = "pi-bot.sqlite";
export const DATABASE_SCHEMA_VERSION = 6;
export const SESSION_PATH_PREFIX = "pi-session://";
export const TEAM_SESSION_PATH_PREFIX = "pi-team-session://";

const migrationKey = "legacy-jsonl";
const themePreferenceKey = "pi-bot.theme";

export class UnsupportedDatabaseSchemaError extends Error {
  name = "UnsupportedDatabaseSchemaError";

  constructor(version) {
    super(`Unsupported database schema version ${version}; this Pi Bot build supports up to ${DATABASE_SCHEMA_VERSION}.`);
  }
}

function boolToInteger(value) {
  return value ? 1 : 0;
}

function integerToBool(value) {
  return value === 1;
}

function nowIso() {
  return new Date().toISOString();
}

export function teamSessionPathForId(teamChatId, agentId) {
  if (typeof teamChatId !== "string" || !teamChatId || typeof agentId !== "string" || !agentId) throw new Error("Team session ids are required.");
  return `${TEAM_SESSION_PATH_PREFIX}${encodeURIComponent(teamChatId)}/${encodeURIComponent(agentId)}`;
}

function normalizedPath(value) {
  try {
    return realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function sourcePathKey(value) {
  return normalizedPath(value);
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function validSessionHeader(entry) {
  return entry
    && entry.type === "session"
    && typeof entry.id === "string"
    && entry.id.length > 0
    && typeof entry.cwd === "string"
    && typeof entry.timestamp === "string";
}

function validSessionEntry(entry) {
  return entry
    && typeof entry === "object"
    && typeof entry.type === "string"
    && entry.type !== "session"
    && typeof entry.id === "string"
    && entry.id.length > 0
    && (entry.parentId === null || typeof entry.parentId === "string")
    && typeof entry.timestamp === "string";
}

function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length < 1) return "empty session";
  if (!validSessionHeader(entries[0])) return "missing or invalid session header";
  const ids = new Set([entries[0].id]);
  for (const entry of entries.slice(1)) {
    if (!validSessionEntry(entry)) return "invalid session entry";
    if (entry.parentId !== null && !ids.has(entry.parentId)) return "invalid session parent";
    if (ids.has(entry.id)) return "duplicate session entry id";
    ids.add(entry.id);
  }
  return null;
}

export function parseLegacySessionFile(file) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch (error) {
    return { ok: false, file, reason: error instanceof Error ? error.message : "could not read session" };
  }
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  let entries = [];
  for (const [index, line] of lines.entries()) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      return { ok: false, file, reason: `malformed JSON at line ${index + 1}` };
    }
  }
  if (entries[0]?.type === "session" && Number(entries[0].version ?? 1) < 3) {
    try {
      const temporaryRoot = mkdtempSync(path.join(tmpdir(), "pi-bot-session-migration-"));
      const temporaryFile = path.join(temporaryRoot, "session.jsonl");
      copyFileSync(file, temporaryFile);
      try {
        const manager = SessionManager.open(temporaryFile, temporaryRoot);
        const header = manager.getHeader();
        entries = header ? [header, ...manager.getEntries()] : [];
      } finally {
        rmSync(temporaryRoot, { recursive: true, force: true });
      }
    } catch (error) {
      return { ok: false, file, reason: error instanceof Error ? error.message : "could not migrate version-one session" };
    }
  }
  const reason = validateEntries(entries);
  if (reason) return { ok: false, file, reason };
  return {
    ok: true,
    file,
    entries,
    header: entries[0],
    entryCount: entries.length,
  };
}

export function sessionPathForId(id) {
  if (typeof id !== "string" || !id) throw new Error("Session id is required.");
  return `${SESSION_PATH_PREFIX}${encodeURIComponent(id)}`;
}

export function sessionIdFromPath(sessionPath) {
  if (typeof sessionPath !== "string" || !sessionPath.startsWith(SESSION_PATH_PREFIX)) return null;
  try {
    const id = decodeURIComponent(sessionPath.slice(SESSION_PATH_PREFIX.length));
    return id || null;
  } catch {
    return null;
  }
}

function readRows(statement, ...params) {
  return statement.all(...params).map((row) => ({ ...row }));
}

function createApplicationTables(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      setup_complete INTEGER NOT NULL DEFAULT 0,
      execution_risk_accepted INTEGER NOT NULL DEFAULT 0,
      active_agent_id TEXT,
      thinking_level TEXT NOT NULL DEFAULT 'medium'
    );
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      initials TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '',
      workspace TEXT NOT NULL,
      workspace_kind TEXT NOT NULL,
      workspace_trusted INTEGER NOT NULL DEFAULT 0,
      default_model_key TEXT NOT NULL DEFAULT '',
      thinking_level TEXT NOT NULL DEFAULT 'medium',
      archived INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      workspace TEXT NOT NULL,
      source_path TEXT UNIQUE,
      header_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      modified_at TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      entry_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS session_entries (
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      entry_id TEXT NOT NULL,
      entry_json TEXT NOT NULL,
      PRIMARY KEY (session_id, ordinal),
      UNIQUE (session_id, entry_id)
    );
    CREATE TABLE IF NOT EXISTS current_sessions (
      agent_id TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);
}

function migrateSchemaV2(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS preferences (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function migrateSchemaV3(database) {
  const columns = readRows(database.prepare("PRAGMA table_info(agents)"));
  if (!columns.some((column) => column.name === "description")) database.exec("ALTER TABLE agents ADD COLUMN description TEXT NOT NULL DEFAULT ''");
}

function migrateSchemaV4(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      workspace TEXT NOT NULL,
      workspace_trusted INTEGER NOT NULL DEFAULT 0,
      model_key TEXT NOT NULL,
      thinking_level TEXT NOT NULL,
      prompt TEXT NOT NULL,
      recurrence TEXT NOT NULL,
      start_at TEXT NOT NULL,
      time_zone TEXT NOT NULL,
      status TEXT NOT NULL,
      next_run_at TEXT,
      last_run_at TEXT,
      last_status TEXT,
      last_error TEXT,
      last_session_path TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS scheduled_jobs_due_idx ON scheduled_jobs (status, next_run_at);
  `);
}

function migrateSchemaV5(database) {
  const columns = readRows(database.prepare("PRAGMA table_info(agents)"));
  if (!columns.some((column) => column.name === "pinned")) database.exec("ALTER TABLE agents ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0");
}

function migrateSchemaV6(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS team_chats (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      run_status TEXT NOT NULL DEFAULT 'idle',
      active_run_id TEXT,
      active_agent_id TEXT,
      pending_agent_id TEXT,
      run_limit INTEGER NOT NULL DEFAULT 12,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS team_chat_members (
      team_chat_id TEXT NOT NULL REFERENCES team_chats(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      name_snapshot TEXT NOT NULL,
      initials_snapshot TEXT NOT NULL,
      workspace_snapshot TEXT NOT NULL,
      workspace_kind_snapshot TEXT NOT NULL,
      workspace_trusted_snapshot INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (team_chat_id, agent_id),
      UNIQUE (team_chat_id, position)
    );
    CREATE TABLE IF NOT EXISTS team_chat_events (
      id TEXT PRIMARY KEY,
      team_chat_id TEXT NOT NULL REFERENCES team_chats(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      run_id TEXT,
      type TEXT NOT NULL,
      agent_id TEXT,
      sender_name TEXT,
      sender_initials TEXT,
      recipient_agent_id TEXT,
      recipient_name TEXT,
      recipient_initials TEXT,
      body TEXT NOT NULL DEFAULT '',
      request TEXT,
      reason TEXT,
      status TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (team_chat_id, ordinal)
    );
    CREATE INDEX IF NOT EXISTS team_chat_events_order_idx ON team_chat_events (team_chat_id, ordinal);
    CREATE TABLE IF NOT EXISTS team_chat_runs (
      id TEXT PRIMARY KEY,
      team_chat_id TEXT NOT NULL REFERENCES team_chats(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      goal TEXT NOT NULL,
      active_agent_id TEXT,
      pending_agent_id TEXT,
      turn_count INTEGER NOT NULL DEFAULT 0,
      run_limit INTEGER NOT NULL,
      stop_reason TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS team_chat_runs_chat_idx ON team_chat_runs (team_chat_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS team_member_sessions (
      team_chat_id TEXT NOT NULL REFERENCES team_chats(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      session_path TEXT NOT NULL UNIQUE,
      workspace TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (team_chat_id, agent_id)
    );
    CREATE TABLE IF NOT EXISTS team_session_entries (
      team_chat_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      entry_id TEXT NOT NULL,
      entry_json TEXT NOT NULL,
      PRIMARY KEY (team_chat_id, agent_id, ordinal),
      UNIQUE (team_chat_id, agent_id, entry_id),
      FOREIGN KEY (team_chat_id, agent_id) REFERENCES team_member_sessions(team_chat_id, agent_id) ON DELETE CASCADE
    );
  `);
}

function normalizeWorkspacePreferences(value) {
  const record = asRecord(value);
  const tabs = Array.isArray(record.tabs)
    ? record.tabs.filter((tab) => tab && typeof tab === "object" && typeof tab.id === "string" && (tab.kind === "files" || tab.kind === "browser")).map((tab) => ({
      id: tab.id,
      kind: tab.kind,
      ...(typeof tab.url === "string" ? { url: tab.url } : {}),
      ...(typeof tab.title === "string" ? { title: tab.title } : {}),
    }))
    : [];
  const safeTabs = tabs.length > 0 ? tabs : [{ id: "files-default", kind: "files" }];
  const activeTabId = typeof record.activeTabId === "string" && safeTabs.some((tab) => tab.id === record.activeTabId)
    ? record.activeTabId
    : safeTabs[0]?.id ?? null;
  const width = typeof record.width === "number" && Number.isFinite(record.width)
    ? Math.min(520, Math.max(280, Math.round(record.width)))
    : 340;
  return {
    tabs: safeTabs,
    activeTabId,
    open: typeof record.open === "boolean" ? record.open : true,
    width,
  };
}

export class AppDatabase {
  constructor(file) {
    mkdirSync(path.dirname(file), { recursive: true });
    this.file = file;
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = NORMAL");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
    const versionRow = this.db.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get();
    const storedVersion = versionRow ? Number(versionRow.value) : 0;
    if (!Number.isInteger(storedVersion) || storedVersion < 0) throw new Error("Invalid database schema version marker.");
    if (storedVersion > DATABASE_SCHEMA_VERSION) {
      this.db.close();
      throw new UnsupportedDatabaseSchemaError(storedVersion);
    }
    this.transaction(() => {
      if (storedVersion < 1) {
        createApplicationTables(this.db);
        this.db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(1, nowIso());
      }
      if (storedVersion < 2) {
        migrateSchemaV2(this.db);
        this.db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(2, nowIso());
      }
      if (storedVersion < 3) {
        migrateSchemaV3(this.db);
        this.db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(3, nowIso());
      }
      if (storedVersion < 4) {
        migrateSchemaV4(this.db);
        this.db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(4, nowIso());
      }
      if (storedVersion < 5) {
        migrateSchemaV5(this.db);
        this.db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(5, nowIso());
      }
      if (storedVersion < 6) {
        migrateSchemaV6(this.db);
        this.db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(6, nowIso());
      }
      this.db.prepare("INSERT INTO schema_meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(DATABASE_SCHEMA_VERSION));
    });
    this.transaction(() => {
      this.db.prepare("INSERT OR IGNORE INTO schema_meta (key, value) VALUES (?, ?)").run(migrationKey, JSON.stringify({ status: "pending", failedPaths: [] }));
    });
  }

  pragma(name) {
    const row = this.db.prepare(`PRAGMA ${name}`).get();
    return row ? Object.values(row)[0] : undefined;
  }

  schemaVersion() {
    const row = this.db.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get();
    return Number(row?.value ?? 0);
  }

  transaction(run) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = run();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // Preserve the original transaction error.
      }
      throw error;
    }
  }

  close() {
    this.db.close();
  }

  getMigrationStatus() {
    const row = this.db.prepare("SELECT value FROM schema_meta WHERE key = ?").get(migrationKey);
    try {
      const value = JSON.parse(row?.value ?? "{}");
      return {
        status: value.status === "complete" ? "complete" : "pending",
        failedPaths: Array.isArray(value.failedPaths) ? value.failedPaths : [],
        error: typeof value.error === "string" ? value.error : null,
      };
    } catch {
      return { status: "pending", failedPaths: [], error: "invalid migration marker" };
    }
  }

  setMigrationStatus(status, failedPaths = [], error = null) {
    const value = JSON.stringify({
      status: status === "complete" ? "complete" : "pending",
      failedPaths: [...new Set(failedPaths)].sort(),
      error: error || null,
      updatedAt: nowIso(),
    });
    this.transaction(() => {
      this.db.prepare("INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(migrationKey, value);
    });
  }

  getWorkspacePreferences(key) {
    if (typeof key !== "string" || !key) throw new Error("Preference key is required.");
    const row = this.db.prepare("SELECT value_json FROM preferences WHERE key = ?").get(key);
    if (!row) return null;
    try {
      return normalizeWorkspacePreferences(JSON.parse(row.value_json));
    } catch {
      return null;
    }
  }

  saveWorkspacePreferences(key, value) {
    if (typeof key !== "string" || !key || key.length > 512) throw new Error("Invalid preference key.");
    const preferences = normalizeWorkspacePreferences(value);
    this.transaction(() => {
      this.db.prepare("INSERT INTO preferences (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at").run(key, JSON.stringify(preferences), nowIso());
    });
    return preferences;
  }

  getTheme() {
    const row = this.db.prepare("SELECT value_json FROM preferences WHERE key = ?").get(themePreferenceKey);
    if (!row) return "dark";
    try {
      return JSON.parse(row.value_json) === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  }

  saveTheme(theme) {
    if (theme !== "dark" && theme !== "light") throw new Error("Invalid theme.");
    this.transaction(() => {
      this.db.prepare("INSERT INTO preferences (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at").run(themePreferenceKey, JSON.stringify(theme), nowIso());
    });
    return theme;
  }

  listScheduledJobs() {
    return readRows(this.db.prepare(`
      SELECT id, name, agent_id, workspace, workspace_trusted, model_key, thinking_level,
        prompt, recurrence, start_at, time_zone, status, next_run_at, last_run_at,
        last_status, last_error, last_session_path, created_at, updated_at
      FROM scheduled_jobs
      ORDER BY CASE WHEN next_run_at IS NULL THEN 1 ELSE 0 END, next_run_at, name
    `)).map((row) => ({
      id: row.id,
      name: row.name,
      agentId: row.agent_id,
      workspace: row.workspace,
      workspaceTrusted: integerToBool(row.workspace_trusted),
      modelKey: row.model_key,
      thinkingLevel: row.thinking_level,
      prompt: row.prompt,
      recurrence: row.recurrence,
      startAt: row.start_at,
      timeZone: row.time_zone,
      status: row.status,
      nextRunAt: row.next_run_at,
      lastRunAt: row.last_run_at,
      lastStatus: row.last_status,
      lastError: row.last_error,
      lastSessionPath: row.last_session_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  getScheduledJob(id) {
    return this.listScheduledJobs().find((job) => job.id === id) ?? null;
  }

  createScheduledJob(job) {
    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO scheduled_jobs (
          id, name, agent_id, workspace, workspace_trusted, model_key, thinking_level,
          prompt, recurrence, start_at, time_zone, status, next_run_at, last_run_at,
          last_status, last_error, last_session_path, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        job.id,
        job.name,
        job.agentId,
        job.workspace,
        boolToInteger(job.workspaceTrusted),
        job.modelKey,
        job.thinkingLevel,
        job.prompt,
        job.recurrence,
        job.startAt,
        job.timeZone,
        job.status,
        job.nextRunAt,
        job.lastRunAt,
        job.lastStatus,
        job.lastError,
        job.lastSessionPath,
        job.createdAt,
        job.updatedAt,
      );
    });
    return this.getScheduledJob(job.id);
  }

  updateScheduledJob(id, changes) {
    const current = this.getScheduledJob(id);
    if (!current) throw new Error("Scheduled job was not found.");
    const next = { ...current, ...changes };
    this.transaction(() => {
      this.db.prepare(`
        UPDATE scheduled_jobs SET
          name = ?, agent_id = ?, workspace = ?, workspace_trusted = ?, model_key = ?,
          thinking_level = ?, prompt = ?, recurrence = ?, start_at = ?, time_zone = ?,
          status = ?, next_run_at = ?, last_run_at = ?, last_status = ?, last_error = ?,
          last_session_path = ?, created_at = ?, updated_at = ?
        WHERE id = ?
      `).run(
        next.name,
        next.agentId,
        next.workspace,
        boolToInteger(next.workspaceTrusted),
        next.modelKey,
        next.thinkingLevel,
        next.prompt,
        next.recurrence,
        next.startAt,
        next.timeZone,
        next.status,
        next.nextRunAt,
        next.lastRunAt,
        next.lastStatus,
        next.lastError,
        next.lastSessionPath,
        next.createdAt,
        next.updatedAt,
        id,
      );
    });
    return this.getScheduledJob(id);
  }

  deleteScheduledJob(id) {
    return this.transaction(() => this.db.prepare("DELETE FROM scheduled_jobs WHERE id = ?").run(id).changes > 0);
  }

  getState() {
    const appState = this.db.prepare("SELECT setup_complete, execution_risk_accepted, active_agent_id, thinking_level FROM app_state WHERE id = 1").get();
    const agents = readRows(this.db.prepare(`
      SELECT id, name, initials, description, instructions, workspace, workspace_kind, workspace_trusted,
        default_model_key, thinking_level, archived, pinned
      FROM agents ORDER BY id
    `));
    const currentRows = readRows(this.db.prepare("SELECT agent_id, session_id FROM current_sessions"));
    const currentSessions = Object.fromEntries(currentRows.map((row) => [row.agent_id, sessionPathForId(row.session_id)]));
    return {
      setupComplete: integerToBool(appState?.setup_complete),
      executionRiskAccepted: integerToBool(appState?.execution_risk_accepted),
      activeAgentId: typeof appState?.active_agent_id === "string" ? appState.active_agent_id : null,
      thinkingLevel: appState?.thinking_level ?? "medium",
      agents: agents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        initials: agent.initials,
        description: agent.description,
        instructions: agent.instructions,
        workspace: agent.workspace,
        workspaceKind: agent.workspace_kind,
        workspaceTrusted: integerToBool(agent.workspace_trusted),
        defaultModelKey: agent.default_model_key,
        thinkingLevel: agent.thinking_level,
        archived: integerToBool(agent.archived),
        pinned: integerToBool(agent.pinned),
      })),
      currentSessions,
    };
  }

  saveState(state) {
    const agents = Array.isArray(state.agents) ? state.agents : [];
    const currentSessions = asRecord(state.currentSessions);
    this.transaction(() => {
      this.db.prepare("INSERT INTO app_state (id, setup_complete, execution_risk_accepted, active_agent_id, thinking_level) VALUES (1, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET setup_complete = excluded.setup_complete, execution_risk_accepted = excluded.execution_risk_accepted, active_agent_id = excluded.active_agent_id, thinking_level = excluded.thinking_level").run(
        boolToInteger(state.setupComplete),
        boolToInteger(state.executionRiskAccepted),
        typeof state.activeAgentId === "string" ? state.activeAgentId : null,
        typeof state.thinkingLevel === "string" ? state.thinkingLevel : "medium",
      );
      const keep = new Set();
      const upsert = this.db.prepare(`
        INSERT INTO agents (id, name, initials, description, instructions, workspace, workspace_kind, workspace_trusted, default_model_key, thinking_level, archived, pinned)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name, initials = excluded.initials, description = excluded.description, instructions = excluded.instructions,
          workspace = excluded.workspace, workspace_kind = excluded.workspace_kind,
          workspace_trusted = excluded.workspace_trusted, default_model_key = excluded.default_model_key,
          thinking_level = excluded.thinking_level, archived = excluded.archived, pinned = excluded.pinned
      `);
      for (const agent of agents) {
        if (!agent || typeof agent.id !== "string" || !agent.id) continue;
        keep.add(agent.id);
        upsert.run(
          agent.id,
          typeof agent.name === "string" ? agent.name : "Untitled agent",
          typeof agent.initials === "string" ? agent.initials : "AS",
          typeof agent.description === "string" ? agent.description : "",
          typeof agent.instructions === "string" ? agent.instructions : "",
          typeof agent.workspace === "string" ? agent.workspace : "",
          typeof agent.workspaceKind === "string" ? agent.workspaceKind : "app",
          boolToInteger(agent.workspaceTrusted),
          typeof agent.defaultModelKey === "string" ? agent.defaultModelKey : "",
          typeof agent.thinkingLevel === "string" ? agent.thinkingLevel : "medium",
          boolToInteger(agent.archived),
          boolToInteger(agent.pinned),
        );
      }
      if (keep.size === 0) this.db.exec("DELETE FROM agents");
      else {
        const ids = [...keep];
        const placeholders = ids.map(() => "?").join(",");
        this.db.prepare(`DELETE FROM agents WHERE id NOT IN (${placeholders})`).run(...ids);
      }
      this.db.exec("DELETE FROM current_sessions");
      const setCurrent = this.db.prepare("INSERT INTO current_sessions (agent_id, session_id) SELECT ?, id FROM sessions WHERE path = ? AND agent_id = ?");
      for (const [agentId, sessionPath] of Object.entries(currentSessions)) {
        if (typeof sessionPath !== "string") continue;
        setCurrent.run(agentId, sessionPath, agentId);
      }
    });
  }

  saveSession({ id, agentId, workspace, entries, sourcePath = null }) {
    const reason = validateEntries(entries);
    if (reason) throw new Error(`Cannot save session ${id}: ${reason}`);
    const sessionPath = sessionPathForId(id);
    const source = sourcePath ? sourcePathKey(sourcePath) : null;
    const header = entries[0];
    const createdAt = typeof header.timestamp === "string" ? header.timestamp : nowIso();
    const modifiedAt = typeof entries.at(-1)?.timestamp === "string" ? entries.at(-1).timestamp : createdAt;
    const messageCount = entries.filter((entry) => entry.type === "message").length;
    return this.transaction(() => {
      const byPath = this.db.prepare("SELECT id, source_path FROM sessions WHERE path = ?").get(sessionPath);
      const bySource = source ? this.db.prepare("SELECT id, path FROM sessions WHERE source_path = ?").get(source) : undefined;
      const existing = byPath ?? bySource;
      if (existing && existing.id !== id) throw new Error(`Session id collision for ${source || sessionPath}`);
      this.db.prepare(`
        INSERT INTO sessions (id, path, agent_id, workspace, source_path, header_json, created_at, modified_at, message_count, entry_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          path = excluded.path, agent_id = excluded.agent_id, workspace = excluded.workspace,
          source_path = excluded.source_path, header_json = excluded.header_json,
          created_at = excluded.created_at, modified_at = excluded.modified_at,
          message_count = excluded.message_count, entry_count = excluded.entry_count
      `).run(id, sessionPath, agentId, workspace, source, JSON.stringify(header), createdAt, modifiedAt, messageCount, entries.length);
      this.db.prepare("DELETE FROM session_entries WHERE session_id = ?").run(id);
      const insertEntry = this.db.prepare("INSERT INTO session_entries (session_id, ordinal, entry_id, entry_json) VALUES (?, ?, ?, ?)");
      entries.forEach((entry, ordinal) => insertEntry.run(id, ordinal, entry.id, JSON.stringify(entry)));
      const row = this.db.prepare("SELECT entry_count, COUNT(*) AS actual_count, header_json FROM sessions JOIN session_entries ON session_entries.session_id = sessions.id WHERE sessions.id = ? GROUP BY sessions.id").get(id);
      if (!row || row.actual_count !== entries.length || row.header_json !== JSON.stringify(header)) throw new Error(`Session validation failed for ${id}`);
      return sessionPath;
    });
  }

  appendSessionEntry(sessionId, entry) {
    if (!validSessionEntry(entry)) throw new Error(`Cannot append invalid session entry ${entry?.id}`);
    return this.transaction(() => {
      const session = this.db.prepare("SELECT id, entry_count, message_count FROM sessions WHERE id = ?").get(sessionId);
      if (!session) throw new Error(`Session ${sessionId} does not exist`);
      if (entry.parentId !== null) {
        const parent = this.db.prepare("SELECT 1 FROM session_entries WHERE session_id = ? AND entry_id = ?").get(sessionId, entry.parentId);
        if (!parent) throw new Error(`Cannot append session entry ${entry.id}: missing parent ${entry.parentId}`);
      }
      const ordinal = Number(session.entry_count);
      const inserted = this.db.prepare("INSERT OR IGNORE INTO session_entries (session_id, ordinal, entry_id, entry_json) VALUES (?, ?, ?, ?)").run(sessionId, ordinal, entry.id, JSON.stringify(entry));
      if (inserted.changes > 0) {
        const messageCount = Number(session.message_count) + (entry.type === "message" ? 1 : 0);
        this.db.prepare("UPDATE sessions SET modified_at = ?, entry_count = ?, message_count = ? WHERE id = ?").run(entry.timestamp, ordinal + 1, messageCount, sessionId);
      }
      return inserted.changes > 0;
    });
  }

  getSessionEntries(sessionPathOrId) {
    const id = sessionIdFromPath(sessionPathOrId) ?? sessionPathOrId;
    const rows = readRows(this.db.prepare("SELECT entry_json FROM session_entries WHERE session_id = ? ORDER BY ordinal"), id);
    return rows.map((row) => JSON.parse(row.entry_json));
  }

  getSession(sessionPathOrId) {
    const id = sessionIdFromPath(sessionPathOrId) ?? sessionPathOrId;
    const row = this.db.prepare("SELECT id, path, agent_id, workspace, source_path, header_json, created_at, modified_at, message_count, entry_count FROM sessions WHERE id = ? OR path = ?").get(id, sessionPathOrId);
    return row ? { ...row } : null;
  }

  getSessionBySourcePath(sourcePath) {
    const source = sourcePathKey(sourcePath);
    const row = this.db.prepare("SELECT id, path, agent_id, workspace, source_path, header_json, created_at, modified_at, message_count, entry_count FROM sessions WHERE source_path = ?").get(source);
    return row ? { ...row } : null;
  }

  listSessions(agentId = null, workspace = null) {
    const clauses = [];
    const params = [];
    if (agentId) {
      clauses.push("agent_id = ?");
      params.push(agentId);
    }
    if (workspace) {
      clauses.push("workspace = ?");
      params.push(workspace);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    return readRows(this.db.prepare(`SELECT id, path, agent_id, workspace, created_at, modified_at, message_count, entry_count FROM sessions ${where} ORDER BY modified_at DESC`), ...params).map((row) => ({
      path: row.path,
      id: row.id,
      agentId: row.agent_id,
      workspace: row.workspace,
      created: row.created_at,
      modified: row.modified_at,
      messageCount: row.message_count,
      entryCount: row.entry_count,
    }));
  }

  getCurrentSession(agentId) {
    const row = this.db.prepare("SELECT session_id FROM current_sessions WHERE agent_id = ?").get(agentId);
    return row ? sessionPathForId(row.session_id) : null;
  }

  setCurrentSession(agentId, sessionPath) {
    const sessionId = sessionIdFromPath(sessionPath);
    if (!sessionId) throw new Error("Invalid SQLite session path.");
    this.transaction(() => {
      const session = this.db.prepare("SELECT agent_id FROM sessions WHERE id = ?").get(sessionId);
      if (!session || session.agent_id !== agentId) throw new Error("Session is not in this agent workspace.");
      this.db.prepare("INSERT INTO current_sessions (agent_id, session_id) VALUES (?, ?) ON CONFLICT(agent_id) DO UPDATE SET session_id = excluded.session_id").run(agentId, sessionId);
    });
  }

  deleteSession(sessionPath) {
    const sessionId = sessionIdFromPath(sessionPath);
    if (!sessionId) throw new Error("Invalid SQLite session path.");
    return this.transaction(() => {
      this.db.prepare("DELETE FROM preferences WHERE key IN (?, ?)").run(`pi-bot.workspace-panel:${sessionPath}`, `pi-bot.workspace-panel:${sessionId}`);
      return this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId).changes > 0;
    });
  }

  deleteAgent(agentId) {
    return this.transaction(() => {
      const paths = readRows(this.db.prepare("SELECT path, id FROM sessions WHERE agent_id = ?"), agentId);
      const deletePreferences = this.db.prepare("DELETE FROM preferences WHERE key IN (?, ?)");
      deletePreferences.run(`pi-bot.workspace-panel:${agentId}`, `pi-bot.workspace-panel:${agentId}`);
      for (const session of paths) deletePreferences.run(`pi-bot.workspace-panel:${session.path}`, `pi-bot.workspace-panel:${session.id}`);
      return this.db.prepare("DELETE FROM agents WHERE id = ?").run(agentId).changes > 0;
    });
  }

  createTeamChat({ id = randomUUID(), name = "Connected Team", members, runLimit = 12 }) {
    if (!Array.isArray(members) || members.length < 2) throw new Error("A Connected Team needs at least two members.");
    const uniqueMembers = members.filter((member, index, list) => member && typeof member.agentId === "string" && list.findIndex((item) => item?.agentId === member.agentId) === index);
    if (uniqueMembers.length !== members.length) throw new Error("A Connected Team cannot contain duplicate members.");
    const createdAt = nowIso();
    const safeLimit = Number.isInteger(runLimit) ? Math.min(50, Math.max(1, runLimit)) : 12;
    this.transaction(() => {
      this.db.prepare("INSERT INTO team_chats (id, name, run_status, run_limit, created_at, updated_at) VALUES (?, ?, 'idle', ?, ?, ?)").run(id, String(name || "Connected Team").trim().slice(0, 120) || "Connected Team", safeLimit, createdAt, createdAt);
      const insert = this.db.prepare(`
        INSERT INTO team_chat_members (
          team_chat_id, agent_id, position, name_snapshot, initials_snapshot,
          workspace_snapshot, workspace_kind_snapshot, workspace_trusted_snapshot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      uniqueMembers.forEach((member, position) => insert.run(
        id,
        member.agentId,
        position,
        String(member.name ?? "Unavailable agent").slice(0, 120),
        String(member.initials ?? "?").slice(0, 16),
        String(member.workspace ?? ""),
        String(member.workspaceKind ?? "external"),
        boolToInteger(member.workspaceTrusted),
      ));
    });
    return this.getTeamChat(id);
  }

  listTeamChats() {
    return readRows(this.db.prepare(`
      SELECT id, name, run_status, active_run_id, active_agent_id, pending_agent_id,
        run_limit, created_at, updated_at
      FROM team_chats ORDER BY updated_at DESC, name
    `)).map((row) => ({
      id: row.id,
      name: row.name,
      runStatus: row.run_status,
      activeRunId: row.active_run_id,
      activeAgentId: row.active_agent_id,
      pendingAgentId: row.pending_agent_id,
      runLimit: Number(row.run_limit),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      members: this.listTeamMembers(row.id),
    }));
  }

  getTeamChat(id) {
    const row = this.db.prepare(`
      SELECT id, name, run_status, active_run_id, active_agent_id, pending_agent_id,
        run_limit, created_at, updated_at
      FROM team_chats WHERE id = ?
    `).get(id);
    if (!row) return null;
    const chat = {
      id: row.id,
      name: row.name,
      runStatus: row.run_status,
      activeRunId: row.active_run_id,
      activeAgentId: row.active_agent_id,
      pendingAgentId: row.pending_agent_id,
      runLimit: Number(row.run_limit),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      members: this.listTeamMembers(id),
      events: this.listTeamEvents(id),
      latestRun: this.getLatestTeamRun(id),
    };
    return chat;
  }

  updateTeamChat(id, changes = {}) {
    const current = this.getTeamChat(id);
    if (!current) throw new Error("Team chat was not found.");
    const name = typeof changes.name === "string" ? changes.name.trim().slice(0, 120) : current.name;
    const runLimit = Number.isInteger(changes.runLimit) ? Math.min(50, Math.max(1, changes.runLimit)) : current.runLimit;
    this.transaction(() => {
      this.db.prepare("UPDATE team_chats SET name = ?, run_limit = ?, updated_at = ? WHERE id = ?").run(name || "Connected Team", runLimit, nowIso(), id);
    });
    return this.getTeamChat(id);
  }

  listTeamMembers(teamChatId) {
    return readRows(this.db.prepare(`
      SELECT team_chat_id, agent_id, position, name_snapshot, initials_snapshot,
        workspace_snapshot, workspace_kind_snapshot, workspace_trusted_snapshot
      FROM team_chat_members WHERE team_chat_id = ? ORDER BY position
    `), teamChatId).map((row) => ({
      teamChatId: row.team_chat_id,
      agentId: row.agent_id,
      position: Number(row.position),
      name: row.name_snapshot,
      initials: row.initials_snapshot,
      workspace: row.workspace_snapshot,
      workspaceKind: row.workspace_kind_snapshot,
      workspaceTrusted: integerToBool(row.workspace_trusted_snapshot),
    }));
  }

  replaceTeamMembers(teamChatId, members) {
    if (!Array.isArray(members) || members.length < 2) throw new Error("A Connected Team needs at least two members.");
    const uniqueMembers = members.filter((member, index, list) => member && typeof member.agentId === "string" && list.findIndex((item) => item?.agentId === member.agentId) === index);
    if (uniqueMembers.length !== members.length) throw new Error("A Connected Team cannot contain duplicate members.");
    this.transaction(() => {
      this.db.prepare("DELETE FROM team_chat_members WHERE team_chat_id = ?").run(teamChatId);
      const insert = this.db.prepare(`
        INSERT INTO team_chat_members (
          team_chat_id, agent_id, position, name_snapshot, initials_snapshot,
          workspace_snapshot, workspace_kind_snapshot, workspace_trusted_snapshot
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      members.forEach((member, position) => insert.run(
        teamChatId,
        member.agentId,
        position,
        String(member.name ?? "Unavailable agent").slice(0, 120),
        String(member.initials ?? "?").slice(0, 16),
        String(member.workspace ?? ""),
        String(member.workspaceKind ?? "external"),
        boolToInteger(member.workspaceTrusted),
      ));
      this.db.prepare("UPDATE team_chats SET updated_at = ? WHERE id = ?").run(nowIso(), teamChatId);
    });
    return this.listTeamMembers(teamChatId);
  }

  appendTeamEvent(event) {
    const id = event.id || randomUUID();
    const createdAt = event.createdAt || nowIso();
    return this.transaction(() => {
      const next = this.db.prepare("SELECT COALESCE(MAX(ordinal), -1) + 1 AS ordinal FROM team_chat_events WHERE team_chat_id = ?").get(event.teamChatId);
      const ordinal = Number(next?.ordinal ?? 0);
      this.db.prepare(`
        INSERT INTO team_chat_events (
          id, team_chat_id, ordinal, run_id, type, agent_id, sender_name, sender_initials,
          recipient_agent_id, recipient_name, recipient_initials, body, request, reason,
          status, metadata_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        event.teamChatId,
        ordinal,
        event.runId ?? null,
        event.type || "system",
        event.agentId ?? null,
        event.senderName ?? null,
        event.senderInitials ?? null,
        event.recipientAgentId ?? null,
        event.recipientName ?? null,
        event.recipientInitials ?? null,
        typeof event.body === "string" ? event.body : "",
        event.request ?? null,
        event.reason ?? null,
        event.status ?? null,
        event.metadata ? JSON.stringify(event.metadata) : null,
        createdAt,
      );
      this.db.prepare("UPDATE team_chats SET updated_at = ? WHERE id = ?").run(createdAt, event.teamChatId);
      return this.getTeamEvent(id);
    });
  }

  getTeamEvent(id) {
    const row = this.db.prepare("SELECT * FROM team_chat_events WHERE id = ?").get(id);
    return row ? this.mapTeamEvent(row) : null;
  }

  updateTeamEvent(id, changes = {}) {
    const current = this.getTeamEvent(id);
    if (!current) return null;
    this.transaction(() => {
      this.db.prepare(`
        UPDATE team_chat_events SET body = ?, status = ?, metadata_json = ? WHERE id = ?
      `).run(
        typeof changes.body === "string" ? changes.body : current.body,
        changes.status ?? current.status,
        changes.metadata ? JSON.stringify(changes.metadata) : (current.metadata ? JSON.stringify(current.metadata) : null),
        id,
      );
      this.db.prepare("UPDATE team_chats SET updated_at = ? WHERE id = ?").run(nowIso(), current.teamChatId);
    });
    return this.getTeamEvent(id);
  }

  mapTeamEvent(row) {
    let metadata = null;
    try { metadata = row.metadata_json ? JSON.parse(row.metadata_json) : null; } catch { metadata = null; }
    return {
      id: row.id,
      teamChatId: row.team_chat_id,
      ordinal: Number(row.ordinal),
      runId: row.run_id,
      type: row.type,
      agentId: row.agent_id,
      sender: row.sender_name ? { agentId: row.agent_id, name: row.sender_name, initials: row.sender_initials ?? "?" } : null,
      recipient: row.recipient_agent_id ? { agentId: row.recipient_agent_id, name: row.recipient_name ?? "Unavailable agent", initials: row.recipient_initials ?? "?" } : null,
      body: row.body,
      request: row.request,
      reason: row.reason,
      status: row.status,
      metadata,
      createdAt: row.created_at,
    };
  }

  listTeamEvents(teamChatId) {
    return readRows(this.db.prepare("SELECT * FROM team_chat_events WHERE team_chat_id = ? ORDER BY ordinal"), teamChatId).map((row) => this.mapTeamEvent(row));
  }

  createTeamRun({ id = randomUUID(), teamChatId, goal, runLimit = 12, firstAgentId = null }) {
    const startedAt = nowIso();
    const safeLimit = Number.isInteger(runLimit) ? Math.min(50, Math.max(1, runLimit)) : 12;
    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO team_chat_runs (
          id, team_chat_id, status, goal, active_agent_id, pending_agent_id,
          turn_count, run_limit, stop_reason, started_at, finished_at, updated_at
        ) VALUES (?, ?, 'running', ?, ?, ?, 0, ?, NULL, ?, NULL, ?)
      `).run(id, teamChatId, String(goal), firstAgentId, firstAgentId, safeLimit, startedAt, startedAt);
      this.db.prepare(`
        UPDATE team_chats SET run_status = 'running', active_run_id = ?, active_agent_id = ?, pending_agent_id = ?, run_limit = ?, updated_at = ? WHERE id = ?
      `).run(id, firstAgentId, firstAgentId, safeLimit, startedAt, teamChatId);
    });
    return this.getTeamRun(id);
  }

  updateTeamRun(id, changes = {}) {
    const current = this.getTeamRun(id);
    if (!current) throw new Error("Team run was not found.");
    const next = { ...current, ...changes, updatedAt: nowIso() };
    const finishedAt = ["running", "queued"].includes(next.status) ? null : (next.finishedAt || next.updatedAt);
    this.transaction(() => {
      this.db.prepare(`
        UPDATE team_chat_runs SET status = ?, goal = ?, active_agent_id = ?, pending_agent_id = ?,
          turn_count = ?, run_limit = ?, stop_reason = ?, started_at = ?, finished_at = ?, updated_at = ?
        WHERE id = ?
      `).run(next.status, next.goal, next.activeAgentId, next.pendingAgentId, next.turnCount, next.runLimit, next.stopReason, next.startedAt, finishedAt, next.updatedAt, id);
      this.db.prepare(`
        UPDATE team_chats SET run_status = ?, active_run_id = ?, active_agent_id = ?, pending_agent_id = ?, updated_at = ? WHERE id = ?
      `).run(next.status, ["running", "queued"].includes(next.status) ? id : null, next.activeAgentId, next.pendingAgentId, next.updatedAt, next.teamChatId);
    });
    return this.getTeamRun(id);
  }

  getTeamRun(id) {
    const row = this.db.prepare("SELECT * FROM team_chat_runs WHERE id = ?").get(id);
    return row ? this.mapTeamRun(row) : null;
  }

  getLatestTeamRun(teamChatId) {
    const row = this.db.prepare("SELECT * FROM team_chat_runs WHERE team_chat_id = ? ORDER BY updated_at DESC LIMIT 1").get(teamChatId);
    return row ? this.mapTeamRun(row) : null;
  }

  mapTeamRun(row) {
    return {
      id: row.id,
      teamChatId: row.team_chat_id,
      status: row.status,
      goal: row.goal,
      activeAgentId: row.active_agent_id,
      pendingAgentId: row.pending_agent_id,
      turnCount: Number(row.turn_count),
      runLimit: Number(row.run_limit),
      stopReason: row.stop_reason,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      updatedAt: row.updated_at,
    };
  }

  createTeamSession({ teamChatId, agentId, sessionId, workspace, entries }) {
    const sessionPath = teamSessionPathForId(teamChatId, agentId);
    const createdAt = nowIso();
    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO team_member_sessions (team_chat_id, agent_id, session_id, session_path, workspace, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(teamChatId, agentId, sessionId, sessionPath, workspace, createdAt, createdAt);
      const insertEntry = this.db.prepare("INSERT INTO team_session_entries (team_chat_id, agent_id, session_id, ordinal, entry_id, entry_json) VALUES (?, ?, ?, ?, ?, ?)");
      (entries ?? []).forEach((entry, ordinal) => insertEntry.run(teamChatId, agentId, sessionId, ordinal, entry.id, JSON.stringify(entry)));
    });
    return { teamChatId, agentId, sessionId, sessionPath, workspace };
  }

  getTeamSession(teamChatId, agentId) {
    const row = this.db.prepare("SELECT team_chat_id, agent_id, session_id, session_path, workspace, created_at, updated_at FROM team_member_sessions WHERE team_chat_id = ? AND agent_id = ?").get(teamChatId, agentId);
    return row ? { teamChatId: row.team_chat_id, agentId: row.agent_id, sessionId: row.session_id, sessionPath: row.session_path, workspace: row.workspace, createdAt: row.created_at, updatedAt: row.updated_at } : null;
  }

  deleteTeamSession(teamChatId, agentId) {
    return this.transaction(() => this.db.prepare("DELETE FROM team_member_sessions WHERE team_chat_id = ? AND agent_id = ?").run(teamChatId, agentId).changes > 0);
  }

  listTeamSessions(teamChatId) {
    return readRows(this.db.prepare("SELECT team_chat_id, agent_id, session_id, session_path, workspace, created_at, updated_at FROM team_member_sessions WHERE team_chat_id = ? ORDER BY agent_id"), teamChatId).map((row) => ({ teamChatId: row.team_chat_id, agentId: row.agent_id, sessionId: row.session_id, sessionPath: row.session_path, workspace: row.workspace, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  getTeamSessionEntries(teamChatId, agentId) {
    return readRows(this.db.prepare("SELECT entry_json FROM team_session_entries WHERE team_chat_id = ? AND agent_id = ? ORDER BY ordinal"), teamChatId, agentId).map((row) => JSON.parse(row.entry_json));
  }

  appendTeamSessionEntry(teamChatId, agentId, entry) {
    return this.transaction(() => {
      const session = this.getTeamSession(teamChatId, agentId);
      if (!session) throw new Error("Team member session does not exist.");
      const next = this.db.prepare("SELECT COALESCE(MAX(ordinal), -1) + 1 AS ordinal FROM team_session_entries WHERE team_chat_id = ? AND agent_id = ?").get(teamChatId, agentId);
      const inserted = this.db.prepare("INSERT OR IGNORE INTO team_session_entries (team_chat_id, agent_id, session_id, ordinal, entry_id, entry_json) VALUES (?, ?, ?, ?, ?, ?)").run(teamChatId, agentId, session.sessionId, Number(next?.ordinal ?? 0), entry.id, JSON.stringify(entry));
      if (inserted.changes > 0) this.db.prepare("UPDATE team_member_sessions SET updated_at = ? WHERE team_chat_id = ? AND agent_id = ?").run(entry.timestamp || nowIso(), teamChatId, agentId);
      return inserted.changes > 0;
    });
  }

  markActiveTeamRunsInterrupted() {
    const runs = readRows(this.db.prepare("SELECT id, team_chat_id FROM team_chat_runs WHERE status IN ('running', 'queued')"));
    if (runs.length === 0) return 0;
    this.transaction(() => {
      const timestamp = nowIso();
      this.db.prepare("UPDATE team_chat_runs SET status = 'interrupted', stop_reason = 'Pi Bot closed before the run finished.', finished_at = ?, updated_at = ? WHERE status IN ('running', 'queued')").run(timestamp, timestamp);
      this.db.prepare("UPDATE team_chats SET run_status = 'interrupted', active_run_id = NULL, active_agent_id = NULL, updated_at = ? WHERE run_status IN ('running', 'queued')").run(timestamp);
    });
    return runs.length;
  }

  deleteTeamChat(teamChatId) {
    return this.transaction(() => this.db.prepare("DELETE FROM team_chats WHERE id = ?").run(teamChatId).changes > 0);
  }
}

export function createAppDatabase(file) {
  return new AppDatabase(file);
}

function collectJsonlFiles(directory, files) {
  if (!existsSync(directory)) return;
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) collectJsonlFiles(item, files);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.add(normalizedPath(item));
  }
}

function collectPendingFiles(directory, files) {
  if (!existsSync(directory)) return;
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) collectPendingFiles(item, files);
    else if (entry.isFile() && entry.name.endsWith(".jsonl.pending")) files.add(normalizedPath(item));
  }
}

function collectLegacyReferences(settings) {
  const paths = new Set();
  const collect = (value) => {
    if (typeof value === "string" && value.endsWith(".jsonl")) paths.add(value);
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (key.endsWith(".jsonl")) paths.add(key);
        collect(child);
      }
    }
  };
  collect(settings?.agentSessions);
  collect(settings?.sessionAgents);
  collect(settings?.currentSessions);
  collect(settings?.sessionRecords);
  return paths;
}

function settingsAgentEntries(settings) {
  if (Array.isArray(settings?.agents)) return settings.agents.map((agent) => [agent?.id, agent]);
  if (settings?.agents && typeof settings.agents === "object") return Object.entries(settings.agents);
  return [];
}

function validWorkspace(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function workspaceForAgent(agentId, agents, fallbackWorkspace, header) {
  return validWorkspace(fallbackWorkspace)
    ? fallbackWorkspace
    : validWorkspace(header?.cwd)
      ? header.cwd
      : agents[agentId].workspace;
}

function resolveSessionContext(file, settings, agents, defaultAgentId, sessionsRoot, header) {
  const records = asRecord(settings?.sessionRecords);
  const normalized = normalizedPath(file);
  const record = Object.entries(records).find(([recordPath]) => normalizedPath(recordPath) === normalized)?.[1];
  if (record && typeof record === "object" && typeof record.agentId === "string" && agents[record.agentId]) {
    return { agentId: record.agentId, workspace: workspaceForAgent(record.agentId, agents, record.workspace, header) };
  }
  const legacyAgent = Object.entries(asRecord(settings?.sessionAgents)).find(([sessionPath]) => sessionPath.endsWith(".jsonl") && normalizedPath(sessionPath) === normalized)?.[1];
  if (typeof legacyAgent === "string" && agents[legacyAgent]) return { agentId: legacyAgent, workspace: workspaceForAgent(legacyAgent, agents, null, header) };
  const currentSessions = asRecord(settings?.currentSessions);
  const current = Object.entries(currentSessions).find(([, currentPath]) => typeof currentPath === "string" && normalizedPath(currentPath) === normalized)?.[0];
  if (current && agents[current]) return { agentId: current, workspace: workspaceForAgent(current, agents, null, header) };
  const relative = path.relative(sessionsRoot, file).split(path.sep);
  if (relative.length >= 3 && agents[relative[0]]) return { agentId: relative[0], workspace: workspaceForAgent(relative[0], agents, null, header) };
  const agent = agents[defaultAgentId];
  return { agentId: defaultAgentId, workspace: workspaceForAgent(defaultAgentId, agents, null, header) };
}

function isCurrentLegacySession(file, settings) {
  const legacySessions = asRecord(settings?.agentSessions);
  const activeAgentId = typeof settings?.activeAgentId === "string" ? settings.activeAgentId : null;
  const direct = activeAgentId && typeof legacySessions[activeAgentId] === "string" ? legacySessions[activeAgentId] : null;
  const workspaceScoped = typeof settings?.workspace === "string"
    && asRecord(legacySessions[settings.workspace])[activeAgentId]
    && typeof asRecord(legacySessions[settings.workspace])[activeAgentId] === "string"
    ? asRecord(legacySessions[settings.workspace])[activeAgentId]
    : null;
  const candidates = [direct, workspaceScoped, ...Object.values(asRecord(settings?.currentSessions))].filter((value) => typeof value === "string");
  return candidates.some((candidate) => normalizedPath(candidate) === normalizedPath(file));
}

function entriesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function entriesPrefix(prefix, full) {
  return prefix.length <= full.length && prefix.every((entry, index) => entriesEqual(entry, full[index]));
}

function sameSessionContext(left, right) {
  return left.agentId === right.agentId && left.workspace === right.workspace;
}

export function migrateLegacyStorage(database, options) {
  if (database.getMigrationStatus().status === "complete") {
    return { status: "complete", importedSessions: 0, failedPaths: [], settingsError: null };
  }
  const {
    settingsPath,
    sessionsRoot,
    defaultAgentId,
    defaultAgent,
    normalizeAgent,
    recoverPending = null,
  } = options;
  const normalizedSessionsRoot = normalizedPath(sessionsRoot);
  const existingState = database.getState();
  let settings = {};
  let settingsError = null;
  if (existsSync(settingsPath)) {
    try {
      const parsed = JSON.parse(readFileSync(settingsPath, "utf8"));
      settings = asRecord(parsed);
    } catch (error) {
      settingsError = error instanceof Error ? error.message : "malformed settings";
    }
  }
  const recover = recoverPending ?? ((directory) => recoverPendingSessions(directory));
  const recoveryRoots = new Set([sessionsRoot]);
  for (const file of collectLegacyReferences(settings)) recoveryRoots.add(path.dirname(file));
  for (const directory of recoveryRoots) recover(directory, settings);
  const agents = Object.fromEntries(existingState.agents.map((agent) => [agent.id, agent]));
  const configuredEntries = settingsAgentEntries(settings);
  for (const [rawId, value] of configuredEntries) {
    if (typeof rawId !== "string" || !rawId || !value || typeof value !== "object") continue;
    agents[rawId] = normalizeAgent(rawId, value, rawId === defaultAgentId ? defaultAgent : {});
  }
  if (Object.keys(agents).length === 0) {
    if (typeof settings.workspace === "string" && settings.workspace) {
      agents[defaultAgentId] = normalizeAgent(defaultAgentId, {
        ...defaultAgent,
        workspace: settings.workspace,
        workspaceKind: "external",
        defaultModelKey: settings.modelKey,
        thinkingLevel: settings.thinkingLevel,
      }, defaultAgent);
    } else {
      agents[defaultAgentId] = defaultAgent;
    }
  }
  const setupComplete = typeof settings.setupComplete === "boolean" ? settings.setupComplete : existingState.setupComplete;
  const executionRiskAccepted = typeof settings.executionRiskAccepted === "boolean" ? settings.executionRiskAccepted : existingState.executionRiskAccepted;
  const activeAgentId = typeof settings.activeAgentId === "string" && agents[settings.activeAgentId]
    ? settings.activeAgentId
    : existingState.activeAgentId && agents[existingState.activeAgentId] ? existingState.activeAgentId : defaultAgentId;
  const thinkingLevel = typeof settings.thinkingLevel === "string" ? settings.thinkingLevel : existingState.thinkingLevel;
  const currentSessions = { ...existingState.currentSessions };
  database.saveState({ setupComplete, executionRiskAccepted, activeAgentId, thinkingLevel, agents: Object.values(agents), currentSessions: settingsError ? currentSessions : {} });

  if (settingsError) {
    database.setMigrationStatus("pending", [], settingsError);
    return { status: "pending", importedSessions: 0, failedPaths: [], settingsError };
  }

  const files = new Set();
  collectJsonlFiles(normalizedSessionsRoot, files);
  for (const file of collectLegacyReferences(settings)) if (existsSync(file)) files.add(normalizedPath(file));
  const failedPaths = [];
  const pendingFiles = new Set();
  collectPendingFiles(normalizedSessionsRoot, pendingFiles);
  for (const file of collectLegacyReferences(settings)) collectPendingFiles(path.dirname(file), pendingFiles);
  for (const file of pendingFiles) {
    const parsed = parseLegacySessionFile(file);
    if (!parsed.ok) failedPaths.push(`${file}: ${parsed.reason}`);
    else failedPaths.push(`${file}: pending recovery requires matching source identity`);
  }
  const parsedFiles = [];
  for (const file of [...files].sort()) {
    const parsed = parseLegacySessionFile(file);
    if (!parsed.ok) {
      failedPaths.push(`${file}: ${parsed.reason}`);
      continue;
    }
    parsedFiles.push({
      file,
      parsed,
      context: resolveSessionContext(file, settings, agents, defaultAgentId, normalizedSessionsRoot, parsed.header),
    });
  }
  const groupedById = new Map();
  for (const candidate of parsedFiles) {
    const group = groupedById.get(candidate.parsed.header.id) ?? [];
    group.push(candidate);
    groupedById.set(candidate.parsed.header.id, group);
  }
  const candidates = [];
  for (const [sessionId, group] of groupedById) {
    const first = group[0];
    if (group.some((candidate) => !sameSessionContext(first.context, candidate.context))) {
      for (const candidate of group) failedPaths.push(`${candidate.file}: conflicting session context for ${sessionId}`);
      continue;
    }
    const existingSource = group.find((candidate) => database.getSessionBySourcePath(candidate.file));
    const ordered = [...group].sort((left, right) => right.parsed.entries.length - left.parsed.entries.length || left.file.localeCompare(right.file));
    const best = existingSource ?? ordered[0];
    const equivalent = group.every((candidate) => entriesEqual(candidate.parsed.entries, best.parsed.entries));
    const completePrefix = group.every((candidate) => entriesPrefix(candidate.parsed.entries, best.parsed.entries));
    if (!equivalent && !completePrefix) {
      for (const candidate of group) failedPaths.push(`${candidate.file}: conflicting transcript for session ${sessionId}`);
      continue;
    }
    candidates.push({ ...best, current: group.some((candidate) => isCurrentLegacySession(candidate.file, settings)) });
  }

  let importedSessions = 0;
  for (const candidate of candidates) {
    const { file, parsed, context, current } = candidate;
    const existing = database.getSessionBySourcePath(file);
    if (existing) {
      if (existing.id !== parsed.header.id) failedPaths.push(`${file}: source path already belongs to session ${existing.id}`);
      else if (entriesPrefix(parsed.entries, database.getSessionEntries(existing.path))) {
        if (current) currentSessions[context.agentId] = existing.path;
      } else failedPaths.push(`${file}: imported source no longer matches its SQLite session`);
      continue;
    }
    const existingId = database.getSession(sessionPathForId(parsed.header.id));
    if (existingId) {
      if (entriesPrefix(parsed.entries, database.getSessionEntries(existingId.path))) {
        if (current) currentSessions[context.agentId] = existingId.path;
      } else failedPaths.push(`${file}: session id already belongs to another source`);
      continue;
    }
    try {
      const sessionPath = database.saveSession({
        id: parsed.header.id,
        agentId: context.agentId,
        workspace: context.workspace,
        entries: parsed.entries,
        sourcePath: file,
      });
      importedSessions++;
      if (current) currentSessions[context.agentId] = sessionPath;
    } catch (error) {
      failedPaths.push(`${file}: ${error instanceof Error ? error.message : "could not import"}`);
    }
  }
  database.saveState({ setupComplete, executionRiskAccepted, activeAgentId, thinkingLevel, agents: Object.values(agents), currentSessions });
  const settingsWasValid = !settingsError;
  const status = settingsWasValid && failedPaths.length === 0 ? "complete" : "pending";
  database.setMigrationStatus(status, failedPaths, settingsError);
  return { status, importedSessions, failedPaths, settingsError };
}
