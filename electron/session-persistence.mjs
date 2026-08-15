import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export function pendingSessionPath(sessionFile) {
  return `${sessionFile}.pending`;
}

export function savePendingSession(sessionFile, entries) {
  if (!sessionFile || !Array.isArray(entries) || !entries.some((entry) => entry?.type === "message" && entry.message?.role === "user")) return false;
  const pendingFile = pendingSessionPath(sessionFile);
  mkdirSync(path.dirname(pendingFile), { recursive: true });
  writeFileSync(pendingFile, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  return true;
}

export function removePendingSession(sessionFile) {
  rmSync(pendingSessionPath(sessionFile), { force: true });
}

export function recoverPendingSessions(directory) {
  let recovered = 0;
  let discarded = 0;
  if (!existsSync(directory)) return { recovered, discarded };

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const result = recoverPendingSessions(file);
      recovered += result.recovered;
      discarded += result.discarded;
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".jsonl.pending")) continue;
    const sessionFile = file.slice(0, -".pending".length);
    const pendingResult = readSessionEntries(file);
    if (!pendingResult.valid) continue;
    const pendingEntries = pendingResult.entries;
    if (!isRecoverableSession(pendingEntries)) {
      rmSync(file, { force: true });
      discarded++;
      continue;
    }
    const sessionResult = existsSync(sessionFile) ? readSessionEntries(sessionFile) : { valid: true, entries: [] };
    if (!sessionResult.valid) continue;
    const sessionEntries = sessionResult.valid ? sessionResult.entries : [];
    if (sessionEntries.length > 0 && !sameSessionIdentity(sessionEntries[0], pendingEntries[0])) continue;
    if (sessionEntries.length >= pendingEntries.length) {
      if (entriesPrefix(pendingEntries, sessionEntries)) {
        rmSync(file, { force: true });
        discarded++;
      }
      continue;
    }
    if (!entriesPrefix(sessionEntries, pendingEntries)) continue;
    renameSync(file, sessionFile);
    recovered++;
  }
  return { recovered, discarded };
}

function readSessionEntries(file) {
  try {
    const content = readFileSync(file, "utf8").trim();
    if (!content) return { valid: true, entries: [] };
    const entries = content.split(/\r?\n/).filter(Boolean).map(JSON.parse);
    return { valid: validateRecoveryEntries(entries), entries };
  } catch {
    return { valid: false, entries: [] };
  }
}

function isRecoverableSession(entries) {
  return entries[0]?.type === "session" && entries.some((entry) => entry?.type === "message" && entry.message?.role === "user");
}

function validateRecoveryEntries(entries) {
  const header = entries[0];
  if (!header || header.type !== "session" || typeof header.id !== "string" || !header.id || typeof header.timestamp !== "string" || typeof header.cwd !== "string") return false;
  const version = Number(header.version) || 1;
  const ids = new Set();
  for (const entry of entries.slice(1)) {
    if (!entry || typeof entry !== "object" || typeof entry.type !== "string" || typeof entry.timestamp !== "string") return false;
    if (version <= 1) {
      if (entry.type === "message" && (!entry.message || typeof entry.message !== "object")) return false;
      continue;
    }
    if (typeof entry.id !== "string" || !entry.id || (entry.parentId !== null && typeof entry.parentId !== "string") || ids.has(entry.id)) return false;
    if (entry.parentId !== null && !ids.has(entry.parentId)) return false;
    ids.add(entry.id);
  }
  return true;
}

function entriesPrefix(prefix, full) {
  return prefix.length <= full.length && prefix.every((entry, index) => JSON.stringify(entry) === JSON.stringify(full[index]));
}

function sameSessionIdentity(originalHeader, pendingHeader) {
  return originalHeader?.id === pendingHeader?.id
    && (!originalHeader?.cwd || !pendingHeader?.cwd || originalHeader.cwd === pendingHeader.cwd);
}

export function copyLegacySessionFiles(files, directory) {
  mkdirSync(directory, { recursive: true });
  const copied = [];
  const skipped = [];
  for (const file of files) {
    const target = path.join(directory, path.basename(file));
    if (existsSync(target)) {
      skipped.push(file);
      continue;
    }
    copyFileSync(file, target);
    copied.push(target);
  }
  return { copied, skipped };
}

export function legacySessionPaths(settings) {
  if (!settings || settings.schemaVersion !== undefined) return [];
  const paths = new Set();
  const collect = (value) => {
    if (typeof value === "string") {
      if (value.endsWith(".jsonl")) paths.add(value);
      return;
    }
    if (value && typeof value === "object") {
      for (const item of Object.values(value)) collect(item);
    }
  };
  collect(settings.sessionAgents ? Object.keys(settings.sessionAgents) : []);
  collect(settings.agentSessions);
  return [...paths].sort();
}
