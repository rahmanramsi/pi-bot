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
    const pendingEntries = readSessionEntries(file);
    if (!isRecoverableSession(pendingEntries)) {
      rmSync(file, { force: true });
      discarded++;
      continue;
    }
    const sessionEntries = existsSync(sessionFile) ? readSessionEntries(sessionFile) : [];
    if (sessionEntries.length >= pendingEntries.length) {
      rmSync(file, { force: true });
      discarded++;
      continue;
    }
    renameSync(file, sessionFile);
    recovered++;
  }
  return { recovered, discarded };
}

function readSessionEntries(file) {
  try {
    return readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  } catch {
    return [];
  }
}

function isRecoverableSession(entries) {
  return entries[0]?.type === "session" && entries.some((entry) => entry?.type === "message" && entry.message?.role === "user");
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
