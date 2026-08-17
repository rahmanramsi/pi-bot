import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Connected Team renderer keeps team chat separate and exposes an accessible roster dialog", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const preload = await readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8");
  const teamView = app.match(/function TeamChatWorkspace[\s\S]*?function AvatarEmojiPicker/)?.[0] ?? "";

  assert.match(app, /function TeamRosterDialog[\s\S]*?<Dialog open=\{open\}/);
  assert.match(app, /<DialogTitle>\{title\}<\/DialogTitle>/);
  assert.match(app, /aria-label="Team members"/);
  assert.match(app, /function TeamAvatarGroup[\s\S]*?<AvatarGroup/);
  assert.match(app, /Connected Teams/);
  assert.match(app, /function TeamChatWorkspace/);
  assert.match(app, /Connected Team timeline/);
  assert.match(app, /<Conversation className="team-timeline-conversation"/);
  assert.match(app, /<ConversationContent className="team-timeline"/);
  assert.match(app, /<ConversationScrollButton/);
  assert.match(app, /Visible handoff/);
  assert.match(app, /Stop run/);
  assert.match(app, /Send direction/);
  assert.match(app, /Retry same goal/);
  assert.match(app, /team-dialog-error/);
  assert.match(app, /team-run-limit/);
  assert.match(app, /chat\.latestRun\?\.activeAgentId/);
  assert.doesNotMatch(app, /\["a" \+ "ctiveAgentId"\]/);
  assert.doesNotMatch(teamView, /Attachment|Mention/);
  assert.match(styles, /\.team-sidebar-section/);
  assert.match(styles, /\.team-timeline/);
  assert.match(styles, /\.team-handoff-event/);

  for (const method of [
    "listTeamChats",
    "createTeamChat",
    "openTeamChat",
    "renameTeamChat",
    "updateTeamMembers",
    "deleteTeamChat",
    "startTeamRun",
    "stopTeamRun",
    "retryTeamRun",
    "resumeTeamRun",
  ]) assert.match(preload, new RegExp(`\\b${method}:`));
});

test("team protocol and storage remain main-process concerns", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const main = await readFile(new URL("../electron/main.mjs", import.meta.url), "utf8");
  const database = await readFile(new URL("../electron/app-database.mjs", import.meta.url), "utf8");
  const orchestrator = await readFile(new URL("../electron/team-chats.mjs", import.meta.url), "utf8");

  assert.match(main, /initializeTeamOrchestrator/);
  assert.match(main, /pi:start-team-run/);
  assert.match(main, /pi:stop-team-run/);
  assert.match(main, /pi:resume-team-run/);
  assert.match(main, /buildTeamPrompt/);
  assert.match(main, /activeTeamChatId/);
  assert.match(main, /function teamAgentIsInFlight/);
  assert.match(main, /rejectTeamAgentMutation\(agentId\)/);
  const inFlight = main.match(/function teamAgentIsInFlight\(agentId\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(inFlight, /teamRuntimes/);
  assert.match(inFlight, /run\?\.status === "running"/);
  assert.match(inFlight, /run\.activeAgentId === agentId/);
  assert.match(inFlight, /run\.pendingAgentId === agentId/);
  const memberUpdate = main.match(/ipcMain\.handle\("pi:update-team-members"[\s\S]*?\n\}\);/)?.[0] ?? "";
  assert.match(memberUpdate, /teamOrchestrator\?\.isRunning\(teamChatId\)/);
  assert.doesNotMatch(memberUpdate, /waiting/);
  assert.match(app, /const canManageMembers = !busy && !\["running", "queued"\]\.includes\(runStatus\)/);
  const availability = main.match(/function teamMemberAvailable\(member\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(availability, /profile\.workspace/);
  assert.doesNotMatch(availability, /member\.workspace/);
  assert.match(main, /function teamLiveProfile\(member\)[\s\S]*?return \{ \.\.\.profile \}/);
  assert.match(main, /deleteTeamSession\(teamChatId, member\.agentId\)/);
  assert.match(main, /const selectedModel = selectedTeamModelFor\(profile\)/);
  assert.match(main, /cwd: profile\.workspace/);
  assert.match(main, /workspaceKind: profile\.workspaceKind/);
  assert.match(main, /workspaceTrusted: profile\.workspaceTrusted/);
  assert.match(main, /ipcMain\.handle\("pi:archive-agent"[\s\S]*?rejectTeamAgentMutation\(agentId\)/);
  assert.match(main, /ipcMain\.handle\("pi:delete-agent"[\s\S]*?rejectTeamAgentMutation\(agentId\)/);
  for (const handler of ["pi:set-agent-model", "pi:set-session-model", "pi:set-thinking-level"]) {
    assert.match(main, new RegExp(`ipcMain\\.handle\\("${handler}"[\\s\\S]*?rejectTeamAgentMutation\\(agentId\\)`));
  }
  assert.match(orchestrator, /class TeamOrchestrator/);
  assert.match(orchestrator, /TEAM_PROTOCOL_START/);
  assert.match(orchestrator, /Shared transcript/);
  for (const table of ["team_chats", "team_chat_members", "team_chat_events", "team_chat_runs", "team_member_sessions", "team_session_entries"]) {
    assert.match(database, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
});
