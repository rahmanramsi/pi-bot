import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createAppDatabase } from "../electron/app-database.mjs";
import {
  MISSED_RUN_MESSAGE,
  buildScheduledJob,
  nextRunAtForJob,
  ScheduledJobScheduler,
} from "../electron/scheduled-jobs.mjs";

async function withDatabase(run) {
  const directory = mkdtempSync(path.join(tmpdir(), "pi-bot-scheduled-jobs-test-"));
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  database.saveState({
    setupComplete: true,
    executionRiskAccepted: true,
    activeAgentId: "assistant",
    thinkingLevel: "medium",
    currentSessions: {},
    agents: [{
      id: "assistant",
      name: "Assistant",
      initials: "AS",
      instructions: "",
      workspace: path.join(directory, "workspace"),
      workspaceKind: "app",
      workspaceTrusted: true,
      defaultModelKey: "provider/model",
      thinkingLevel: "medium",
      archived: false,
    }],
  });
  try {
    return await run({ directory, database, workspace: path.join(directory, "workspace") });
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function job(workspace, overrides = {}, now = new Date("2026-08-15T00:00:00.000Z")) {
  return buildScheduledJob({
    id: "job-1",
    name: "Daily review",
    agentId: "assistant",
    workspace,
    workspaceTrusted: true,
    modelKey: "provider/model",
    thinkingLevel: "medium",
    prompt: "Review the open work.",
    recurrence: "daily",
    startAt: "2026-08-15T09:00:00.000Z",
    timeZone: "UTC",
    status: "active",
    ...overrides,
  }, { now });
}

test("persists scheduled jobs and their explicit execution binding across restart", () => withDatabase(({ database, workspace }) => {
  const scheduled = job(workspace);
  database.createScheduledJob(scheduled);

  const restarted = createAppDatabase(path.join(path.dirname(database.file), "pi-bot.sqlite"));
  assert.deepEqual(restarted.getScheduledJob(scheduled.id), scheduled);
  assert.equal(restarted.getScheduledJob(scheduled.id).workspace, workspace);
  restarted.close();
}));

test("calculates daily, weekly, and month-end recurrence in the saved timezone", () => {
  const daily = job("/workspace", { startAt: "2026-08-15T01:30:00.000Z", timeZone: "Asia/Makassar" });
  assert.equal(nextRunAtForJob(daily, new Date("2026-08-16T18:00:00.000Z")), "2026-08-17T01:30:00.000Z");

  const weekly = job("/workspace", { recurrence: "weekly", startAt: "2026-08-15T09:00:00.000Z" });
  assert.equal(nextRunAtForJob(weekly, new Date("2026-08-16T00:00:00.000Z")), "2026-08-22T09:00:00.000Z");

  const monthly = job("/workspace", { recurrence: "monthly", startAt: "2026-01-31T09:00:00.000Z" });
  assert.equal(nextRunAtForJob(monthly, new Date("2026-01-31T10:00:00.000Z")), "2026-02-28T09:00:00.000Z");

  const longRunningMonthly = job("/workspace", { recurrence: "monthly", startAt: "2020-01-31T09:00:00.000Z" });
  assert.equal(nextRunAtForJob(longRunningMonthly, new Date("2026-01-31T10:00:00.000Z")), "2026-02-28T09:00:00.000Z");
});

test("rejects an expired active one-time schedule", () => {
  const expired = job("/workspace", { recurrence: "once", startAt: "2026-08-20T09:00:00.000Z" });
  expired.startAt = "2026-08-14T09:00:00.000Z";
  assert.throws(() => buildScheduledJob(expired, { now: new Date("2026-08-15T00:00:00.000Z") }), /must start in the future/);
});

test("pause and resume preserve history and recompute a future occurrence", async () => withDatabase(async ({ database, workspace }) => {
  let current = new Date("2026-08-15T08:00:00.000Z");
  database.createScheduledJob(job(workspace, { startAt: "2026-08-15T09:00:00.000Z" }, current));
  const scheduler = new ScheduledJobScheduler({ database, executeJob: async () => ({ sessionPath: "pi-session://unused" }), now: () => current });

  await scheduler.setPaused("job-1", true);
  assert.equal(database.getScheduledJob("job-1").status, "paused");
  current = new Date("2026-08-16T08:00:00.000Z");
  await scheduler.setPaused("job-1", false);
  const resumed = database.getScheduledJob("job-1");
  assert.equal(resumed.status, "active");
  assert.equal(resumed.nextRunAt, "2026-08-16T09:00:00.000Z");
}));

test("failed runs are recorded and can be recovered with run now", async () => withDatabase(async ({ database, workspace }) => {
  let attempts = 0;
  const scheduler = new ScheduledJobScheduler({
    database,
    executeJob: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("Provider unavailable");
      return { sessionPath: "pi-session://recovered" };
    },
  });
  database.createScheduledJob(job(workspace, { recurrence: "once", startAt: "2026-08-20T09:00:00.000Z" }));

  await assert.rejects(() => scheduler.runNow("job-1"), /Provider unavailable/);
  const failed = database.getScheduledJob("job-1");
  assert.equal(failed.lastStatus, "failed");
  assert.match(failed.lastError, /Provider unavailable/);

  await scheduler.runNow("job-1");
  const recovered = database.getScheduledJob("job-1");
  assert.equal(recovered.lastStatus, "succeeded");
  assert.equal(recovered.lastSessionPath, "pi-session://recovered");
}));

test("exposes schedule lifecycle controls through the preload bridge and settings UI", () => {
  const preload = readFileSync(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  assert.match(preload, /createScheduledJob/);
  assert.match(preload, /openScheduledSession/);
  assert.match(readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8"), /record\.lastSessionPath = existing\.lastSessionPath/);
  assert.match(preload, /setScheduledJobPaused/);
  assert.match(preload, /runScheduledJob/);
  assert.match(preload, /deleteScheduledJob/);
  assert.match(app, /function ScheduledJobsSettings/);
  assert.match(app, /Open-app only/);
  assert.match(app, /Open session/);
  assert.match(readme, /Scheduled jobs run only while Pi Bot is open/);
});

test("startup skips missed runs and does not catch them up", async () => withDatabase(async ({ database, workspace }) => {
  const initial = new Date("2026-08-15T00:00:00.000Z");
  database.createScheduledJob(job(workspace, { recurrence: "once", startAt: "2026-08-15T09:00:00.000Z" }, initial));
  const scheduler = new ScheduledJobScheduler({ database, executeJob: async () => { throw new Error("must not run"); }, now: () => new Date("2026-08-16T00:00:00.000Z") });
  await scheduler.start();
  scheduler.stop();
  const missed = database.getScheduledJob("job-1");
  assert.equal(missed.lastStatus, "missed");
  assert.equal(missed.lastError, MISSED_RUN_MESSAGE);
  assert.equal(missed.nextRunAt, null);
}));

test("prevents overlapping manual runs for the same job", async () => withDatabase(async ({ database, workspace }) => {
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const scheduler = new ScheduledJobScheduler({ database, executeJob: async () => { await waiting; return { sessionPath: "pi-session://overlap" }; } });
  database.createScheduledJob(job(workspace, { recurrence: "once", startAt: "2026-08-20T09:00:00.000Z" }));
  const first = scheduler.runNow("job-1");
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(() => scheduler.runNow("job-1"), /already running/);
  release();
  await first;
}));
