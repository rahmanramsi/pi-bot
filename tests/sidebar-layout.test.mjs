import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function readLayoutSources() {
  const [app, styles, sidebar] = await Promise.all([
    readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../src/components/ui/sidebar.tsx", import.meta.url), "utf8"),
  ]);
  return { app, styles, sidebar };
}

function appSidebarSource(app) {
  return app.match(/function AppSidebar[\s\S]*?function ErrorBanner/)?.[0] ?? "";
}

function agentInboxSource(app) {
  const start = app.search(/(?:function|const) (?:AgentInbox|AgentSidebarSection)/);
  if (start < 0) return "";
  const end = [
    app.indexOf("\ntype HistorySidebarProps", start),
    app.indexOf("\nfunction HistorySidebar", start),
    app.indexOf("\ntype SessionSidebarProps", start),
    app.indexOf("\nfunction AppSidebar", start),
  ].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? app.length;
  return app.slice(start, end);
}

function historySource(app) {
  return app.match(/(?:function|const) (?:AgentHistory|HistorySidebar|SessionHistory|SessionSidebar)[\s\S]*?function AppSidebar/)?.[0] ?? "";
}

test("agent navigation is a full-width inbox with search and create action", async () => {
  const { app, styles } = await readLayoutSources();
  const sidebar = appSidebarSource(app);
  const inbox = agentInboxSource(app);

  assert.match(inbox, /(?:agent-inbox|AgentInbox|agent-list)/);
  assert.match(inbox, /(?:Search agents|placeholder=["']Search|aria-label=["']Search)/i);
  assert.match(inbox, /(?:agent-create-button|Create agent|onCreateAgent)/);

  // Agent history is a mode of this surface, not a second permanent column.
  assert.doesNotMatch(sidebar, /app-sidebar-columns/);
  assert.doesNotMatch(sidebar, /<SessionSidebar\b/);

  const openShell = styles.match(/\.app-shell\.sidebar-open\s*\{([^}]*)\}/)?.[1] ?? "";
  const sidebarWidth = Number(openShell.match(/grid-template-columns:\s*(\d+)px\s+minmax\(0,\s*1fr\)/)?.[1]);
  assert.ok(Number.isFinite(sidebarWidth), "open sidebar must declare a fixed layout width");
  assert.ok(sidebarWidth >= 300 && sidebarWidth <= 340, `sidebar width ${sidebarWidth}px must stay in the approved 300–340px range`);
});

test("agent rows show the latest response preview and a selected state", async () => {
  const { app } = await readLayoutSources();
  const inbox = agentInboxSource(app);

  assert.match(inbox, /sessionsByAgent|data\.sessions/);
  // The row must have enough information to behave like a chat inbox preview.
  assert.match(inbox, /(?:latest|modified|created|messageCount|preview|snippet|summary)/i);
  assert.match(inbox, /(?:shortDate|formatDate|<time|timestamp)/i);
  assert.match(inbox, /latest\?\.preview/);
  assert.doesNotMatch(inbox, /latest\?\.name/);
  assert.match(inbox, /selected/);
  assert.match(inbox, /data\.activeAgentId/);
  assert.match(inbox, /isActive|agent\.id === data\.activeAgentId/);
});

test("history is an in-place sidebar mode with back, new, open, and delete actions", async () => {
  const { app } = await readLayoutSources();
  const sidebar = appSidebarSource(app);
  const inbox = agentInboxSource(app);
  const history = historySource(app);

  assert.ok(history, "the sidebar must define an explicit history mode");
  assert.match(app, /(?:agent-history|history-mode|historyMode|showHistory|session-history)/i);
  assert.match(history, /(?:Back to agents|back-to-agents|history-back|onBack|setHistory)/i);
  assert.match(history, /(?:New session|New conversation|newSession|onNewChat|history-new)/i);
  assert.match(history, /(?:session-select|history-session|onOpenSession|openSession)/i);
  assert.match(history, /(?:session-delete|history-delete|onDeleteSession|deleteSession)/i);

  // There is exactly one shadcn Sidebar; history must not mount another one.
  assert.equal([...app.matchAll(/<Sidebar\b/g)].length, 1);
  assert.doesNotMatch(history, /<Sidebar\b/);
  assert.match(sidebar, /<HistorySidebar\b/);
  assert.match(sidebar, /historyAgentId[\s\S]*?<HistorySidebar[\s\S]*?:[\s\S]*?<AgentSidebarSection/);
  assert.doesNotMatch(sidebar, /app-sidebar-columns/);
  assert.doesNotMatch(sidebar, /<SessionSidebar\b/);
});

test("sidebar toggle keeps the main view placed and clear of window controls", async () => {
  const { app, sidebar, styles } = await readLayoutSources();

  assert.match(sidebar, /TooltipProvider/);
  assert.match(sidebar, /<TooltipProvider>[\s\S]*?<SidebarContext\.Provider/);
  assert.match(styles, /\.app-shell\.sidebar-open\s*>\s*\.app-view\s*\{[^}]*grid-column:\s*2/);
  assert.match(styles, /\.app-shell\.sidebar-closed\s*>\s*\.app-view\s*\{[^}]*grid-column:\s*1/);

  const toggle = styles.match(/\.sidebar-window-toggle\s*\{([^}]*)\}/)?.[1] ?? "";
  const appSidebarStyles = styles.match(/^\.app-sidebar\s*\{([^}]*)\}/m)?.[1] ?? "";
  const chatTopbar = styles.match(/^\.chat-section-topbar\s*\{([^}]*)\}/m)?.[1] ?? "";
  assert.match(toggle, /top:\s*10px/);
  assert.match(toggle, /left:\s*84px/);
  assert.match(toggle, /pointer-events:\s*auto/);
  assert.match(toggle, /-webkit-app-region:\s*no-drag/);
  assert.match(appSidebarStyles, /-webkit-app-region:\s*no-drag/);
  assert.match(chatTopbar, /-webkit-app-region:\s*drag/);
  assert.match(app, /combined-sidebar-topbar section-topbar[\s\S]*?<SidebarTrigger className="sidebar-window-toggle"/);
  assert.match(app, /!sidebarOpen && <SidebarTrigger className="sidebar-window-toggle"/);
});

