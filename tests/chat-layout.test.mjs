import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("chat header leads with the agent and uses the session as its subtitle", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const chatView = app.match(/function ChatView[\s\S]*?function AgentEditor/)?.[0] ?? "";

  assert.match(chatView, /chat-header-leading[\s\S]*?<AgentAvatar agent=\{agent\} \/>[\s\S]*?<h1>\{agent\?\.name \?\? "No active agent"\}<\/h1>[\s\S]*?<span>\{data\.config\.session\?\.name \?\? "New session"\}<\/span>/);
  assert.doesNotMatch(chatView, /chat-header-avatar/);
  assert.doesNotMatch(chatView, /compactWorkspace/);

  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const agentAvatar = app.match(/function AgentAvatar[\s\S]*?function AgentSidebarSection/)?.[0] ?? "";
  const avatar = styles.match(/\.agent-avatar\s*\{([^}]*)\}/)?.[1] ?? "";
  const activeAvatar = styles.match(/\.agent-avatar\.active\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(avatar, /width:\s*38px/);
  assert.match(avatar, /height:\s*38px/);
  assert.match(agentAvatar, /display: "grid"/);
  assert.match(agentAvatar, /color: "#fff"/);
  assert.match(agentAvatar, /placeItems: "center"/);
  assert.match(agentAvatar, /width: "100%"/);
  assert.match(agentAvatar, /height: "100%"/);
  assert.match(activeAvatar, /box-shadow:/);
});

test("individual chat messages do not repeat avatars or names", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const chatMessage = app.match(/function ChatMessage[\s\S]*?export function ReasoningRow/)?.[0] ?? "";

  assert.doesNotMatch(chatMessage, /chat-avatar|chat-message-meta|AgentAvatar|>You</);
  assert.match(chatMessage, /chat-message-footer/);
  assert.match(chatMessage, /isUser \? "Copy message" : "Copy response"/);
  assert.match(chatMessage, /\{item\.body && <MessageActions/);
  assert.doesNotMatch(chatMessage, /!isUser && item\.body/);
  assert.doesNotMatch(styles, /^\.chat-avatar/m);
  assert.doesNotMatch(styles, /^\.chat-message-meta/m);
  assert.match(styles, /\.reasoning-row\s*\{[^}]*margin-left:\s*0/);
  assert.match(styles, /\.activity-group\s*\{[^}]*margin-left:\s*0/);
});

test("empty conversation does not repeat the agent avatar or name", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const eventRows = app.match(/function EventRows[\s\S]*?function AgentAvatar/)?.[0] ?? "";

  assert.match(eventRows, /<ConversationEmptyState className="empty-conversation" title="Start a conversation"/);
  assert.doesNotMatch(eventRows, /icon=|agent\?\.name|Assistant/);
  assert.doesNotMatch(styles, /empty-orbit/);
});
