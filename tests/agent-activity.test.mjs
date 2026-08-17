import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("agent activity stays associated with its agent after switching the active runtime", async () => {
  const [main, app, types] = await Promise.all([
    readFile(new URL("../electron/main.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/types.ts", import.meta.url), "utf8"),
  ]);
  const relay = main.match(/function relay\(runtime, event\)[\s\S]*?function updatePendingSession/)?.[0] ?? "";
  const activeRuntimeGuard = relay.indexOf("if (runtime.key !== activeRuntimeKey) return;");
  const activityEvent = relay.indexOf('type: "agent-status"');

  assert.ok(activityEvent >= 0, "Electron must emit agent activity with an agent ID");
  assert.ok(activityEvent < activeRuntimeGuard, "agent activity must be relayed even after another agent becomes active");
  assert.match(app, /runningAgentIds/);
  assert.match(app, /runningAgentIds\.has\(agent\.id\)/);
  assert.match(app, /unreadAgentIds/);
  assert.match(app, /!event\.running && activeAgentIdRef\.current !== event\.agentId/);
  assert.match(app, /unreadAgentIds\.has\(agent\.id\)/);
  assert.match(app, /agent-unread-indicator/);
  assert.match(main, /latestResponseAt: latestResponse\?\.timestamp/);
  assert.match(types, /latestResponseAt\?: string/);
});