test("primary sections share one 46px topbar contract", async () => {
  const { app, styles } = await readLayoutSources();

  assert.match(styles, /--section-topbar-height:\s*46px/);
  assert.match(styles, /\.section-topbar\s*\{[^}]*height:\s*var\(--section-topbar-height\)/);
  assert.match(app, /combined-sidebar-topbar/);
  assert.doesNotMatch(app, /agent-section-topbar/);
  assert.doesNotMatch(app, /session-section-topbar/);
  assert.match(app, /chat-section-topbar/);
  assert.match(app, /settings-section-topbar/);
  assert.match(app, /workspace-panel-topbar section-topbar/);
});

test("one sidebar titlebar sits above the inbox surface", async () => {
  const { app, styles } = await readLayoutSources();
  const sidebar = appSidebarSource(app);

  assert.match(sidebar, /<SidebarHeader className="combined-sidebar-topbar section-topbar"/);
  assert.match(sidebar, /(?:AgentInbox|AgentSidebarSection|agent-inbox)/);
  assert.doesNotMatch(sidebar, /app-sidebar-columns/);
  assert.doesNotMatch(sidebar, /<SessionSidebar\b/);

  const topbar = styles.match(/\.combined-sidebar-topbar\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(topbar, /-webkit-app-region:\s*drag/);
});

test("right workspace owns one complete topbar", async () => {
  const { app, styles } = await readLayoutSources();

  assert.match(app, /workspace-panel-topbar section-topbar/);
  assert.match(app, /className="workspace-panel-close"/);
  assert.match(app, /className="workspace-panel-show"/);
  assert.doesNotMatch(app, /className="workspace-panel-toggle"/);

  const topbar = styles.match(/\.workspace-panel-topbar\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(topbar, /justify-content:\s*space-between/);
  assert.match(topbar, /height:\s*var\(--section-topbar-height\)/);
});
