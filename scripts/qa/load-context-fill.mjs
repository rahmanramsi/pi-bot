// Injects a session containing a large generated message into Pi Bot's session
// database so the context-window indicator (src/components/ai-elements/context.tsx)
// can be tested at a target token count (default 300k).
//
// The app's session store is SQLite (pi-bot.sqlite); sessions listed in the sidebar
// and opened from it are read from the database. This script creates a real session
// through the same AppDatabase + SessionManager path the app uses.
//
// Safety:
//  - --dry-run validates the session against a temporary copy of the database first.
//  - The script refuses to write while Pi Bot is running (SQLite is owned by the app),
//    unless --force is passed.
//  - It never touches your current session; the new session appears at the top of the
//    sidebar once Pi Bot is reopened.
//
// Usage:
//   node scripts/qa/load-context-fill.mjs [--fixture <path>] [--data-dir <dir>]
//       [--agent <id>] [--name <title>] [--dry-run] [--yes] [--force]
//
// Then: reopen Pi Bot -> the new session is in the sidebar -> open it -> send any
// message (e.g. "ok") to trigger context build. Use a model whose context window
// is >= the fixture token count.

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { AppDatabase } = await import(join(root, "electron/app-database.mjs"));
const { SessionManager } = await import("@earendil-works/pi-coding-agent");

const DEV_DATA_DIR = join(root, ".pi-bot/user-data");
const PACKAGED_DATA_DIR =
  process.platform === "darwin"
    ? join(process.env.HOME ?? "", "Library", "Application Support", "pi-bot")
    : join(process.env.HOME ?? "", ".pi-bot");
// Prefer the dev worktree data dir (npm run dev) when it exists; otherwise the
// packaged app data dir.
const DEFAULT_DATA_DIR = existsSync(join(DEV_DATA_DIR, "pi-bot.sqlite"))
  ? DEV_DATA_DIR
  : PACKAGED_DATA_DIR;
const DEFAULT_FIXTURE = join(root, "scripts/qa/fixtures/context-fill-300000t.txt");

// ---- CLI parsing -----------------------------------------------------------

const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
const fixturePath = option("--fixture") ?? DEFAULT_FIXTURE;
const dataDir = resolve(option("--data-dir") ?? DEFAULT_DATA_DIR);
const agentArg = option("--agent");
const sessionName = option("--name");
const dryRun = args.includes("--dry-run");
const assumeYes = args.includes("--yes");
const force = args.includes("--force");

// ---- Preflight --------------------------------------------------------------

const dbPath = join(dataDir, "pi-bot.sqlite");
if (!existsSync(dbPath)) {
  console.error(`✖ Database not found at ${dbPath}`);
  console.error(`  Pass the right app-data directory with --data-dir.`);
  process.exit(1);
}
if (!existsSync(fixturePath)) {
  console.error(`✖ Fixture file not found: ${fixturePath}`);
  console.error(`  Generate one first: node scripts/qa/gen-context-fill.mjs`);
  process.exit(1);
}

const settingsPath = join(dataDir, "settings.json");
let settings = {};
if (existsSync(settingsPath)) {
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch {
    // non-fatal; agent will be resolved from the database below
  }
}

const isPiBotRunning = (() => {
  try {
    // Match the Electron main process of Pi Bot only (dev or packaged), not
    // unrelated node processes that happen to reference a "pi-bot" path.
    const probe = spawnSync("pgrep", ["-f", "apps/pi-bot/node_modules/electron|Pi Bot\\.app/Contents/MacOS"], { encoding: "utf8" });
    return probe.status === 0 && probe.stdout.trim().length > 0;
  } catch {
    return false;
  }
})();
if (isPiBotRunning && !dryRun && !force) {
  console.error("✖ Pi Bot appears to be running. Close it first, then re-run.");
  console.error("  (Pi Bot owns the SQLite file; writing while it runs can lose data.)");
  console.error("  Pass --force to override this check, or --dry-run to validate only.");
  process.exit(1);
}

// ---- Load database + agent ---------------------------------------------------

const database = new AppDatabase(dbPath);
const state = database.getState();
const agents = state.agents ?? [];
const activeAgentId = settings.activeAgentId && agents.some((a) => a.id === settings.activeAgentId)
  ? settings.activeAgentId
  : agents[0]?.id;
