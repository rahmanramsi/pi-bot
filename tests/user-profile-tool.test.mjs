import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createUserProfileTool, USER_PROFILE_TOOL_NAME } from "../electron/user-profile-tool.mjs";

test("returns only populated fields from the latest user profile", async () => {
  let current = { avatar: "🙂", name: " Rahman ", about: "" };
  const tool = createUserProfileTool(() => current);

  assert.equal(tool.name, USER_PROFILE_TOOL_NAME);
  assert.deepEqual(tool.parameters, { type: "object", properties: {}, additionalProperties: false });
  assert.match(tool.description, /cannot change the profile/);
  assert.deepEqual((await tool.execute()).details.profile, { avatar: "🙂", name: "Rahman" });

  current = { avatar: "", name: "", about: "Prefers concise answers." };
  const result = await tool.execute();
  assert.deepEqual(result.details.profile, { about: "Prefers concise answers." });
  assert.equal(result.content[0].text, JSON.stringify({ about: "Prefers concise answers." }, null, 2));
});

test("reports an empty profile without fabricating identity", async () => {
  const tool = createUserProfileTool(() => ({ avatar: "", name: "", about: "" }));
  const result = await tool.execute();

  assert.deepEqual(result.details.profile, {});
  assert.equal(result.content[0].text, "No user profile has been set.");
});

test("registers the read-only profile tool for interactive and scheduled agents", async () => {
  const main = await readFile(new URL("../electron/main.mjs", import.meta.url), "utf8");

  assert.match(main, /const agentTools = \[\.\.\.codingTools, agentProfileToolName, USER_PROFILE_TOOL_NAME\]/);
  assert.equal(main.match(/customTools: \[createAgentProfileTool\([^)]*\), userProfileTool\]/g)?.length, 2);
  assert.equal(main.match(/tools: agentTools/g)?.length, 3);
  assert.doesNotMatch(main, /userProfileTool\.(create|update|delete|save)/);
});
