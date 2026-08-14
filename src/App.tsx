import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FolderOpen,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  MessageSquarePlus,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type {
  AgentId,
  AgentProfile,
  AuthPrompt,
  PiBootstrap,
  PiConfig,
  PiEvent,
  PiModelOption,
  ProviderAuthMethod,
  ProviderInfo,
  SessionSummary,
  ThinkingLevel,
  TimelineItem,
} from "./types";

type View = "chat" | "settings";
type SettingsSection = "agents" | "models";

function readableError(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason.replace(/^Error:\s*/, "");
  return "Something went wrong.";
}

function shortDate(value?: string) {
  if (!value) return "New";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function timeNow() {
  return new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date());
}

function formatTokenCount(value: number | null) {
  if (value === null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

function labelThinkingLevel(level: ThinkingLevel) {
  return level === "off" ? "Off" : level[0].toUpperCase() + level.slice(1);
}

function findAgent(agents: AgentProfile[], id?: AgentId | null) {
  return agents.find((agent) => agent.id === id) ?? agents.find((agent) => !agent.archived) ?? agents[0];
}

function emptyBootstrap(): PiBootstrap {
  return {
    config: {
      agentId: null,
      workspace: "",
      workspaceKind: "",
      workspaceTrusted: false,
      model: "No model selected",
      modelKey: "",
      defaultModelKey: "",
      modelAvailable: false,
      provider: "",
      thinkingLevel: "medium",
      availableThinkingLevels: [],
      streaming: false,
      context: { tokens: null, contextWindow: 0, percent: null },
      models: [],
      tools: [],
      session: null,
    },
    transcript: [],
    sessions: [],
    sessionsByAgent: {},
    agents: [],
    setup: { required: true, canImportPiAuth: false, piAuthPath: "", credentialStorage: "protected-app-file", providers: [] },
    authenticated: false,
    activeAgentId: null,
  };
}

function providerLabel(provider: string) {
  const knownLabels: Record<string, string> = {
    anthropic: "Anthropic",
    deepseek: "DeepSeek",
    google: "Google",
    openai: "OpenAI",
    "openai-codex": "OpenAI Codex",
  };
  return knownLabels[provider] ?? provider.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function modelGroups(models: PiModelOption[]) {
  const grouped = new Map<string, PiModelOption[]>();
  for (const model of models) grouped.set(model.provider, [...(grouped.get(model.provider) ?? []), model]);
  return Array.from(grouped, ([provider, providerModels]) => ({ provider, label: providerLabel(provider), models: providerModels }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function ModelSelect({
  value,
  models,
  onChange,
  disabled,
  placeholder = "Choose a model",
  className,
}: {
  value: string;
  models: PiModelOption[];
  onChange: (key: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const groups = modelGroups(models)
    .map((group) => ({
      ...group,
      models: group.models.filter((model) => !normalizedQuery || `${model.name} ${model.id} ${model.provider} ${group.label}`.toLocaleLowerCase().includes(normalizedQuery)),
    }))
    .filter((group) => group.models.length > 0);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <Select open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setQuery(""); }} value={value || null} itemToStringLabel={(key) => models.find((model) => model.key === String(key))?.name ?? placeholder} onValueChange={(next) => { if (next) onChange(next); }}>
      <SelectTrigger size="sm" className={className} disabled={disabled} aria-label="Model">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="model-select-content" align="start" alignItemWithTrigger={false}>
        <div className="model-select-search" onKeyDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
          <Search aria-hidden="true" />
          <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search models…" aria-label="Search models" />
        </div>
        {groups.map((group) => (
          <SelectGroup key={group.provider}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.models.map((model) => <SelectItem value={model.key} key={model.key}>{model.name}</SelectItem>)}
          </SelectGroup>
        ))}
        {groups.length === 0 && <div className="model-select-empty">No models match “{query}”.</div>}
      </SelectContent>
    </Select>
  );
}

function ThinkingSelect({
  value,
  levels,
  onChange,
  disabled,
}: {
  value: ThinkingLevel;
  levels: ThinkingLevel[];
  onChange: (level: ThinkingLevel) => void;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(next) => { if (next) onChange(next as ThinkingLevel); }}>
      <SelectTrigger size="sm" className="thinking-select-trigger" disabled={disabled} aria-label="Reasoning level">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        {levels.map((level) => <SelectItem value={level} key={level}>{labelThinkingLevel(level)}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function ComposerSettings({
  config,
  busy,
  reasoningLevels,
  onModelChange,
  onThinkingChange,
}: {
  config: PiConfig;
  busy: boolean;
  reasoningLevels: ThinkingLevel[];
  onModelChange: (key: string) => void;
  onThinkingChange: (level: ThinkingLevel) => void;
}) {
  const model = config.models.find((item) => item.key === config.modelKey);
  return (
    <Popover.Root>
      <Popover.Trigger className="composer-settings-trigger" disabled={busy || config.models.length === 0} aria-label="Model and reasoning settings">
        <span>{model?.name ?? "Choose a model"}</span>
        <i aria-hidden="true">·</i>
        <span>{labelThinkingLevel(config.thinkingLevel)}</span>
        <ChevronDown aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="composer-settings-positioner" side="top" align="end" sideOffset={8}>
          <Popover.Popup className="composer-settings-popup" initialFocus={false}>
            <div className="composer-settings-row">
              <span>Model</span>
              <ModelSelect value={config.modelKey} models={config.models} onChange={onModelChange} disabled={busy || config.models.length === 0} className="composer-settings-select model" />
            </div>
            <div className="composer-settings-row">
              <span>Reasoning</span>
              <ThinkingSelect value={config.thinkingLevel} levels={reasoningLevels} onChange={onThinkingChange} disabled={busy || !config.modelAvailable} />
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Composer({
  busy,
  disabled,
  agentName,
  config,
  onPrompt,
  onAbort,
  onModelChange,
  onThinkingChange,
}: {
  busy: boolean;
  disabled: boolean;
  agentName: string;
  config: PiConfig;
  onPrompt: (message: string) => void;
  onAbort: () => void;
  onModelChange: (key: string) => void;
  onThinkingChange: (level: ThinkingLevel) => void;
}) {
  const [message, setMessage] = useState("");
  const contextPercent = config.context.percent === null ? 0 : Math.min(100, Math.max(0, config.context.percent));
  const contextLabel = config.context.percent === null ? "—" : config.context.percent > 0 && config.context.percent < 1 ? "<1%" : `${config.context.percent.toFixed(0)}%`;
  const reasoningLevels = config.availableThinkingLevels.length > 0 ? config.availableThinkingLevels : ["off"] as ThinkingLevel[];

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = message.trim();
    if (!value || busy || disabled) return;
    setMessage("");
    onPrompt(value);
  }

  return (
    <form className="composer" onSubmit={submit}>
      <Textarea
        className="composer-input"
        aria-label={`Message ${agentName}`}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }}
        placeholder={`Message ${agentName}…`}
        disabled={disabled}
        rows={2}
      />
      <div className="composer-toolbar">
        <div className="composer-toolbar-left">
          <span className="composer-prefix" aria-hidden="true">+</span>
          <div className="composer-context" title={`${formatTokenCount(config.context.tokens)} of ${formatTokenCount(config.context.contextWindow)} tokens used`}>
            <div className="context-meter" role="progressbar" aria-label="Context usage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={contextPercent}><span style={{ width: `${contextPercent}%` }} /></div>
            <span>Context {contextLabel}</span>
          </div>
        </div>
        <div className="composer-actions">
          <ComposerSettings config={config} busy={busy} reasoningLevels={reasoningLevels} onModelChange={onModelChange} onThinkingChange={onThinkingChange} />
          {busy ? (
            <Button className="stop-button" size="icon" type="button" onClick={onAbort} aria-label="Stop response"><Square /></Button>
          ) : (
            <Button className="send-button" size="icon" type="submit" aria-label="Send message" disabled={disabled || !message.trim()}><ArrowUp /></Button>
          )}
        </div>
      </div>
    </form>
  );
}

function activityLabel(item: TimelineItem) {
  return item.label.replace(/^Tool\s*·\s*/, "");
}

function activityStatus(item: TimelineItem) {
  const status = item.status ?? "done";
  return {
    status,
    label: status === "running" ? "Working" : status === "failed" ? "Failed" : "Done",
    icon: status === "running" ? <LoaderCircle className="spin" /> : status === "failed" ? <CircleAlert /> : <Check />,
  };
}

function ActivityItem({ item }: { item: TimelineItem }) {
  const state = activityStatus(item);
  return (
    <details className={`activity-item ${state.status}`} open={state.status === "running"}>
      <summary>
        <span className="activity-glyph">{state.icon}</span>
        <strong>{activityLabel(item)}</strong>
        <time>{item.timestamp}</time>
        <span className={`activity-status ${state.status}`}>{state.label}</span>
        <ChevronRight className="activity-chevron" />
      </summary>
      <pre>{item.body || (state.status === "running" ? "Working…" : "No detail returned.")}</pre>
    </details>
  );
}

function ActivityList({ items }: { items: TimelineItem[] }) {
  return <div className="activity-list">{items.map((item) => <ActivityItem item={item} key={item.id} />)}</div>;
}

function ActivityGroup({ items }: { items: TimelineItem[] }) {
  const names = items.map(activityLabel);
  const preview = names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  return (
    <details className="activity-group">
      <summary>
        <span className="activity-group-glyph" aria-hidden="true"><i /><i /><i /></span>
        <strong>{items.length} tool {items.length === 1 ? "activity" : "activities"}</strong>
        <span className="activity-group-preview">{preview}</span>
        <ChevronRight className="activity-group-chevron" />
      </summary>
      <ActivityList items={items} />
    </details>
  );
}

function MarkdownContent({ body }: { body: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

function ChatMessage({ item, agent }: { item: TimelineItem; agent?: AgentProfile }) {
  const isUser = item.kind === "user";
  return (
    <article className={`chat-message ${isUser ? "user" : "assistant"}`}>
      <div className="chat-avatar" aria-hidden="true">{isUser ? "YO" : agent?.initials ?? "AS"}</div>
      <div className="chat-message-main">
        <div className="chat-message-meta">
          <strong>{isUser ? "You" : agent?.name ?? "Assistant"}</strong>
          <time>{item.timestamp}</time>
          {item.status === "failed" && <Badge variant="destructive">Failed</Badge>}
        </div>
        <div className="chat-bubble"><div className="chat-body"><MarkdownContent body={item.body || "Thinking…"} /></div></div>
      </div>
    </article>
  );
}

function AgentWorking({ agent }: { agent?: AgentProfile }) {
  const name = agent?.name ?? "Assistant";
  return (
    <article className="chat-message assistant agent-working" role="status" aria-label={`${name} is working`}>
      <div className="chat-avatar" aria-hidden="true">{agent?.initials ?? "AS"}</div>
      <div className="chat-message-main">
        <div className="chat-message-meta"><strong>{name}</strong><span className="agent-working-label">Working…</span></div>
        <div className="chat-bubble"><div className="agent-working-dots" aria-hidden="true"><span /><span /><span /></div></div>
      </div>
    </article>
  );
}

function EventRows({ items, agent, responding }: { items: TimelineItem[]; agent?: AgentProfile; responding: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const blocks: Array<{ kind: "message"; item: TimelineItem } | { kind: "activity"; items: TimelineItem[] }> = [];
  for (const item of items) {
    const activity = item.kind === "tool" || item.kind === "status";
    const previous = blocks[blocks.length - 1];
    if (activity && previous?.kind === "activity") previous.items.push(item);
    else if (activity) blocks.push({ kind: "activity", items: [item] });
    else blocks.push({ kind: "message", item });
  }
  const latest = items.at(-1);
  const assistantIsStreaming = latest?.kind === "assistant" && latest.status === "running";
  const showAgentWorking = responding && !assistantIsStreaming;

  useEffect(() => {
    if (following && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [items.length, items.at(-1)?.body, following, showAgentWorking]);

  function handleScroll() {
    const element = scrollRef.current;
    if (!element) return;
    setFollowing(element.scrollHeight - element.scrollTop - element.clientHeight < 80);
  }

  function jumpToLatest() {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    setFollowing(true);
  }

  return (
    <div className="conversation-feed">
      {items.length === 0 ? (
        <div className="empty-conversation">
          <div className="empty-orbit"><Bot /></div>
          <h2>Start a conversation with {agent?.name ?? "Assistant"}</h2>
          <p>Ask a question or describe what you want to work on.</p>
        </div>
      ) : (
        <div className="conversation-scroll" ref={scrollRef} onScroll={handleScroll} role="log" aria-label="Conversation">
          <div className="conversation-blocks">
            {blocks.map((block) => block.kind === "activity"
              ? <ActivityGroup items={block.items} key={`activity-${block.items[0].id}`} />
              : <ChatMessage item={block.item} agent={agent} key={block.item.id} />)}
            {showAgentWorking && <AgentWorking agent={agent} />}
          </div>
        </div>
      )}
      {!following && items.length > 0 && <Button className="jump-latest" variant="outline" size="sm" onClick={jumpToLatest}><ArrowDown /> Latest</Button>}
    </div>
  );
}

function AgentAvatar({ agent }: { agent: AgentProfile }) {
  return <span className="agent-avatar">{agent.initials}</span>;
}

function AgentSidebar({
  data,
  busy,
  expanded,
  onToggle,
  onSelect,
  onNewChat,
  onSettings,
  onOpenSession,
  onDeleteSession,
}: {
  data: PiBootstrap;
  busy: boolean;
  expanded: Record<string, boolean>;
  onToggle: (agentId: AgentId) => void;
  onSelect: (agentId: AgentId) => void;
  onNewChat: () => void;
  onSettings: () => void;
  onOpenSession: (session: SessionSummary) => void;
  onDeleteSession: (session: SessionSummary) => void;
}) {
  const agents = data.agents.filter((agent) => !agent.archived);
  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand"><span className="brand-mark"><Bot /></span><strong>Pi Bot</strong></div>
      <Button className="new-chat-button" onClick={onNewChat} disabled={!data.activeAgentId}><MessageSquarePlus /> New chat</Button>
      <div className="sidebar-section-label">Agents</div>
      <div className="agent-list">
        {agents.map((agent) => {
          const sessions = data.sessionsByAgent[agent.id] ?? [];
          const isOpen = Boolean(expanded[agent.id]);
          return (
            <div className={`agent-group ${agent.id === data.activeAgentId ? "active" : ""}`} key={agent.id}>
              <div className="agent-row">
                <button className="agent-main-button" type="button" onClick={() => onSelect(agent.id)}>
                  <AgentAvatar agent={agent} />
                  <span className="agent-row-copy"><strong>{agent.name}</strong><small>{sessions.length ? `${sessions.length} chat${sessions.length === 1 ? "" : "s"}` : "No chats yet"}</small></span>
                </button>
                <button className="history-chevron-button" type="button" onClick={() => onToggle(agent.id)} aria-label={`${isOpen ? "Collapse" : "Expand"} ${agent.name} chat history`}>
                  {isOpen ? <ChevronDown /> : <ChevronRight />}
                </button>
              </div>
              {isOpen && <div className="nested-history">
                {sessions.length === 0 && <p className="history-empty">No chat history yet.</p>}
                {sessions.map((chat) => (
                  <div className={`history-row ${chat.path === data.config.session?.path ? "selected" : ""}`} key={chat.path}>
                    <button type="button" onClick={() => onOpenSession(chat)}>
                      <span className="history-dot" />
                      <span><strong>{chat.name}</strong><small>{shortDate(chat.modified)}</small></span>
                    </button>
                    <button className="delete-chat-button" type="button" onClick={() => onDeleteSession(chat)} disabled={busy} aria-label={`Delete ${chat.name}`}><Trash2 /></button>
                  </div>
                ))}
              </div>}
            </div>
          );
        })}
      </div>
      {agents.length === 0 && <div className="no-agents-sidebar"><p>No active agents.</p><Button variant="outline" onClick={onSettings}>Create agent</Button></div>}
      <div className="sidebar-spacer" />
      <button className="settings-button" type="button" onClick={onSettings}><Settings2 /> App Settings</button>
    </aside>
  );
}

function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="error-line"><CircleAlert /><div><strong>Couldn’t complete that</strong><span>{message}</span></div></div>;
}

function ChatView({
  data,
  busy,
  error,
  onPrompt,
  onAbort,
  onModelChange,
  onThinkingChange,
}: {
  data: PiBootstrap;
  busy: boolean;
  error?: string;
  onPrompt: (message: string) => void;
  onAbort: () => void;
  onModelChange: (key: string) => void;
  onThinkingChange: (level: ThinkingLevel) => void;
}) {
  const agent = findAgent(data.agents, data.activeAgentId);
  const blocked = !agent || !data.config.modelAvailable;
  const responding = busy || data.config.streaming;
  return (
    <main className="chat-pane">
      <header className="chat-header">
        <div className="chat-header-agent">{agent && <AgentAvatar agent={agent} />}<div><h1>{agent?.name ?? "No active agent"}</h1><span>{data.config.session?.name ?? "New chat"}</span></div></div>
        {responding && <span className="responding-indicator"><i /> Responding</span>}
      </header>
      <ErrorBanner message={error} />
      {!data.authenticated && <div className="notice-line"><KeyRound /><span>Add a provider credential in App Settings to start chatting.</span></div>}
      {data.authenticated && blocked && agent && <div className="notice-line"><CircleAlert /><span>This agent’s model is unavailable. Choose another model in App Settings.</span></div>}
      <EventRows items={data.transcript} agent={agent} responding={responding} />
      <Composer busy={responding} disabled={blocked || responding} agentName={agent?.name ?? "Assistant"} config={data.config} onPrompt={onPrompt} onAbort={onAbort} onModelChange={onModelChange} onThinkingChange={onThinkingChange} />
    </main>
  );
}

function AgentEditor({
  agent,
  models,
  isNew,
  busy,
  onCreate,
  onSave,
  onChooseFolder,
  onTrustWorkspace,
  onArchive,
  onDelete,
  onModelChange,
}: {
  agent?: AgentProfile;
  models: PiModelOption[];
  isNew: boolean;
  busy: boolean;
  onCreate: (name: string, initials: string) => void;
  onSave: (agent: AgentProfile) => void;
  onChooseFolder: (agentId: AgentId) => void;
  onTrustWorkspace: (agentId: AgentId) => void;
  onArchive: (agent: AgentProfile) => void;
  onDelete: (agent: AgentProfile) => void;
  onModelChange: (agentId: AgentId, key: string) => void;
}) {
  const [name, setName] = useState(agent?.name ?? "");
  const [initials, setInitials] = useState(agent?.initials ?? "");
  const [instructions, setInstructions] = useState(agent?.instructions ?? "");
  useEffect(() => {
    setName(agent?.name ?? "");
    setInitials(agent?.initials ?? "");
    setInstructions(agent?.instructions ?? "");
  }, [agent?.id, agent?.name, agent?.initials, agent?.instructions, isNew]);

  if (isNew) {
    return <section className="settings-detail"><div className="detail-heading"><div><span className="eyebrow">New agent</span><h2>Create an agent</h2><p>Give this teammate a name. Its workspace starts isolated and empty.</p></div></div><div className="settings-form"><label className="form-field"><span>Name</span><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Release helper" /></label><label className="form-field compact-field"><span>Initials <em>optional</em></span><Input maxLength={4} value={initials} onChange={(event) => setInitials(event.target.value.toUpperCase())} placeholder="Auto" /></label><div className="settings-actions"><Button onClick={() => onCreate(name, initials)} disabled={busy || !name.trim()}><Plus /> Create agent</Button></div></div></section>;
  }

  if (!agent) return <section className="settings-detail empty-settings"><Bot /><h2>No active agents</h2><p>Create an agent to begin.</p></section>;
  return (
    <section className="settings-detail">
      <div className="detail-heading"><div className="detail-agent-title"><AgentAvatar agent={{ ...agent, initials: initials || agent.initials }} /><div><span className="eyebrow">Agent settings</span><h2>{agent.name}</h2><p>Identity, instructions, workspace, and default model for new chats.</p></div></div></div>
      <div className="settings-form">
        <div className="form-grid"><label className="form-field"><span>Name</span><Input value={name} onChange={(event) => setName(event.target.value)} disabled={busy} /></label><label className="form-field compact-field"><span>Initials</span><Input maxLength={4} value={initials} onChange={(event) => setInitials(event.target.value.toUpperCase())} disabled={busy} /></label></div>
        <label className="form-field"><span>Instructions <em>saved to this agent’s AGENTS.md</em></span><Textarea className="instructions-field" value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Leave empty to use Pi’s default behavior." disabled={busy} /></label>
        <div className="settings-card"><div className="settings-card-heading"><div><span className="eyebrow">Workspace</span><strong>{agent.workspaceKind === "app" ? "App-owned workspace" : "External workspace"}</strong></div><FolderOpen /></div><p className="workspace-path" title={agent.workspace}>{agent.workspace || "No workspace"}</p><div className="settings-card-actions"><Button variant="outline" size="sm" onClick={() => onChooseFolder(agent.id)} disabled={busy}><FolderOpen /> Change workspace</Button>{agent.workspaceKind === "external" && !agent.workspaceTrusted && <Button variant="outline" size="sm" onClick={() => onTrustWorkspace(agent.id)} disabled={busy}><ShieldCheck /> Trust skills</Button>}</div><small>{agent.workspaceTrusted ? "Workspace skills are available from .agents/skills." : "Skills are disabled until this workspace is trusted."}</small></div>
        <div className="form-field"><span>Default model <em>applies to new chats</em></span><ModelSelect value={agent.defaultModelKey} models={models} onChange={(key) => onModelChange(agent.id, key)} disabled={busy || models.length === 0} className="field-select-trigger" /></div>
        <div className="settings-actions"><Button onClick={() => onSave({ ...agent, name: name.trim() || agent.name, initials: initials.trim().slice(0, 4) || agent.initials, instructions })} disabled={busy || !name.trim()}><Check /> Save changes</Button></div>
      </div>
      <div className="danger-zone"><span className="eyebrow">Lifecycle</span><div className="danger-actions"><Button variant="outline" size="sm" onClick={() => onArchive(agent)} disabled={busy}>{agent.archived ? <RotateCcw /> : <Archive />}{agent.archived ? "Restore agent" : "Archive agent"}</Button><Button variant="destructive" size="sm" onClick={() => onDelete(agent)} disabled={busy}><Trash2 /> Delete permanently</Button></div><p>Archiving hides this agent from chat. Deleting removes its sessions; an external workspace folder is never deleted.</p></div>
    </section>
  );
}

function AuthProviderRow({ provider, busy, onApiKey, onOAuth, onLogout }: { provider: ProviderInfo; busy: boolean; onApiKey: (provider: ProviderInfo) => void; onOAuth: (provider: ProviderInfo) => void; onLogout: (provider: ProviderInfo) => void }) {
  return <div className="provider-row"><div className="provider-copy"><strong>{provider.name}</strong><small>{provider.configured ? `Connected${provider.label ? ` · ${provider.label}` : ""}` : provider.methods.length ? "Not connected" : "Environment or external setup"}</small></div><div className="provider-actions">{provider.methods.includes("api_key") && <Button variant="outline" size="sm" onClick={() => onApiKey(provider)} disabled={busy}><KeyRound /> API key</Button>}{provider.methods.includes("oauth") && <Button variant="outline" size="sm" onClick={() => onOAuth(provider)} disabled={busy}><ExternalLink /> Sign in</Button>}{provider.configured && <Button variant="ghost" size="sm" onClick={() => onLogout(provider)} disabled={busy}>Disconnect</Button>}</div></div>;
}

function ModelsSettings({ data, busy, onApiKey, onOAuth, onLogout, onImport }: { data: PiBootstrap; busy: boolean; onApiKey: (provider: ProviderInfo, apiKey?: string) => void; onOAuth: (provider: ProviderInfo) => void; onLogout: (provider: ProviderInfo) => void; onImport: () => void }) {
  const connected = data.setup.providers.filter((provider) => provider.configured).length;
  const [apiProvider, setApiProvider] = useState<ProviderInfo>();
  const [apiKey, setApiKey] = useState("");
  return <section className="settings-detail"><div className="detail-heading"><div><span className="eyebrow">App settings</span><h2>Models & authentication</h2><p>Credentials are global. Each agent chooses its own default model.</p></div></div><div className="settings-card security-card"><LockKeyhole /><div><strong>{connected ? `${connected} provider${connected === 1 ? "" : "s"} connected` : "No provider connected"}</strong><small>Stored in the app’s {data.setup.credentialStorage === "os-keychain" ? "OS keychain" : "protected app file"}.</small></div></div>{apiProvider && <div className="inline-auth-card"><div><span className="eyebrow">Connect provider</span><strong>{apiProvider.name}</strong></div><Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste an API key" autoFocus /><div className="settings-card-actions"><Button onClick={() => { onApiKey(apiProvider, apiKey); setApiKey(""); setApiProvider(undefined); }} disabled={busy || !apiKey.trim()}><KeyRound /> Save key</Button><Button variant="ghost" onClick={() => setApiProvider(undefined)}>Cancel</Button></div></div>}<div className="provider-list">{data.setup.providers.length ? data.setup.providers.map((provider) => <AuthProviderRow provider={provider} busy={busy} onApiKey={(selected) => setApiProvider(selected)} onOAuth={onOAuth} onLogout={onLogout} key={provider.id} />) : <p className="muted-copy">No provider authentication methods are available.</p>}</div>{data.setup.canImportPiAuth && <div className="import-card"><div><strong>Import from Pi</strong><p>One-time import of all credentials detected from your local Pi installation.</p></div><Button variant="outline" onClick={onImport} disabled={busy}><KeyRound /> Import Pi auth</Button></div>}<p className="settings-footnote">Pi Bot works without the Pi desktop app or CLI. Existing Pi credentials are only copied when you choose the one-time import.</p></section>;
}

function SettingsPage({
  data,
  busy,
  onBack,
  onUpdate,
  onCreate,
  onChooseFolder,
  onTrustWorkspace,
  onArchive,
  onDelete,
  onModelChange,
  onApiKey,
  onOAuth,
  onLogout,
  onImport,
}: {
  data: PiBootstrap;
  busy: boolean;
  onBack: () => void;
  onUpdate: (profile: AgentProfile) => void;
  onCreate: (name: string, initials: string) => void;
  onChooseFolder: (agentId: AgentId) => void;
  onTrustWorkspace: (agentId: AgentId) => void;
  onArchive: (agent: AgentProfile) => void;
  onDelete: (agent: AgentProfile) => void;
  onModelChange: (agentId: AgentId, key: string) => void;
  onApiKey: (provider: ProviderInfo, apiKey?: string) => void;
  onOAuth: (provider: ProviderInfo) => void;
  onLogout: (provider: ProviderInfo) => void;
  onImport: () => void;
}) {
  const [section, setSection] = useState<SettingsSection>("agents");
  const [selectedId, setSelectedId] = useState<AgentId | "new">(data.activeAgentId ?? (data.agents[0]?.id ?? "new"));
  useEffect(() => {
    if (selectedId !== "new" && !data.agents.some((agent) => agent.id === selectedId)) setSelectedId(data.agents[0]?.id ?? "new");
  }, [data.agents, selectedId]);
  const selected = selectedId === "new" ? undefined : data.agents.find((agent) => agent.id === selectedId);
  return <main className="settings-page"><header className="settings-header"><Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to chat"><ArrowLeft /></Button><div><span className="eyebrow">Pi Bot</span><h1>App Settings</h1></div></header><div className="settings-layout"><nav className="settings-nav"><button className={section === "agents" ? "selected" : ""} onClick={() => setSection("agents")}><Bot /><span>Agents</span><small>{data.agents.length}</small></button><button className={section === "models" ? "selected" : ""} onClick={() => setSection("models")}><KeyRound /><span>Models & authentication</span></button></nav>{section === "models" ? <ModelsSettings data={data} busy={busy} onApiKey={onApiKey} onOAuth={onOAuth} onLogout={onLogout} onImport={onImport} /> : <div className="agent-settings-layout"><aside className="settings-agent-list"><div className="settings-list-heading"><span className="eyebrow">All agents</span><Button variant="outline" size="icon-sm" onClick={() => setSelectedId("new")} disabled={busy} aria-label="Create agent"><Plus /></Button></div>{data.agents.map((agent) => <button className={`settings-agent-item ${selectedId === agent.id ? "selected" : ""} ${agent.archived ? "archived" : ""}`} key={agent.id} onClick={() => setSelectedId(agent.id)}><AgentAvatar agent={agent} /><span><strong>{agent.name}</strong><small>{agent.archived ? "Archived" : agent.workspaceKind === "external" ? "External workspace" : "App workspace"}</small></span></button>)}{data.agents.length === 0 && <p className="muted-copy">No agents yet.</p>}</aside><AgentEditor agent={selected} models={data.config.models} isNew={selectedId === "new"} busy={busy} onCreate={(name, initials) => onCreate(name, initials)} onSave={onUpdate} onChooseFolder={onChooseFolder} onTrustWorkspace={onTrustWorkspace} onArchive={onArchive} onDelete={onDelete} onModelChange={onModelChange} /></div>}</div></main>;
}

function AuthPromptCard({ prompt, notice, onRespond }: { prompt: { id: string; prompt: AuthPrompt }; notice?: string; onRespond: (value: string) => void }) {
  const [value, setValue] = useState("");
  return <div className="auth-prompt-card"><span className="eyebrow">Provider sign-in</span><h3>{prompt.prompt.message}</h3>{notice && <p className="auth-notice">{notice}</p>}{prompt.prompt.type === "select" ? <select className="field-select" value={value} onChange={(event) => setValue(event.target.value)}><option value="">Choose an option</option>{prompt.prompt.options?.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select> : <Input autoFocus type={prompt.prompt.type === "secret" ? "password" : "text"} value={value} onChange={(event) => setValue(event.target.value)} placeholder={prompt.prompt.placeholder} /> }<Button onClick={() => onRespond(value)} disabled={!value.trim()}><Check /> Continue</Button></div>;
}

function SetupPage({ data, busy, error, onImport, onApiKey, onOAuth }: { data: PiBootstrap; busy: boolean; error?: string; onImport: () => void; onApiKey: (providerId: string, apiKey: string) => void; onOAuth: (provider: ProviderInfo) => void }) {
  const apiProviders = data.setup.providers.filter((provider) => provider.methods.includes("api_key"));
  const [providerId, setProviderId] = useState(apiProviders[0]?.id ?? "");
  const [apiKey, setApiKey] = useState("");
  const provider = data.setup.providers.find((item) => item.id === providerId);
  return <main className="setup-page"><div className="setup-card"><div className="setup-mark"><Bot /></div><span className="eyebrow">First setup</span><h1>Set up Pi Bot</h1><p className="setup-lede">Connect a provider and start chatting with a workspace teammate.</p><ErrorBanner message={error} />{apiProviders.length > 0 ? <div className="setup-auth-form"><label className="form-field"><span>Provider</span><select className="field-select" value={providerId} onChange={(event) => setProviderId(event.target.value)}>{apiProviders.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="form-field"><span>API key</span><Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste a provider API key" /></label><Button className="setup-primary" onClick={() => onApiKey(providerId, apiKey)} disabled={busy || !apiKey.trim() || !providerId}>{busy ? <LoaderCircle className="spin" /> : <KeyRound />} Connect provider</Button>{provider?.methods.includes("oauth") && <Button variant="outline" onClick={() => onOAuth(provider)} disabled={busy}><ExternalLink /> Sign in with subscription</Button>}</div> : <p className="muted-copy">No direct API-key provider is available. You can import credentials from Pi if they are detected.</p>}{data.setup.canImportPiAuth && <div className="setup-import"><div><strong>Already use Pi?</strong><p>Import all detected Pi credentials once. The original auth stays untouched.</p></div><Button variant="outline" onClick={onImport} disabled={busy}><KeyRound /> Import auth from Pi</Button></div>}<p className="setup-storage"><LockKeyhole /> Credentials are stored in the app’s {data.setup.credentialStorage === "os-keychain" ? "OS keychain" : "protected app file"}.</p></div></main>;
}

export function App() {
  const [data, setData] = useState<PiBootstrap | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [view, setView] = useState<View>("chat");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [authPrompt, setAuthPrompt] = useState<{ id: string; prompt: AuthPrompt }>();
  const [authNotice, setAuthNotice] = useState<string>();
  const currentData = data ?? emptyBootstrap();

  useEffect(() => {
    const unsubscribe = window.piBot.onEvent((event: PiEvent) => {
      if (event.type === "assistant-delta") {
        setData((previous) => {
          if (!previous) return previous;
          const transcript = [...previous.transcript];
          const last = transcript.at(-1);
          if (last?.kind === "assistant" && last.status === "running") transcript[transcript.length - 1] = { ...last, body: `${last.body}${event.delta}`, status: "running" };
          else transcript.push({ id: `assistant-${Date.now()}`, kind: "assistant", label: findAgent(previous.agents, previous.activeAgentId)?.name ?? "Assistant", body: event.delta, status: "running", timestamp: timeNow() });
          return { ...previous, transcript };
        });
      } else if (event.type === "tool-start") {
        setData((previous) => previous ? { ...previous, transcript: [...previous.transcript, { id: event.id, kind: "tool", label: `Tool · ${event.name}`, body: event.detail, status: "running", timestamp: timeNow() }] } : previous);
      } else if (event.type === "tool-update") {
        setData((previous) => {
          if (!previous) return previous;
          return { ...previous, transcript: previous.transcript.map((item) => item.id === event.id ? { ...item, body: event.detail } : item) };
        });
      } else if (event.type === "tool-end") {
        setData((previous) => previous ? { ...previous, transcript: previous.transcript.map((item) => item.id === event.id ? { ...item, body: event.detail, status: event.failed ? "failed" : "done" } : item) } : previous);
      } else if (event.type === "agent-start") setBusy(true);
      else if (event.type === "agent-settled" || event.type === "aborted") setBusy(false);
      else if (event.type === "agent-end" && !event.retrying) setBusy(false);
      else if (event.type === "error") { setBusy(false); setError(event.message); }
      else if (event.type === "auth-prompt") setAuthPrompt({ id: event.id, prompt: event.prompt });
      else if (event.type === "auth-notify") setAuthNotice(event.event.message || event.event.instructions || (event.event.url ? `Continue in your browser: ${event.event.url}` : undefined));
      else if (event.type === "session-sync") setData((previous) => previous ? { ...previous, transcript: event.transcript, sessions: event.sessions, sessionsByAgent: event.sessionsByAgent, config: event.config, agents: event.agents, setup: event.setup, authenticated: event.authenticated, activeAgentId: event.activeAgentId } : previous);
    });
    window.piBot.connect().then((result) => { setData(result); setConnecting(false); }).catch((reason) => { setError(readableError(reason)); setConnecting(false); });
    return unsubscribe;
  }, []);

  async function perform(action: () => Promise<PiBootstrap | null>) {
    setBusy(true);
    setError(undefined);
    try {
      const next = await action();
      if (next) {
        setData(next);
        setBusy(next.config.streaming);
      } else {
        setBusy(false);
      }
      return next;
    } catch (reason) {
      setError(readableError(reason));
      setBusy(false);
      throw reason;
    }
  }

  async function prompt(message: string) {
    setError(undefined);
    setBusy(true);
    setData((previous) => previous ? { ...previous, transcript: [...previous.transcript, { id: `user-${Date.now()}`, kind: "user", label: "You", body: message, timestamp: timeNow() }] } : previous);
    try { await window.piBot.prompt(message); } catch (reason) { setError(readableError(reason)); setBusy(false); }
  }

  async function authenticate(action: () => Promise<PiBootstrap | null>) {
    try { const next = await perform(action); setAuthPrompt(undefined); setAuthNotice(undefined); setView("chat"); return next; } catch { return undefined; }
  }

  if (connecting || !data) return <div className="loading-screen"><LoaderCircle className="spin" /><span>Opening Pi Bot…</span></div>;
  if (data.setup.required) return <><SetupPage data={data} busy={busy} error={error} onImport={() => void authenticate(() => window.piBot.importPiAuth())} onApiKey={(providerId, apiKey) => void authenticate(() => window.piBot.setProviderApiKey(providerId, apiKey))} onOAuth={(provider) => void authenticate(() => window.piBot.loginProvider(provider.id, "oauth"))} />{authPrompt && <AuthPromptCard prompt={authPrompt} notice={authNotice} onRespond={(value) => { void window.piBot.respondAuth(authPrompt.id, value); setAuthPrompt(undefined); }} />}</>;

  const agent = findAgent(data.agents, data.activeAgentId);
  const activeId = data.activeAgentId;
  const updateWith = (action: () => Promise<PiBootstrap | null>) => void perform(action);
  function navigateToChat(action: () => Promise<PiBootstrap | null>) {
    setError(undefined);
    setView("chat");
    void perform(action).catch(() => undefined);
  }
  function deleteSession(chat: SessionSummary) {
    if (!window.confirm(`Delete “${chat.name}” permanently? This chat cannot be restored.`)) return;
    updateWith(() => window.piBot.deleteSession(chat.path));
  }
  function deleteAgent(profile: AgentProfile) {
    const deletesWorkspace = profile.workspaceKind === "app" && window.confirm(`Delete ${profile.name}, its sessions, and its app-owned workspace permanently?`);
    if (profile.workspaceKind !== "app" && !window.confirm(`Delete ${profile.name} and all of its sessions permanently? The external workspace folder will stay.`)) return;
    updateWith(() => window.piBot.deleteAgent(profile.id, deletesWorkspace));
  }

  return <div className="app-shell"><AgentSidebar data={data} busy={busy} expanded={expanded} onToggle={(id) => setExpanded((previous) => ({ ...previous, [id]: !previous[id] }))} onSelect={(id) => navigateToChat(() => window.piBot.selectAgent(id))} onNewChat={() => navigateToChat(() => window.piBot.newSession())} onSettings={() => { setError(undefined); setView("settings"); }} onOpenSession={(chat) => navigateToChat(() => window.piBot.openSession(chat.path, chat.agentId))} onDeleteSession={deleteSession} />{view === "chat" ? <ChatView data={data} busy={busy} error={error} onPrompt={prompt} onAbort={() => { void window.piBot.abort(); setBusy(false); }} onModelChange={(key) => { if (activeId) updateWith(() => window.piBot.setSessionModel(activeId, key)); }} onThinkingChange={(level) => { if (activeId) updateWith(() => window.piBot.setThinkingLevel(activeId, level)); }} /> : <SettingsPage data={data} busy={busy} onBack={() => { setError(undefined); setView("chat"); }} onUpdate={(profile) => updateWith(() => window.piBot.updateAgent(profile))} onCreate={(name, initials) => void perform(() => window.piBot.createAgent({ name, initials })).then((next) => { if (next) setView("chat"); })} onChooseFolder={(agentId) => updateWith(() => window.piBot.chooseFolder(agentId))} onTrustWorkspace={(agentId) => updateWith(() => window.piBot.trustWorkspace(agentId))} onArchive={(profile) => updateWith(() => window.piBot.archiveAgent(profile.id, !profile.archived))} onDelete={deleteAgent} onModelChange={(agentId, key) => updateWith(() => window.piBot.setAgentModel(agentId, key))} onApiKey={(provider, apiKey) => { if (apiKey) updateWith(() => window.piBot.setProviderApiKey(provider.id, apiKey)); }} onOAuth={(provider) => void authenticate(() => window.piBot.loginProvider(provider.id, "oauth"))} onLogout={(provider) => { if (window.confirm(`Disconnect ${provider.name}?`)) updateWith(() => window.piBot.logoutProvider(provider.id)); }} onImport={() => void authenticate(() => window.piBot.importPiAuth())} />}{authPrompt && <AuthPromptCard prompt={authPrompt} notice={authNotice} onRespond={(value) => { void window.piBot.respondAuth(authPrompt.id, value); setAuthPrompt(undefined); }} />}</div>;
}
