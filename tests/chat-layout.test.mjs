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
  assert.match(chatView, /chat-agent-menu-button[\s\S]*?<MoreHorizontal/);
  assert.match(chatView, /<DropdownMenuItem[\s\S]*?Chat history<\/DropdownMenuItem>/);
  assert.doesNotMatch(chatView, /<ChevronDown/);
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
  assert.match(app, /function AgentAvatar[\s\S]*?<BlobAvatar name=\{agent\.name\} animate=\{animate\}/);
  // Every avatar surface idles continuously: sidebar list, settings list,
  // history header, chat header, and the agent editor title.
  assert.equal(app.match(/<AgentAvatar agent=\{agent\} animate="always" \/>/g)?.length, 5);
  assert.doesNotMatch(styles, /\.agent-avatar::after/);
  assert.doesNotMatch(styles, /\.agent-avatar \[data-slot="avatar-fallback"\]/);
  assert.doesNotMatch(agentAvatar, /agentColor|backgroundColor|active/);
  assert.doesNotMatch(styles, /\.agent-avatar\.active/);
});

test("opening a chat focuses its message input", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const composer = app.match(/export function Composer[\s\S]*?function activityLabel/)?.[0] ?? "";
  const chatView = app.match(/function ChatView[\s\S]*?function AgentEditor/)?.[0] ?? "";

  assert.match(composer, /const inputRef = useRef<HTMLTextAreaElement>\(null\)/);
  assert.match(composer, /if \(!disabled\) inputRef\.current\?\.focus\(\)/);
  assert.match(composer, /\[disabled, focusKey\]/);
  assert.match(composer, /<PromptInputTextarea[\s\S]*?ref=\{inputRef\}/);
  assert.match(chatView, /<Composer[\s\S]*?focusKey=\{workspacePanelSessionKey\(data\)\}/);
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

test("avatars render deterministic blobatars derived from the name", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const main = await readFile(new URL("../electron/main.mjs", import.meta.url), "utf8");
  const component = await readFile(new URL("../src/components/ui/blob-avatar.tsx", import.meta.url), "utf8");
  const agentAvatar = app.match(/function AgentAvatar[\s\S]*?function AgentSidebarSection/)?.[0] ?? "";
  const editor = app.match(/function AgentEditor[\s\S]*?function AuthProviderRow/)?.[0] ?? "";

  assert.match(app, /import \{ BlobAvatar \} from "@\/components\/ui\/blob-avatar"/);
  assert.match(agentAvatar, /<BlobAvatar name=\{agent\.name\} animate=\{animate\} className=\{`agent-avatar \$\{className\}`\} \/>/);
  assert.match(editor, /<span>Avatar<\/span><BlobAvatar name=\{name\.trim\(\) \|\| defaultAgentAvatarName\} animate="always"/);
  assert.match(editor, /<span>Avatar<\/span><BlobAvatar name=\{name\.trim\(\) \|\| agent\.name\} animate="always"/);
  assert.match(app, /<BlobAvatar name=\{name\.trim\(\) \|\| defaultAvatarName\} animate="always" className="profile-avatar-blob" \/>/);
  // Motion is opt-in through the wrapper: lists idle on hover, single avatars run always.
  assert.match(component, /import "blobatar\/motion\.css"/);
  assert.match(component, /animate\?: "hover" \| "always"/);
  assert.doesNotMatch(app, /frimousse|EmojiPicker|AvatarEmojiPicker|defaultAvatarEmoji|defaultUserAvatarEmoji/);
  // The stored initials field survives for data-model compatibility but is never rendered.
  assert.doesNotMatch(app, /agent\.initials\}\}/);
  assert.match(main, /initials: "🤖"/);
});
