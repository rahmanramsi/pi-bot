import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("chat topbar identifies the active agent instead of the session title", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const chatView = app.match(/function ChatView[\s\S]*?function AgentEditor/)?.[0] ?? "";

  assert.match(chatView, /chat-section-topbar/);
  assert.match(chatView, /AgentAvatar[\s\S]*?agent|agent[\s\S]*?AgentAvatar/);
  assert.match(chatView, /agent\?\.name|agent\.name/);
  assert.match(chatView, /<AgentAvatar[\s\S]*?<strong>[\s\S]*?<DropdownMenu>[\s\S]*?<DropdownMenuTrigger[\s\S]*?chat-agent-menu-button[\s\S]*?<DropdownMenuContent/);
  assert.match(chatView, /<DropdownMenuItem[\s\S]*?Chat history<\/DropdownMenuItem>/);
  assert.doesNotMatch(chatView, /chat-history-button/);
  assert.doesNotMatch(chatView, /chat-session-title/);
  assert.doesNotMatch(chatView, /data\.config\.session\?\.name/);
  assert.doesNotMatch(chatView, /chat-header|chat-header-leading|chat-header-avatar/);
  assert.doesNotMatch(chatView, /compactWorkspace/);
  assert.match(app, /view === "chat" \? <motion\.div className="app-view" key="chat"/);
  assert.doesNotMatch(app, /key=\{`chat-\$\{workspacePanelSessionKey\(data\)\}`\}/);
  assert.match(app, /<Conversation key=\{sessionId\} className="conversation-scroll" aria-label="Conversation" initial="instant">/);

  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const agentAvatar = app.match(/function AgentAvatar[\s\S]*?(?:function|const) (?:AgentInbox|AgentSidebarSection)/)?.[0] ?? "";
  const avatar = styles.match(/\.agent-avatar\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(avatar, /width:\s*38px/);
  assert.match(avatar, /height:\s*38px/);
  assert.match(styles, /\.agent-avatar::after \{ display: none; \}/);
  assert.match(styles, /\.agent-avatar \[data-slot="avatar-fallback"\]\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?font-size:\s*32px/);
  assert.doesNotMatch(agentAvatar, /agentColor|backgroundColor|active/);
  assert.doesNotMatch(styles, /\.agent-avatar\.active/);
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

test("agent avatars use an emoji picker with a robot default", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const main = await readFile(new URL("../electron/main.mjs", import.meta.url), "utf8");
  const editor = app.match(/function AvatarEmojiPicker[\s\S]*?function AuthProviderRow/)?.[0] ?? "";

  assert.match(app, /import \{ EmojiPicker \} from "frimousse"/);
  assert.match(app, /const defaultAvatarEmoji = "🤖"/);
  assert.match(editor, /<PopoverTrigger render=\{<Button type="button" variant="outline" className="avatar-picker-trigger"/);
  assert.match(editor, /<EmojiPicker\.Root columns=\{8\} onEmojiSelect=/);
  assert.match(editor, /<EmojiPicker\.Search aria-label="Search emoji"/);
  assert.match(editor, /<span>Avatar<\/span><AvatarEmojiPicker/);
  assert.doesNotMatch(editor, /<span>Avatar<\/span><Input/);
  assert.match(main, /initials: "🤖"/);
});
