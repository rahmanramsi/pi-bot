import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, symlinkSync, truncateSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  AttachmentStore,
  MAX_TEXT_ATTACHMENT_BYTES,
  attachmentMetadata,
  detectAttachmentImageMime,
} from "../electron/attachments.mjs";
import { resolvePendingAttachmentSession } from "../electron/composer-session.mjs";

function temporaryDirectory() {
  return mkdtempSync(path.join(tmpdir(), "pi-bot-attachments-test-"));
}

test("attachment store stages copies without mutating the source and survives a new store instance", () => {
  const root = temporaryDirectory();
  const source = path.join(root, "source.txt");
  writeFileSync(source, "hello from source\n");
  const store = new AttachmentStore(path.join(root, "app-attachments"));
  const staged = store.stage("session-1", { sourcePath: source });

  assert.equal(staged.sessionId, "session-1");
  assert.equal(staged.kind, "text");
  assert.equal(staged.status, "pending");
  assert.equal(typeof staged.cleanupToken, "string");
  assert.equal(staged.stagedPath, undefined);
  assert.equal(readFileSync(source, "utf8"), "hello from source\n");
  const reopened = new AttachmentStore(path.join(root, "app-attachments")).list("session-1")[0];
  assert.equal(reopened.cleanupToken, staged.cleanupToken);
  assert.equal(new AttachmentStore(path.join(root, "app-attachments")).prepare("session-1", [staged.id])[0].data, "hello from source\n");

  rmSync(root, { recursive: true, force: true });
});

test("attachment store supports renderer bytes and runtime image metadata", () => {
  const root = temporaryDirectory();
  const store = new AttachmentStore(path.join(root, "attachments"));
  const image = store.stage("session-2", {
    name: "screen.png",
    mimeType: "image/png",
    data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]),
  });
  assert.equal(image.kind, "image");
  assert.equal(image.mimeType, "image/png");
  assert.equal(detectAttachmentImageMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(store.prepare("session-2", [image.id])[0].data.length > 0, true);
  rmSync(root, { recursive: true, force: true });
});

test("attachment validation rejects unsupported and oversized files without partial staging", () => {
  const root = temporaryDirectory();
  const store = new AttachmentStore(path.join(root, "attachments"));
  assert.throws(() => store.stage("session-3", { name: "archive.zip", mimeType: "application/zip", data: new Uint8Array([1, 2, 3]) }), /only UTF-8 text files/);
  assert.throws(() => store.stage("session-3", { name: "large.txt", mimeType: "text/plain", data: new TextEncoder().encode("x".repeat(MAX_TEXT_ATTACHMENT_BYTES + 1)) }), /must be/);
  assert.deepEqual(store.list("session-3"), []);
  assert.throws(() => store.stageMany("session-4", [
    { name: "one.txt", mimeType: "text/plain", data: new TextEncoder().encode("one") },
    { name: "bad.bin", mimeType: "application/octet-stream", data: new Uint8Array([1, 2]) },
  ]), /only UTF-8 text files/);
  assert.deepEqual(store.list("session-4"), []);
  rmSync(root, { recursive: true, force: true });
});

test("sent attachments remain auditable until session cleanup and source files remain intact", () => {
  const root = temporaryDirectory();
  const source = path.join(root, "source.md");
  writeFileSync(source, "# source\n");
  const appRoot = path.join(root, "attachments");
  const store = new AttachmentStore(appRoot);
  const staged = store.stage("session-5", { sourcePath: source });
  store.markSent("session-5", [staged.id]);
  const sent = store.list("session-5")[0];
  assert.equal(sent.status, "sent");
  assert.equal("cleanupToken" in sent, false);
  assert.equal(existsSync(path.join(appRoot, "session-5", "manifest.json")), true);
  store.cleanupSession("session-5");
  assert.equal(existsSync(path.join(appRoot, "session-5")), false);
  assert.equal(readFileSync(source, "utf8"), "# source\n");
  rmSync(root, { recursive: true, force: true });
});

test("attachment staging refuses a symlinked session directory", () => {
  const root = temporaryDirectory();
  const appRoot = path.join(root, "attachments");
  const source = path.join(root, "source.txt");
  writeFileSync(source, "do not overwrite\n");
  const store = new AttachmentStore(appRoot);
  symlinkSync(root, path.join(appRoot, "session-escape"), "dir");
  assert.throws(() => store.stage("session-escape", { sourcePath: source }), /app-owned directory/);
  assert.equal(readFileSync(source, "utf8"), "do not overwrite\n");
  rmSync(root, { recursive: true, force: true });
});

