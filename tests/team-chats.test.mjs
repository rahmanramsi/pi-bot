import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createAppDatabase } from "../electron/app-database.mjs";
import { createTeamDatabaseSession, createTeamDatabaseSessionManager } from "../electron/session-database-adapter.mjs";
import {
  TeamOrchestrator,
  buildTeamPrompt,
  parseTeamDirective,
  validateTeamWorkspaceRoots,
} from "../electron/team-chats.mjs";

async function withDatabase(run) {
  const directory = mkdtempSync(path.join(tmpdir(), "pi-bot-team-test-"));
  const database = createAppDatabase(path.join(directory, "pi-bot.sqlite"));
  try {
    return await run({ directory, database });
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function members(directory) {
  return [
    { agentId: "planner", name: "Planner", initials: "PL", workspace: path.join(directory, "project-a"), workspaceKind: "app", workspaceTrusted: true },
    { agentId: "reviewer", name: "Reviewer", initials: "RV", workspace: path.join(directory, "project-b"), workspaceKind: "external", workspaceTrusted: false },
  ];
}

test("team workspace rules permit exact roots and disjoint roots but reject nesting", () => {
  assert.doesNotThrow(() => validateTeamWorkspaceRoots([
    { agentId: "a", workspace: "/repo" },
    { agentId: "b", workspace: "/repo" },
  ]));
  assert.doesNotThrow(() => validateTeamWorkspaceRoots([
    { agentId: "a", workspace: "/repo-a" },
    { agentId: "b", workspace: "/repo-b" },
  ]));
  assert.throws(() => validateTeamWorkspaceRoots([
    { agentId: "a", workspace: "/repo" },
    { agentId: "b", workspace: "/repo/packages" },
  ]), /overlap|nested/);
  assert.throws(() => validateTeamWorkspaceRoots([
    { agentId: "a", workspace: "/repo" },
    { agentId: "b", workspace: "/repo/../repo/packages" },
  ]), /overlap|nested/);
});

test("team protocol only accepts explicit complete, wait, and handoff blocks", () => {
  const handoff = parseTeamDirective(`Progress\n<pi-team-result>{"status":"handoff","recipient":"reviewer","request":"Review the patch","reason":"A second pair of eyes is needed"}</pi-team-result>`);
  assert.deepEqual(handoff.directive, { status: "handoff", recipient: "reviewer", request: "Review the patch", reason: "A second pair of eyes is needed" });
  assert.equal(handoff.body, "Progress");
  assert.equal(parseTeamDirective("I think another agent should help").directive, null);
  assert.equal(parseTeamDirective("<pi-team-result>{\"status\":\"handoff\",\"recipient\":\"reviewer\"}</pi-team-result>").directive, null);
});

test("missing or malformed team directives fail visibly instead of completing", async () => withDatabase(async ({ directory, database }) => {
  for (const response of [
    { body: "A response without the required protocol block.", text: "A response without the required protocol block." },
    { body: "A response with malformed protocol.", text: "A response <pi-team-result>{not-json}</pi-team-result>" },
  ]) {
    const team = database.createTeamChat({ members: members(directory) });
    const orchestrator = new TeamOrchestrator({
      store: database,
      getMembers: (teamChatId) => database.listTeamMembers(teamChatId),
      runTurn: async () => response,
    });
    await orchestrator.start({ teamChatId: team.id, goal: "Validate protocol", firstAgentId: "planner" });
    const run = database.getLatestTeamRun(team.id);
    assert.equal(run.status, "failed");
    assert.match(run.stopReason, /valid team result directive/);
    assert.equal(database.listTeamEvents(team.id).at(-1).status, "failed");
  }
}));

test("team storage keeps ordered snapshots, events, runs, and dedicated member sessions separate", () => withDatabase(({ directory, database }) => {
  const team = database.createTeamChat({ name: "Release Team", members: members(directory) });
  assert.deepEqual(database.listTeamMembers(team.id).map((member) => member.agentId), ["planner", "reviewer"]);
  const event = database.appendTeamEvent({ teamChatId: team.id, type: "handoff", agentId: "planner", senderName: "Planner", senderInitials: "PL", recipientAgentId: "reviewer", recipientName: "Reviewer", recipientInitials: "RV", request: "Review", reason: "Need a review", body: "Review", status: "queued" });
  assert.equal(database.getTeamChat(team.id).events[0].sender.name, "Planner");
  assert.equal(database.getTeamChat(team.id).events[0].recipient.name, "Reviewer");
  const run = database.createTeamRun({ teamChatId: team.id, goal: "Ship", firstAgentId: "planner", runLimit: 3 });
  assert.equal(database.getTeamChat(team.id).runStatus, "running");
  database.updateTeamRun(run.id, { status: "waiting", stopReason: "Need input", activeAgentId: null, pendingAgentId: "reviewer" });
  assert.equal(database.getLatestTeamRun(team.id).status, "waiting");
  assert.equal(database.getTeamChat(team.id).pendingAgentId, "reviewer");
  database.deleteTeamChat(team.id);
  assert.equal(database.listTeamChats().length, 0);
  assert.equal(database.getTeamEvent(event.id), null);
}));

test("sequential orchestrator runs exactly one member at a time and auto-starts explicit handoffs", async () => withDatabase(async ({ directory, database }) => {
  const team = database.createTeamChat({ members: members(directory) });
  const calls = [];
  let running = 0;
  let maximumRunning = 0;
  const orchestrator = new TeamOrchestrator({
    store: database,
    getMembers: (teamChatId) => database.listTeamMembers(teamChatId),
    runTurn: async ({ member }) => {
      running += 1;
      maximumRunning = Math.max(maximumRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      calls.push(member.agentId);
      if (member.agentId === "planner") return { body: "Plan ready", directive: { status: "handoff", recipient: "reviewer", request: "Review the plan", reason: "The plan needs a second pair of eyes" } };
      return { body: "Review complete", directive: { status: "complete", reason: "All checks passed" } };
    },
  });
  await orchestrator.start({ teamChatId: team.id, goal: "Ship the release", firstAgentId: "planner" });
  assert.deepEqual(calls, ["planner", "reviewer"]);
  assert.equal(maximumRunning, 1);
  assert.equal(database.getLatestTeamRun(team.id).status, "complete");
  assert.equal(database.listTeamEvents(team.id).filter((event) => event.type === "handoff").length, 1);
}));

test("resume sends the typed direction as a visible user event and a new run request", async () => withDatabase(async ({ directory, database }) => {
  const team = database.createTeamChat({ members: members(directory) });
  const requests = [];
  let call = 0;
  const orchestrator = new TeamOrchestrator({
    store: database,
    getMembers: (teamChatId) => database.listTeamMembers(teamChatId),
    runTurn: async ({ request }) => {
      requests.push(request);
      call += 1;
      return call === 1
        ? { body: "Waiting for direction", directive: { status: "wait", reason: "Need a decision" } }
        : { body: "Direction applied", directive: { status: "complete", reason: "Done" } };
    },
  });
  await orchestrator.start({ teamChatId: team.id, goal: "Prepare release", firstAgentId: "planner" });
  const waitingRun = database.getLatestTeamRun(team.id);
  assert.equal(waitingRun.status, "waiting");
  const direction = "Use the smaller rollout and ask the reviewer to verify it.";
  await orchestrator.resume(team.id, direction);
  const latest = database.getLatestTeamRun(team.id);
  assert.equal(latest.status, "complete");
  assert.notEqual(latest.id, waitingRun.id);
  assert.deepEqual(requests, ["Prepare release", direction]);
  const directionEvent = database.listTeamEvents(team.id).find((event) => event.type === "user" && event.body === direction);
  assert.ok(directionEvent);
  assert.equal(directionEvent.metadata.resumesRunId, waitingRun.id);
}));

test("unavailable handoffs wait visibly and every prompt delimits the read-only transcript", () => withDatabase(({ database }) => {
  const prompt = buildTeamPrompt({
    goal: "Ship",
    request: "Review",
    member: { agentId: "planner", name: "Planner" },
    members: [{ agentId: "planner", name: "Planner" }, { agentId: "reviewer", name: "Reviewer" }],
    events: [{ type: "user", body: "Ship", sender: null }, { type: "handoff", body: "Review", sender: { name: "Planner" }, recipient: { name: "Reviewer" }, request: "Review", reason: "Need review" }],
    runCount: 0,
    runLimit: 4,
  });
  assert.match(prompt, /PI BOT TEAM CONTEXT \(READ ONLY\)/);
  assert.match(prompt, /END PI BOT TEAM CONTEXT/);
  assert.match(prompt, /handoff/);
  assert.match(prompt, /run limit/);
  const team = database.createTeamChat({ members: [{ agentId: "planner", name: "Planner", initials: "PL", workspace: "/a" }, { agentId: "reviewer", name: "Reviewer", initials: "RV", workspace: "/b" }] });
  const orchestrator = new TeamOrchestrator({
    store: database,
    getMembers: () => database.listTeamMembers(team.id).map((member) => ({ ...member, available: member.agentId === "planner" })),
    runTurn: async () => ({ body: "", directive: { status: "handoff", recipient: "reviewer", request: "Review", reason: "Need review" } }),
  });
  return orchestrator.start({ teamChatId: team.id, goal: "Ship", firstAgentId: "planner" }).then(() => {
    assert.equal(database.getLatestTeamRun(team.id).status, "waiting");
    assert.match(database.getLatestTeamRun(team.id).stopReason, /unavailable/);
  });
}));

test("resume repairs a stale unavailable handoff after membership replacement", async () => withDatabase(async ({ directory, database }) => {
  const initialMembers = members(directory);
  const team = database.createTeamChat({ members: initialMembers });
  const replacement = {
    agentId: "replacement",
    name: "Replacement",
    initials: "RP",
    workspace: path.join(directory, "project-c"),
    workspaceKind: "external",
    workspaceTrusted: true,
  };
  const calls = [];
  let firstTurn = true;
  const orchestrator = new TeamOrchestrator({
    store: database,
    getMembers: (teamChatId) => database.listTeamMembers(teamChatId).map((member) => ({
      ...member,
      available: member.agentId !== "reviewer",
    })),
    runTurn: async ({ member, request }) => {
      calls.push({ agentId: member.agentId, request });
      if (firstTurn) {
        firstTurn = false;
        return { body: "Planner needs a reviewer.", directive: { status: "handoff", recipient: "reviewer", request: "Review the plan", reason: "A review is required" } };
      }
      return { body: "Replacement completed.", directive: { status: "complete", reason: "The replacement completed the review." } };
    },
  });

  await orchestrator.start({ teamChatId: team.id, goal: "Ship", firstAgentId: "planner" });
  const waitingRun = database.getLatestTeamRun(team.id);
  assert.equal(waitingRun.status, "waiting");
  assert.equal(waitingRun.pendingAgentId, "reviewer");

  database.replaceTeamMembers(team.id, [replacement, initialMembers[0]]);
  database.appendTeamEvent({
    teamChatId: team.id,
    type: "system",
    body: "Team membership updated.",
    status: "complete",
    metadata: { memberIds: [replacement.agentId, initialMembers[0].agentId] },
  });
  await orchestrator.resume(team.id, "Continue with the replacement reviewer.");

  const latest = database.getLatestTeamRun(team.id);
  assert.equal(latest.status, "complete");
  assert.equal(latest.pendingAgentId, null);
  assert.deepEqual(calls.map(({ agentId }) => agentId), ["planner", "replacement"]);
  assert.equal(calls[1].request, "Continue with the replacement reviewer.");
  assert.equal(database.listTeamEvents(team.id).filter((event) => event.type === "system").length, 1);
}));

test("team run limits are durable and app agents remain after team deletion", () => withDatabase(({ directory, database }) => {
  const agent = {
    id: "planner",
    agentId: "planner",
    name: "Planner",
    initials: "PL",
    workspace: path.join(directory, "project-a"),
    workspaceKind: "app",
    workspaceTrusted: true,
  };
  const reviewer = { ...agent, id: "reviewer", agentId: "reviewer", name: "Reviewer", initials: "RV", workspace: path.join(directory, "project-b") };
  database.saveState({ setupComplete: true, executionRiskAccepted: true, activeAgentId: agent.id, thinkingLevel: "medium", agents: [agent, reviewer], currentSessions: {} });
  const team = database.createTeamChat({ name: "Bounded", members: [agent, reviewer], runLimit: 2 });
  assert.equal(team.runLimit, 2);
  database.createTeamRun({ teamChatId: team.id, goal: "Ship", firstAgentId: "planner", runLimit: team.runLimit });
  assert.equal(database.markActiveTeamRunsInterrupted(), 1);
  assert.equal(database.getLatestTeamRun(team.id).status, "interrupted");
  database.deleteTeamChat(team.id);
  assert.equal(database.getState().agents.length, 2);
  assert.equal(database.getTeamChat(team.id), null);
}));

test("dedicated team Pi sessions round-trip through SQLite", () => withDatabase(({ directory, database }) => {
  const team = database.createTeamChat({ members: members(directory) });
  const profile = { ...members(directory)[0], id: "planner" };
  const manager = createTeamDatabaseSession({ database, profile, teamChatId: team.id, agentId: "planner" });
  manager.appendSessionInfo("Connected Team");
  const stored = database.getTeamSession(team.id, "planner");
  assert.match(stored.sessionPath, /^pi-team-session:\/\//);
  assert.equal(database.getTeamSessionEntries(team.id, "planner").length, 2);
  const restored = createTeamDatabaseSessionManager({ database, profile, teamChatId: team.id, agentId: "planner", session: stored });
  assert.equal(restored.getEntries().length, 1);
  assert.equal(restored.getHeader().id, stored.sessionId);
  assert.equal(database.deleteTeamSession(team.id, "planner"), true);
  assert.equal(database.getTeamSession(team.id, "planner"), null);
  assert.deepEqual(database.getTeamSessionEntries(team.id, "planner"), []);
}));

test("cancel, stop, and shutdown produce terminal run statuses", async () => {
  await withDatabase(async ({ directory, database }) => {
    const cancelledTeam = database.createTeamChat({ members: members(directory) });
    const cancelled = new TeamOrchestrator({
      store: database,
      getMembers: (teamChatId) => database.listTeamMembers(teamChatId),
      runTurn: async () => { throw new Error("Request was aborted"); },
    });
    await cancelled.start({ teamChatId: cancelledTeam.id, goal: "Cancel", firstAgentId: "planner" });
    assert.equal(database.getLatestTeamRun(cancelledTeam.id).status, "cancelled");

    const stoppedTeam = database.createTeamChat({ members: members(directory) });
    let release;
    const stopped = new TeamOrchestrator({
      store: database,
      getMembers: (teamChatId) => database.listTeamMembers(teamChatId),
      runTurn: () => new Promise((resolve) => { release = resolve; }),
      abortTurn: async () => { release?.({ body: "Stopped" }); },
    });
    const stoppedRun = stopped.start({ teamChatId: stoppedTeam.id, goal: "Stop", firstAgentId: "planner" });
    await new Promise((resolve) => setTimeout(resolve, 1));
    await stopped.stop(stoppedTeam.id);
    await stoppedRun;
    assert.equal(database.getLatestTeamRun(stoppedTeam.id).status, "stopped");

    const shutdownTeam = database.createTeamChat({ members: members(directory) });
    let shutdownRelease;
    const shutdown = new TeamOrchestrator({
      store: database,
      getMembers: (teamChatId) => database.listTeamMembers(teamChatId),
      runTurn: () => new Promise((resolve) => { shutdownRelease = resolve; }),
      abortTurn: async () => { shutdownRelease?.({ body: "Interrupted" }); },
    });
    const shutdownRun = shutdown.start({ teamChatId: shutdownTeam.id, goal: "Shutdown", firstAgentId: "planner" });
    await new Promise((resolve) => setTimeout(resolve, 1));
    await shutdown.shutdown();
    await shutdownRun;
    assert.equal(database.getLatestTeamRun(shutdownTeam.id).status, "interrupted");
  });
});
