import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  copyLegacySessionFiles,
  legacySessionPaths,
  pendingSessionPath,
  recoverPendingSessions,
  savePendingSession,
} from "../electron/session-persistence.mjs";

function withTempDir(run) {
  const directory = mkdtempSync(path.join(tmpdir(), "pi-bot-session-test-"));
  try {
    return run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function sessionEntries() {
  return [
    { type: "session", version: 3, id: "session-1", timestamp: "2026-08-14T00:00:00.000Z", cwd: "/workspace" },
    { type: "session_info", id: "title-1", parentId: null, timestamp: "2026-08-14T00:00:00.000Z", name: "Keep my first prompt" },
    { type: "message", id: "user-1", parentId: "title-1", timestamp: "2026-08-14T00:00:01.000Z", message: { role: "user", content: [{ type: "text", text: "Keep my first prompt" }], timestamp: 1786665601000 } },
  ];
}

test("recovers a first prompt that has no assistant response yet", () => withTempDir((directory) => {
  const sessionFile = path.join(directory, "sessions", "first.jsonl");
  const entries = sessionEntries();

  assert.equal(savePendingSession(sessionFile, entries), true);
  assert.equal(existsSync(sessionFile), false);
  assert.equal(existsSync(pendingSessionPath(sessionFile)), true);

  assert.deepEqual(recoverPendingSessions(path.join(directory, "sessions")), { recovered: 1, discarded: 0 });
  assert.equal(existsSync(sessionFile), true);
  assert.deepEqual(readFileSync(sessionFile, "utf8").trim().split("\n").map(JSON.parse), entries);
}));

test("keeps a completed session when its stale recovery copy remains", () => withTempDir((directory) => {
  const sessionFile = path.join(directory, "sessions", "completed.jsonl");
  const entries = sessionEntries();
  mkdirSync(path.dirname(sessionFile), { recursive: true });
  writeFileSync(sessionFile, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n${JSON.stringify({ type: "message", id: "assistant-1", parentId: "user-1", timestamp: "2026-08-14T00:00:02.000Z", message: { role: "assistant", content: [{ type: "text", text: "Done" }], timestamp: 1786665602000 } })}\n`);
  savePendingSession(sessionFile, entries);

  assert.deepEqual(recoverPendingSessions(path.join(directory, "sessions")), { recovered: 0, discarded: 1 });
  assert.equal(readFileSync(sessionFile, "utf8").trim().split("\n").length, 4);
}));

test("restores a newer recovery copy over an earlier persisted session", () => withTempDir((directory) => {
  const sessionFile = path.join(directory, "sessions", "interrupted.jsonl");
  const entries = sessionEntries();
  mkdirSync(path.dirname(sessionFile), { recursive: true });
  writeFileSync(sessionFile, `${JSON.stringify(entries[0])}\n`);
  savePendingSession(sessionFile, entries);

  assert.deepEqual(recoverPendingSessions(path.join(directory, "sessions")), { recovered: 1, discarded: 0 });
  assert.deepEqual(readFileSync(sessionFile, "utf8").trim().split("\n").map(JSON.parse), entries);
}));

test("copies legacy session files once without overwriting a newer app-owned copy", () => withTempDir((directory) => {
  const source = path.join(directory, "legacy.jsonl");
  const targetDirectory = path.join(directory, "sessions");
  writeFileSync(source, "legacy-session\n");

  assert.deepEqual(copyLegacySessionFiles([source], targetDirectory), { copied: [path.join(targetDirectory, "legacy.jsonl")], skipped: [] });
  writeFileSync(source, "changed-legacy-session\n");

  assert.deepEqual(copyLegacySessionFiles([source], targetDirectory), { copied: [], skipped: [source] });
  assert.equal(readFileSync(path.join(targetDirectory, "legacy.jsonl"), "utf8"), "legacy-session\n");
}));

test("reads only known legacy session paths from pre-v2 settings", () => {
  const legacy = {
    workspace: "/project",
    agentSessions: { "/project": { planner: "/pi/old-session.jsonl" } },
    sessionAgents: {
      "/pi/old-session.jsonl": "planner",
      "/pi/another-session.jsonl": "coder",
    },
  };

  assert.deepEqual(legacySessionPaths(legacy), ["/pi/another-session.jsonl", "/pi/old-session.jsonl"]);
  assert.deepEqual(legacySessionPaths({ agentSessions: { planner: "/pi/current-session.jsonl" } }), ["/pi/current-session.jsonl"]);
  assert.deepEqual(legacySessionPaths({ schemaVersion: 2, sessionRecords: {} }), []);
});

test("keeps a malformed pending copy for a later migration retry", () => withTempDir((directory) => {
  const sessionFile = path.join(directory, "sessions", "malformed.jsonl");
  mkdirSync(path.dirname(sessionFile), { recursive: true });
  writeFileSync(pendingSessionPath(sessionFile), `{"type":"session","id":"broken"}\nnot-json\n`);

  assert.deepEqual(recoverPendingSessions(path.join(directory, "sessions")), { recovered: 0, discarded: 0 });
  assert.equal(existsSync(pendingSessionPath(sessionFile)), true);
  assert.equal(existsSync(sessionFile), false);
}));

test("does not replace a valid session with a larger different-id pending copy", () => withTempDir((directory) => {
  const sessionFile = path.join(directory, "sessions", "original.jsonl");
  const originalEntries = [
    { type: "session", version: 3, id: "original", timestamp: "2026-08-15T00:00:00.000Z", cwd: directory },
    { type: "message", id: "original-message", parentId: null, timestamp: "2026-08-15T00:00:01.000Z", message: { role: "user", content: "Original", timestamp: 1786752001000 } },
  ];
  const pendingEntries = [
    { type: "session", version: 3, id: "different", timestamp: "2026-08-15T00:00:00.000Z", cwd: directory },
    { type: "message", timestamp: "2026-08-15T00:00:01.000Z", message: { role: "user", content: "Different", timestamp: 1786752001000 } },
    { type: "tool_result", id: "different-tool", parentId: "missing-parent", timestamp: "2026-08-15T00:00:02.000Z" },
  ];
  mkdirSync(path.dirname(sessionFile), { recursive: true });
  writeFileSync(sessionFile, `${originalEntries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  writeFileSync(pendingSessionPath(sessionFile), `${pendingEntries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);

  const result = recoverPendingSessions(path.join(directory, "sessions"));

  assert.deepEqual(result, { recovered: 0, discarded: 0 });
  assert.equal(JSON.parse(readFileSync(sessionFile, "utf8").split("\n")[0]).id, "original");
  assert.equal(existsSync(pendingSessionPath(sessionFile)), true);
}));

test("keeps the original when a same-session pending continuation has an orphan parent", () => withTempDir((directory) => {
  const sessionFile = path.join(directory, "sessions", "orphan-continuation.jsonl");
  const originalEntries = [
    { type: "session", version: 3, id: "same-session", timestamp: "2026-08-15T00:00:00.000Z", cwd: directory },
    { type: "message", id: "original-message", parentId: null, timestamp: "2026-08-15T00:00:01.000Z", message: { role: "user", content: "Original", timestamp: 1786752001000 } },
  ];
  const pendingEntries = [
    ...originalEntries,
    { type: "message", id: "orphan-message", parentId: "missing-parent", timestamp: "2026-08-15T00:00:02.000Z", message: { role: "assistant", content: "Corrupt", timestamp: 1786752002000 } },
  ];
  mkdirSync(path.dirname(sessionFile), { recursive: true });
  writeFileSync(sessionFile, `${originalEntries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  writeFileSync(pendingSessionPath(sessionFile), `${pendingEntries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);

  const result = recoverPendingSessions(path.join(directory, "sessions"));

  assert.deepEqual(result, { recovered: 0, discarded: 0 });
  assert.deepEqual(readFileSync(sessionFile, "utf8").trim().split("\n").map(JSON.parse), originalEntries);
  assert.equal(existsSync(pendingSessionPath(sessionFile)), true);
}));