const agentId = agentArg ?? activeAgentId;
if (!agentId) {
  console.error("✖ No agent found in the database and none given with --agent.");
  process.exit(1);
}
const agent = agents.find((entry) => entry.id === agentId);
if (!agent) {
  console.error(`✖ Agent "${agentId}" is not in the database.`);
  console.error(`  Available: ${agents.map((entry) => entry.id).join(", ") || "(none)"}`);
  process.exit(1);
}

// ---- Read fixture + estimate --------------------------------------------------

const text = readFileSync(fixturePath, "utf8");
const CHARS_PER_TOKEN = 4;
const estTokens = Math.round(text.length / CHARS_PER_TOKEN);
const resolvedName = sessionName ?? `Context fill ${estTokens.toLocaleString("en-US")} tokens`;

// ---- Build the session (same path the app uses) --------------------------------

function buildSessionEntries(workspace) {
  const manager = SessionManager.inMemory(workspace);
  manager.appendSessionInfo(resolvedName);
  manager.appendMessage({ role: "user", content: [{ type: "text", text }] });
  const header = manager.getHeader();
  if (!header) throw new Error("SessionManager produced no header");
  return [header, ...manager.getEntries()];
}

async function validateWithTempCopy() {
  // Validate every entry against a scratch database before touching the real one.
  const tempDir = mkdtempSync(join(tmpdir(), "pibot-context-fill-"));
  const tempDbPath = join(tempDir, "pi-bot.sqlite");
  let entries;
  try {
    const tempDb = new AppDatabase(tempDbPath);
    // Mirror the real agent row so FK constraints hold.
    tempDb.saveState({
      setupComplete: true,
      executionRiskAccepted: true,
      activeAgentId: agentId,
      thinkingLevel: "medium",
      agents: [{ ...agent }],
      currentSessions: {},
    });
    entries = buildSessionEntries(agent.workspace);
    const path = tempDb.saveSession({
      id: entries[0].id,
      agentId,
      workspace: agent.workspace,
      entries,
    });
    if (!path) throw new Error("saveSession returned no path");
    const roundTrip = tempDb.getSessionEntries(path);
    if (roundTrip.length !== entries.length) {
      throw new Error(`round-trip mismatch: expected ${entries.length}, got ${roundTrip.length}`);
    }
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
  return entries;
}

const entries = await validateWithTempCopy();
const header = entries[0];

// ---- Summary + confirmation -------------------------------------------------------

console.log("Context fill plan");
console.log(`  agent      : ${agent.id} (${agent.name})`);
console.log(`  workspace  : ${agent.workspace}`);
console.log(`  fixture    : ${fixturePath}`);
console.log(`  est. tokens: ${estTokens.toLocaleString("en-US")}`);
console.log(`  entries    : ${entries.length} (${entries[1].type}, ${entries[2].type})`);
console.log(`  session id : ${header.id}`);
console.log(`  database   : ${dbPath}`);
console.log(`  mode       : ${dryRun ? "DRY RUN (no write)" : "write"}`);

if (dryRun) {
  console.log("\n✔ Validation passed against a scratch database. Nothing was written.");
  console.log(`  Re-run without --dry-run to inject the session, then reopen Pi Bot.`);
  process.exit(0);
}

if (!assumeYes) {
  process.stdout.write("\nWrite this session into Pi Bot's database? [y/N] ");
  let answer = "";
  for await (const chunk of process.stdin) answer += chunk;
  if (!/^\s*y(es)?\s*$/i.test(answer)) {
    console.log("Aborted.");
    process.exit(0);
  }
}

// ---- Write -------------------------------------------------------------------------

const sessionPath = database.saveSession({
  id: header.id,
  agentId,
  workspace: agent.workspace,
  entries,
});

console.log(`\n✔ Injected session ${sessionPath}`);
console.log(`  Close and reopen Pi Bot (or switch agent), then open the topmost session`);
console.log(`  named "${resolvedName}" and send any message to build context.`);
console.log(`  Use a model with context window >= ${estTokens.toLocaleString("en-US")} tokens.`);