test("removal never follows a tampered staged path outside app storage", () => {
  const root = temporaryDirectory();
  const appRoot = path.join(root, "attachments");
  const source = path.join(root, "source.txt");
  writeFileSync(source, "keep this source\n");
  const store = new AttachmentStore(appRoot);
  const staged = store.stage("session-safe", { sourcePath: source });
  const manifest = path.join(appRoot, "session-safe", "manifest.json");
  const parsed = JSON.parse(readFileSync(manifest, "utf8"));
  parsed.attachments[0].stagedPath = source;
  writeFileSync(manifest, JSON.stringify(parsed));
  assert.throws(() => store.remove("session-safe", staged.id, staged.cleanupToken), /missing from Pi Bot's app storage/);
  assert.equal(readFileSync(source, "utf8"), "keep this source\n");
  rmSync(root, { recursive: true, force: true });
});

test("picker sources are size-gated before full file reads and orphan storage is cleaned", () => {
  const root = temporaryDirectory();
  const source = path.join(root, "large.txt");
  writeFileSync(source, "x");
  truncateSync(source, MAX_TEXT_ATTACHMENT_BYTES + 1);
  const appRoot = path.join(root, "attachments");
  const store = new AttachmentStore(appRoot);
  assert.throws(() => store.stage("session-6", { sourcePath: source }), /text files must be/);
  assert.deepEqual(store.list("session-6"), []);

  const orphan = path.join(appRoot, "orphan-session");
  mkdirSync(orphan, { recursive: true });
  writeFileSync(path.join(orphan, "partial.bin"), "partial");
  store.cleanupMissingManifests();
  assert.equal(existsSync(orphan), false);

  const stagedOrphan = store.stage("stale-session", { name: "stale.txt", mimeType: "text/plain", data: new TextEncoder().encode("stale") });
  assert.equal(stagedOrphan.sessionId, "stale-session");
  store.cleanupOrphanedSessions([]);
  assert.equal(existsSync(path.join(appRoot, "stale-session")), false);
  rmSync(root, { recursive: true, force: true });
});

test("delayed cleanup can remove only the exact pending attachment from its origin session", () => {
  const root = temporaryDirectory();
  const store = new AttachmentStore(path.join(root, "attachments"));
  const pending = store.stage("session-a", { name: "pending.txt", mimeType: "text/plain", data: new TextEncoder().encode("pending") });
  const sent = store.stage("session-a", { name: "sent.txt", mimeType: "text/plain", data: new TextEncoder().encode("sent") });
  const otherPending = store.stage("session-b", { name: "other.txt", mimeType: "text/plain", data: new TextEncoder().encode("other") });
  assert.match(pending.cleanupToken, /^[A-Za-z0-9_-]{40,}$/);
  assert.notEqual(pending.cleanupToken, otherPending.cleanupToken);
  store.markSent("session-a", [sent.id]);
  const sessions = new Map([
    ["session-a", { id: "session-a", agent_id: "agent-a", workspace: "/workspace-a" }],
    ["session-b", { id: "session-b", agent_id: "agent-b", workspace: "/workspace-b" }],
  ]);
  const findSession = (id) => sessions.get(id);
  const listAttachments = (id) => store.list(id);

  // The UI is currently on session-b, but rollback still targets session-a with its issued token.
  const activeSessionId = "session-b";
  assert.notEqual(activeSessionId, "session-a");
  assert.equal(resolvePendingAttachmentSession("session-a", pending.id, pending.cleanupToken, findSession, listAttachments), "session-a");
  store.remove("session-a", pending.id, pending.cleanupToken);
  assert.deepEqual(store.list("session-a").map((attachment) => attachment.id), [sent.id]);
  assert.throws(() => resolvePendingAttachmentSession("session-a", sent.id, sent.cleanupToken, findSession, listAttachments), /no longer pending/);
  assert.throws(() => resolvePendingAttachmentSession("session-a", pending.id, "wrong-token", findSession, listAttachments), /no longer pending/);
  assert.throws(() => resolvePendingAttachmentSession("session-a", pending.id, undefined, findSession, listAttachments), /no longer pending/);
  assert.throws(() => resolvePendingAttachmentSession("session-a", otherPending.id, otherPending.cleanupToken, findSession, listAttachments), /no longer pending/);
  assert.throws(() => resolvePendingAttachmentSession("session-b", otherPending.id, pending.cleanupToken, findSession, listAttachments), /no longer pending/);

  assert.deepEqual(attachmentMetadata([pending, otherPending, sent]), [
    { id: pending.id, name: "pending.txt", mimeType: "text/plain", kind: "text", size: 7 },
    { id: otherPending.id, name: "other.txt", mimeType: "text/plain", kind: "text", size: 5 },
    { id: sent.id, name: "sent.txt", mimeType: "text/plain", kind: "text", size: 4 },
  ]);

  rmSync(root, { recursive: true, force: true });
});
