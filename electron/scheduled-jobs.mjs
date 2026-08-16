export const scheduledJobRecurrences = ["once", "daily", "weekly", "monthly"];
export const scheduledJobStatuses = ["active", "paused"];
export const scheduledJobRunStatuses = ["running", "succeeded", "failed", "missed"];

export const MISSED_RUN_MESSAGE = "Skipped because Pi Bot was closed; missed runs are not caught up.";

const dateTimeParts = ["year", "month", "day", "hour", "minute", "second"];

function asDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date.`);
  return date;
}

function isoOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return asDate(value, "Date").toISOString();
}

function timeZoneFormatter(timeZone) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      calendar: "gregory",
      numberingSystem: "latn",
      hourCycle: "h23",
      ...Object.fromEntries(dateTimeParts.map((part) => [part, "numeric"])),
    });
  } catch {
    throw new Error(`Unsupported time zone: ${timeZone}`);
  }
}

function localParts(date, timeZone) {
  const parts = Object.fromEntries(timeZoneFormatter(timeZone)
    .formatToParts(asDate(date, "Date"))
    .filter((part) => dateTimeParts.includes(part.type))
    .map((part) => [part.type, Number(part.value)]));
  if (parts.hour === 24) parts.hour = 0;
  return parts;
}

function calendarDate(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addCalendarParts(parts, recurrence, occurrence) {
  const result = { ...parts, second: 0 };
  if (recurrence === "daily") {
    const date = calendarDate(result);
    date.setUTCDate(date.getUTCDate() + occurrence);
    result.year = date.getUTCFullYear();
    result.month = date.getUTCMonth() + 1;
    result.day = date.getUTCDate();
  } else if (recurrence === "weekly") {
    const date = calendarDate(result);
    date.setUTCDate(date.getUTCDate() + occurrence * 7);
    result.year = date.getUTCFullYear();
    result.month = date.getUTCMonth() + 1;
    result.day = date.getUTCDate();
  } else if (recurrence === "monthly") {
    const monthIndex = result.year * 12 + result.month - 1 + occurrence;
    const year = Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    result.year = year;
    result.month = month;
    result.day = Math.min(result.day, daysInMonth(year, month));
  }
  return result;
}

function zonedDateFromParts(parts, timeZone) {
  const wallClock = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
  let candidate = wallClock;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const actual = localParts(new Date(candidate), timeZone);
    const offset = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second) - candidate;
    candidate = wallClock - offset;
  }
  return new Date(candidate);
}

function occurrenceAt(job, occurrence) {
  const first = asDate(job.startAt, "startAt");
  if (job.recurrence === "once") return first;
  return zonedDateFromParts(addCalendarParts(localParts(first, job.timeZone), job.recurrence, occurrence), job.timeZone);
}

export function nextRunAtForJob(job, after = new Date()) {
  if (job.status === "paused") return isoOrNull(job.nextRunAt);
  const reference = asDate(after, "Reference date");
  if (job.recurrence === "once") {
    const first = occurrenceAt(job, 0);
    return first.getTime() > reference.getTime() ? first.toISOString() : null;
  }

  const first = occurrenceAt(job, 0);
  const elapsed = Math.max(0, reference.getTime() - first.getTime());
  const roughOccurrence = job.recurrence === "daily"
    ? Math.max(0, Math.floor(elapsed / 86_400_000) - 1)
    : job.recurrence === "weekly"
      ? Math.max(0, Math.floor(elapsed / (7 * 86_400_000)) - 1)
      : Math.max(0, Math.floor(elapsed / (28 * 86_400_000)) - 1);

  for (let occurrence = roughOccurrence; occurrence < roughOccurrence + 8; occurrence += 1) {
    const candidate = occurrenceAt(job, occurrence);
    if (candidate.getTime() > reference.getTime()) return candidate.toISOString();
  }
  for (let occurrence = 0; occurrence < 10000; occurrence += 1) {
    const candidate = occurrenceAt(job, occurrence);
    if (candidate.getTime() > reference.getTime()) return candidate.toISOString();
  }
  throw new Error("Could not calculate the next scheduled run.");
}

export function normalizeScheduledJob(value, { now = new Date() } = {}) {
  if (!value || typeof value !== "object") throw new Error("Invalid scheduled job.");
  const id = typeof value.id === "string" && value.id.trim() ? value.id.trim() : null;
  if (!id) throw new Error("Scheduled job id is required.");
  const name = typeof value.name === "string" ? value.name.trim().slice(0, 80) : "";
  if (!name) throw new Error("Scheduled job name is required.");
  const agentId = typeof value.agentId === "string" ? value.agentId.trim() : "";
  if (!agentId) throw new Error("Scheduled job agent is required.");
  const workspace = typeof value.workspace === "string" ? value.workspace.trim().slice(0, 2000) : "";
  if (!workspace) throw new Error("Scheduled job workspace is required.");
  const modelKey = typeof value.modelKey === "string" ? value.modelKey.trim().slice(0, 240) : "";
  if (!modelKey) throw new Error("Scheduled job model is required.");
  const thinkingLevel = typeof value.thinkingLevel === "string" ? value.thinkingLevel.trim() : "off";
  const prompt = typeof value.prompt === "string" ? value.prompt.trim().slice(0, 10000) : "";
  if (!prompt) throw new Error("Scheduled job prompt is required.");
  if (!scheduledJobRecurrences.includes(value.recurrence)) throw new Error("Invalid scheduled job recurrence.");
  const status = value.status === "paused" ? "paused" : "active";
  const timeZone = typeof value.timeZone === "string" && value.timeZone.trim() ? value.timeZone.trim() : "UTC";
  timeZoneFormatter(timeZone);
  const startAt = asDate(value.startAt, "startAt").toISOString();
  const timestamp = asDate(now, "Current date").toISOString();
  const base = {
    id,
    name,
    agentId,
    workspace,
    workspaceTrusted: value.workspaceTrusted === true,
    modelKey,
    thinkingLevel,
    prompt,
    recurrence: value.recurrence,
    startAt,
    timeZone,
    status,
    nextRunAt: null,
    lastRunAt: isoOrNull(value.lastRunAt),
    lastStatus: value.lastStatus && scheduledJobRunStatuses.includes(value.lastStatus) ? value.lastStatus : null,
    lastError: typeof value.lastError === "string" ? value.lastError.slice(0, 2000) : null,
    lastSessionPath: typeof value.lastSessionPath === "string" ? value.lastSessionPath : null,
    createdAt: isoOrNull(value.createdAt) ?? timestamp,
    updatedAt: timestamp,
  };
  base.nextRunAt = status === "active" ? nextRunAtForJob(base, now) : isoOrNull(value.nextRunAt);
  return base;
}

export function buildScheduledJob(value, { now = new Date() } = {}) {
  return normalizeScheduledJob({
    ...value,
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    lastSessionPath: null,
  }, { now });
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export class ScheduledJobScheduler {
  constructor({ database, executeJob, onChange = () => {}, now = () => new Date(), intervalMs = 1000 }) {
    this.database = database;
    this.executeJob = executeJob;
    this.onChange = onChange;
    this.now = now;
    this.intervalMs = intervalMs;
    this.timer = undefined;
    this.ticking = false;
    this.running = new Set();
    this.started = false;
  }

  notify() {
    void Promise.resolve(this.onChange()).catch(() => undefined);
  }

  async start() {
    if (this.started) return;
    this.started = true;
    this.reconcileMissedRuns();
    await this.tick();
    this.timer = setInterval(() => { void this.tick(); }, this.intervalMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.started = false;
  }

  isRunning(id) {
    return this.running.has(id);
  }

  reconcileMissedRuns() {
    const now = this.now();
    let changed = false;
    for (const job of this.database.listScheduledJobs()) {
      if (job.status !== "active" || !job.nextRunAt || new Date(job.nextRunAt).getTime() > now.getTime()) continue;
      const nextRunAt = nextRunAtForJob({ ...job, status: "active" }, now);
      this.database.updateScheduledJob(job.id, {
        nextRunAt,
        lastStatus: "missed",
        lastError: MISSED_RUN_MESSAGE,
        updatedAt: now.toISOString(),
      });
      changed = true;
    }
    if (changed) this.notify();
  }

  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = this.now();
      const due = this.database.listScheduledJobs().filter((job) => (
        job.status === "active"
        && job.nextRunAt
        && new Date(job.nextRunAt).getTime() <= now.getTime()
        && !this.running.has(job.id)
      ));
      await Promise.all(due.map((job) => this.run(job.id)));
    } finally {
      this.ticking = false;
    }
  }

  async setPaused(id, paused) {
    const job = this.database.getScheduledJob(id);
    if (!job) throw new Error("Scheduled job was not found.");
    if (this.running.has(id)) throw new Error("This scheduled job is running. Wait for it to finish first.");
    const now = this.now();
    const activeJob = { ...job, status: "active" };
    const missed = !paused && job.nextRunAt && new Date(job.nextRunAt).getTime() <= now.getTime();
    const updated = this.database.updateScheduledJob(id, {
      status: paused ? "paused" : "active",
      nextRunAt: paused ? job.nextRunAt : nextRunAtForJob(activeJob, now),
      lastStatus: missed ? "missed" : job.lastStatus,
      lastError: missed ? MISSED_RUN_MESSAGE : job.lastError,
      updatedAt: now.toISOString(),
    });
    this.notify();
    if (!paused) void this.tick();
    return updated;
  }

  delete(id) {
    if (this.running.has(id)) throw new Error("This scheduled job is running. Wait for it to finish first.");
    const deleted = this.database.deleteScheduledJob(id);
    if (!deleted) throw new Error("Scheduled job was not found.");
    this.notify();
    return true;
  }

  async runNow(id) {
    return this.run(id, true);
  }

  async run(id, manual = false) {
    if (this.running.has(id)) throw new Error("This scheduled job is already running.");
    const job = this.database.getScheduledJob(id);
    if (!job) throw new Error("Scheduled job was not found.");
    this.running.add(id);
    const startedAt = this.now();
    this.database.updateScheduledJob(id, {
      lastRunAt: startedAt.toISOString(),
      lastStatus: "running",
      lastError: null,
      updatedAt: startedAt.toISOString(),
    });
    this.notify();
    try {
      const result = await this.executeJob({ ...job });
      const finishedAt = this.now();
      const nextRunAt = job.recurrence === "once"
        ? null
        : nextRunAtForJob({ ...job, status: "active" }, finishedAt);
      const updated = this.database.updateScheduledJob(id, {
        nextRunAt,
        lastStatus: "succeeded",
        lastError: null,
        lastSessionPath: typeof result?.sessionPath === "string" ? result.sessionPath : job.lastSessionPath,
        updatedAt: finishedAt.toISOString(),
      });
      this.notify();
      return updated;
    } catch (error) {
      const finishedAt = this.now();
      const nextRunAt = job.recurrence === "once"
        ? null
        : nextRunAtForJob({ ...job, status: "active" }, finishedAt);
      this.database.updateScheduledJob(id, {
        nextRunAt,
        lastStatus: "failed",
        lastError: errorMessage(error).slice(0, 2000),
        lastSessionPath: typeof error?.sessionPath === "string" ? error.sessionPath : job.lastSessionPath,
        updatedAt: finishedAt.toISOString(),
      });
      this.notify();
      if (manual) throw error;
      return null;
    } finally {
      this.running.delete(id);
    }
  }
}
