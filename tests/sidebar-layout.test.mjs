import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("agent rows stay packed at the top of the combined sidebar", async () => {
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const agentList = styles.match(/\.agent-list\s*\{([^}]*)\}/)?.[1] ?? "";
  const createAgent = styles.match(/\.agent-create-button\s*\{([^}]*)\}/)?.[1] ?? "";
  const sidebarColumns = styles.match(/\.app-sidebar-columns\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.match(agentList, /align-content:\s*start/);
  assert.match(agentList, /grid-auto-rows:\s*max-content/);
  assert.match(createAgent, /width:\s*42px/);
  assert.match(createAgent, /height:\s*42px/);
  assert.match(sidebarColumns, /grid-template-columns:\s*72px\s+minmax\(0,\s*1fr\)/);
});

test("agent rail owns the brand and bottom controls", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const section = app.match(/function AgentSidebarSection[\s\S]*?type SessionSidebarProps/)?.[0] ?? "";
  const actions = styles.match(/\.agent-rail-actions\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.match(section, /agent-rail-brand/);
  assert.match(section, /agent-rail-actions/);
  assert.match(section, /agent-create-button/);
  assert.doesNotMatch(section, /<Switch/);
  assert.match(section, /<Sun/);
  assert.match(section, /<Moon/);
  assert.match(section, /App settings/);
  assert.doesNotMatch(section, /SidebarGroupLabel/);
  assert.match(actions, /flex-direction:\s*column/);
  assert.ok(section.indexOf("agent-create-button") < section.indexOf("agent-theme-button"));
});

test("sidebar toggle keeps the main view placed and clear of window controls", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const sidebar = await readFile(new URL("../src/components/ui/sidebar.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

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
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(styles, /--section-topbar-height:\s*46px/);
  assert.match(styles, /\.section-topbar\s*\{[^}]*height:\s*var\(--section-topbar-height\)/);
  assert.match(app, /combined-sidebar-topbar/);
  assert.doesNotMatch(app, /agent-section-topbar/);
  assert.doesNotMatch(app, /session-section-topbar/);
  assert.match(app, /chat-section-topbar/);
  assert.match(app, /settings-section-topbar/);
  assert.match(app, /workspace-panel-topbar section-topbar/);
});

test("combined sidebar owns one titlebar above both columns", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  const sidebar = app.match(/function AppSidebar[\s\S]*?function ErrorBanner/)?.[0] ?? "";

  assert.match(sidebar, /<SidebarHeader className="combined-sidebar-topbar section-topbar"/);
  assert.match(sidebar, /<div className="app-sidebar-columns">[\s\S]*?<AgentSidebarSection[\s\S]*?<SessionSidebar/);
  assert.ok(sidebar.indexOf("combined-sidebar-topbar") < sidebar.indexOf("app-sidebar-columns"));

  const columns = styles.match(/\.app-sidebar-columns\s*\{([^}]*)\}/)?.[1] ?? "";
  const brand = styles.match(/\.agent-rail-brand\s*\{([^}]*)\}/)?.[1] ?? "";
  const sessions = styles.match(/\.session-sidebar-header\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(columns, /grid-template-columns:\s*72px\s+minmax\(0,\s*1fr\)/);
  assert.match(brand, /height:\s*58px/);
  assert.match(sessions, /height:\s*58px/);
});

test("session empty state stays compact and groups its copy", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  const sidebar = app.match(/function SessionSidebar[\s\S]*?function AppSidebar/)?.[0] ?? "";
  const empty = styles.match(/\.session-empty\s*\{([^}]*)\}/)?.[1] ?? "";
  const header = styles.match(/\.session-empty \[data-slot="empty-header"\]\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.match(sidebar, /<Empty className="session-empty"><EmptyMedia[\s\S]*?<EmptyHeader>[\s\S]*?<EmptyTitle>/);
  assert.match(empty, /grid-template-columns:\s*28px\s+minmax\(0,\s*1fr\)/);
  assert.match(empty, /align-content:\s*start/);
  assert.match(empty, /flex:\s*0 0 auto/);
  assert.match(header, /display:\s*grid/);
  assert.match(header, /min-width:\s*0/);
});

test("right workspace owns one complete topbar", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(app, /workspace-panel-topbar section-topbar/);
  assert.match(app, /className="workspace-panel-close"/);
  assert.match(app, /className="workspace-panel-show"/);
  assert.doesNotMatch(app, /className="workspace-panel-toggle"/);

  const topbar = styles.match(/\.workspace-panel-topbar\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(topbar, /justify-content:\s*space-between/);
  assert.match(topbar, /height:\s*var\(--section-topbar-height\)/);
});
