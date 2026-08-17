import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { agentProfileToolName, createAgentProfileTool } from "../electron/agent-profile-tool.mjs";

const mainSource = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");

test("agent profile tool returns only its own app-owned profile fields", async () => {
  const tool = createAgentProfileTool({
    id: "researcher",
    name: "Researcher",
    description: "Finds reliable answers.",
    instructions: "Use primary sources.",
    workspace: "/private/workspace",
    workspaceTrusted: true,
  });

  const result = await tool.execute();
  const expected = {
    id: "researcher",
    name: "Researcher",
    description: "Finds reliable answers.",
    instructions: "Use primary sources.",
  };

  assert.equal(tool.name, agentProfileToolName);
  assert.deepEqual(result.details, expected);
  assert.deepEqual(JSON.parse(result.content[0].text), expected);
  assert.equal(result.content[0].text.includes("workspace"), false);
});

test("interactive and scheduled sessions receive the agent profile tool", () => {
  assert.match(mainSource, /agentTools = \[\.\.\.codingTools, agentProfileToolName, USER_PROFILE_TOOL_NAME\]/);
  assert.equal(mainSource.match(/customTools: \[createAgentProfileTool\([^)]*\), userProfileTool\]/g)?.length, 2);
});
