import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentId,
  AgentDraft,
  AgentProfile,
  PiBootstrap,
  PiConfig,
  PiEvent,
  SessionSummary,
  ThinkingLevel,
  TimelineItem,
} from "./types";

const allThinkingLevels: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
const initialAgents: AgentProfile[] = [
  { id: "planner", name: "Planner", initials: "PL", description: "Breaks work into clear next steps.", systemPrompt: "", builtIn: true, archived: false },
  { id: "researcher", name: "Researcher", initials: "RE", description: "Finds evidence and explains what it means.", systemPrompt: "", builtIn: true, archived: false },
  { id: "coder", name: "Coder", initials: "CO", description: "Explains implementation details and trade-offs.", systemPrompt: "", builtIn: true, archived: false },
];

function time() {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

function readableError(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason.replace(/^Error:\s*/, "");
  try {
    return JSON.stringify(reason);
  } catch {
    return "Something went wrong.";
  }
}

function isAbortError(reason: unknown) {
  return readableError(reason) === "Request was aborted";
}

function shortDate(value?: string) {
  if (!value) return "New";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function hydrate(
  data: PiBootstrap,
  setConfig: (config: PiConfig) => void,
  setItems: (items: TimelineItem[]) => void,
  setSessions: (sessions: SessionSummary[]) => void,
  setAgents: (agents: AgentProfile[]) => void,
) {
  setConfig(data.config);
  setItems(data.transcript);
  setSessions(data.sessions);
  setAgents(data.agents);
}

function findAgent(agents: AgentProfile[], agentId?: AgentId) {
  return agents.find((agent) => agent.id === agentId) ?? agents[0] ?? initialAgents[0];
}

function Composer({
  busy,
  disabled,
  agentName,
  onPrompt,
  onAbort,
}: {
  busy: boolean;
  disabled: boolean;
  agentName: string;
  onPrompt: (message: string) => void;
  onAbort: () => void;
}) {
  const [message, setMessage] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = message.trim();
    if (!value || busy || disabled) return;
    setMessage("");
    onPrompt(value);
  }

  return (
    <form className="composer" onSubmit={submit}>
      <span className="composer-plus" aria-hidden="true">＋</span>
      <input
        aria-label={`Message ${agentName}`}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder={`Message ${agentName} about this workspace…`}
        disabled={disabled}
      />
      {busy ? (
        <button className="stop-button" type="button" onClick={onAbort} aria-label="Stop response">
          Stop
        </button>
      ) : (
        <button className="send-button" type="submit" aria-label="Send message" disabled={disabled}>
          ↑
        </button>
      )}
    </form>
  );
}

type ConversationBlock =
  | { kind: "message"; item: TimelineItem }
  | { kind: "activity"; items: TimelineItem[] };

function activityLabel(item: TimelineItem) {
  return item.label.replace(/^Tool\s*·\s*/, "");
}

function ActivityCluster({ items }: { items: TimelineItem[] }) {
  const hasRunning = items.some((item) => item.status === "running");
  const hasFailed = items.some((item) => item.status === "failed");
  const status = hasFailed ? "failed" : hasRunning ? "running" : "done";
  const statusLabel = hasFailed ? "Failed" : hasRunning ? "Working" : "Done";
  const stepLabel = `${items.length} ${items.length === 1 ? "step" : "steps"}`;

  return (
    <details className={`activity-cluster ${status}`} open={hasRunning || undefined}>
      <summary>
        <span className="activity-glyph" aria-hidden="true">⌁</span>
        <span className="activity-title">Activity</span>
        <span className="activity-count">{stepLabel}</span>
        <span className={`activity-state ${status}`}>{statusLabel}</span>
      </summary>
      <div className="activity-list">
        {items.map((item) => (
          <div className="activity-line" key={item.id}>
            <div className="activity-line-header">
              <strong>{activityLabel(item)}</strong>
              <time>{item.timestamp}</time>
              {item.status && <span className={`activity-line-status ${item.status}`}>{item.status}</span>}
            </div>
            <pre>{item.body || (item.status === "running" ? "Working…" : "No detail returned.")}</pre>
          </div>
        ))}
      </div>
    </details>
  );
}

function ChatMessage({ item, assistantLabel, assistantInitials }: { item: TimelineItem; assistantLabel: string; assistantInitials: string }) {
  const isUser = item.kind === "user";
  const label = isUser ? "You" : assistantLabel;
  const initials = isUser ? "YO" : assistantInitials;

  return (
    <article className={`chat-message ${isUser ? "user" : "assistant"}`} aria-live={isUser ? undefined : "polite"}>
      <div className="chat-avatar" aria-hidden="true">{initials}</div>
      <div className="chat-message-main">
        <div className="chat-message-meta">
          <strong>{label}</strong>
          <time>{item.timestamp}</time>
          {item.status && <span className={`chat-status ${item.status}`}>{item.status}</span>}
        </div>
        <div className="chat-bubble">
          <div className="chat-body">{item.body || "Thinking…"}</div>
        </div>
      </div>
    </article>
  );
}

function EventRows({ items, assistantLabel, assistantInitials }: { items: TimelineItem[]; assistantLabel: string; assistantInitials: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isFollowing, setIsFollowing] = useState(true);
  const [showJump, setShowJump] = useState(false);
  const lastItem = items[items.length - 1];

  const blocks: ConversationBlock[] = [];
  for (const item of items) {
    const isActivity = item.kind === "tool" || item.kind === "status";
    const previous = blocks[blocks.length - 1];
    if (isActivity && previous?.kind === "activity") {
      previous.items.push(item);
    } else if (isActivity) {
      blocks.push({ kind: "activity", items: [item] });
    } else {
      blocks.push({ kind: "message", item });
    }
  }

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    if (isFollowing) {
      element.scrollTop = element.scrollHeight;
      setShowJump(false);
    } else if (items.length > 0) {
      setShowJump(true);
    }
  }, [isFollowing, items.length, lastItem?.body, lastItem?.status]);

  function handleScroll() {
    const element = scrollRef.current;
    if (!element) return;
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    const nextFollowing = distanceFromBottom < 80;
    setIsFollowing(nextFollowing);
    setShowJump(!nextFollowing && items.length > 0);
  }

  function jumpToLatest() {
    const element = scrollRef.current;
    if (!element) return;
    setIsFollowing(true);
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    setShowJump(false);
  }

  return (
    <div className="conversation-feed">
      {items.length === 0 ? (
        <div className="empty-conversation">
          <div className="empty-orbit" aria-hidden="true">π</div>
          <h2>Start with the workspace</h2>
          <p>Ask {assistantLabel} to map a folder, explain a file, or find a pattern. It can inspect only; your files stay unchanged.</p>
        </div>
      ) : (
        <div className="event-rows" ref={scrollRef} onScroll={handleScroll} role="log" aria-label={`${assistantLabel} conversation`}>
          <div className="conversation-blocks">
            {blocks.map((block) => block.kind === "activity" ? (
              <ActivityCluster items={block.items} key={`activity-${block.items[0].id}`} />
            ) : (
              <ChatMessage item={block.item} assistantLabel={assistantLabel} assistantInitials={assistantInitials} key={block.item.id} />
            ))}
          </div>
        </div>
      )}
      {showJump && <button className="jump-latest" type="button" onClick={jumpToLatest}>↓ New activity</button>}
    </div>
  );
}

function ContextPanel({
  agent,
  config,
  connecting,
  busy,
  onChooseFolder,
  onEditAgent,
  onModelChange,
  onThinkingChange,
}: {
  agent: AgentProfile;
  config: PiConfig | null;
  connecting: boolean;
  busy: boolean;
  onChooseFolder: () => void;
  onEditAgent: () => void;
  onModelChange: (key: string) => void;
  onThinkingChange: (level: ThinkingLevel) => void;
}) {
  const thinkingOptions = config?.availableThinkingLevels.length ? config.availableThinkingLevels : allThinkingLevels;

  return (
    <aside className="a-context">
      <div className="eyebrow">Context</div>
      <div className="context-block">
        <span>Agent</span>
        <strong>{agent.name}</strong>
        <small>{agent.description}</small>
        <button onClick={onEditAgent} disabled={connecting || busy}>Customize agent</button>
      </div>
      <div className="context-block">
        <span>Working folder</span>
        <strong title={config?.workspace}>⌑ {config?.workspace ?? "Connecting…"}</strong>
        <button onClick={onChooseFolder} disabled={connecting || busy}>Change folder</button>
      </div>
      <div className="context-block">
        <span>Conversation</span>
        <strong>{config?.session?.name ?? "New conversation"}</strong>
        <small>Local session history</small>
      </div>
      <div className="context-block">
        <label htmlFor="model-select">Model</label>
        <select
          id="model-select"
          value={config?.modelKey ?? ""}
          onChange={(event) => onModelChange(event.target.value)}
          disabled={connecting || busy || !config?.models.length}
        >
          {!config?.models.length && <option value="">No model available</option>}
          {config?.models.map((model) => (
            <option value={model.key} key={model.key}>{model.name} · {model.provider}</option>
          ))}
        </select>
      </div>
      <div className="context-block">
        <label htmlFor="thinking-select">Thinking level</label>
        <select
          id="thinking-select"
          value={config?.thinkingLevel ?? "medium"}
          onChange={(event) => onThinkingChange(event.target.value as ThinkingLevel)}
          disabled={connecting || busy || !config}
        >
          {thinkingOptions.map((level) => <option value={level} key={level}>{level}</option>)}
        </select>
      </div>
      <div className="eyebrow tools-title">Tools · read only</div>
      <ul className="tool-list">
        {(config?.tools ?? ["read", "grep", "find", "ls"]).map((tool) => (
          <li key={tool}><span>⌁</span><strong>{tool}</strong></li>
        ))}
      </ul>
      <p className="boundary-note">Local-first. Pi can read and search this folder, but it cannot write files or run shell commands.</p>
    </aside>
  );
}

function Sidebar({
  agents,
  activeAgentId,
  sessions,
  activePath,
  busy,
  connecting,
  historyOpen,
  onSelectAgent,
  onNewAgent,
  onManageAgents,
  onToggleHistory,
  onNewSession,
  onOpenSession,
}: {
  agents: AgentProfile[];
  activeAgentId?: AgentId;
  sessions: SessionSummary[];
  activePath?: string;
  busy: boolean;
  connecting: boolean;
  historyOpen: boolean;
  onSelectAgent: (agentId: AgentId) => void;
  onNewAgent: () => void;
  onManageAgents: () => void;
  onToggleHistory: () => void;
  onNewSession: () => void;
  onOpenSession: (session: SessionSummary) => void;
}) {
  const visibleAgents = agents.filter((agent) => !agent.archived);
  const archivedCount = agents.filter((agent) => agent.archived).length;

  return (
    <aside className="a-sidebar">
      <header className="brand">
        <span className="brand-mark">π</span>
        <span>Pi Bot</span>
      </header>
      <div className="sidebar-scroll">
        <div className="sidebar-heading">
          <div className="eyebrow">Agents</div>
          <div className="sidebar-agent-actions">
            <button className="sidebar-action" onClick={onManageAgents} disabled={busy || connecting}>Manage</button>
            <button className="sidebar-action add" onClick={onNewAgent} disabled={busy || connecting} aria-label="Create agent">＋</button>
          </div>
        </div>
        <div className="agent-list" aria-label="Agents">
          {visibleAgents.map((agent) => (
            <button
              className={agent.id === activeAgentId ? "agent-item active" : "agent-item"}
              key={agent.id}
              onClick={() => onSelectAgent(agent.id)}
              disabled={busy || connecting}
              aria-current={agent.id === activeAgentId ? "page" : undefined}
              title={agent.description}
            >
              <span className={`agent-avatar agent-${agent.id}`}>{agent.initials}</span>
              <span className="agent-copy">
                <strong>{agent.name}</strong>
                <small><i /> {busy && agent.id === activeAgentId ? "Working" : agent.builtIn ? "Template" : "Custom"}</small>
              </span>
            </button>
          ))}
        </div>
        {archivedCount > 0 && <button className="archived-hint" onClick={onManageAgents}>+ {archivedCount} archived agent{archivedCount === 1 ? "" : "s"}</button>}
        <button className="new-agent" onClick={onNewAgent} disabled={busy || connecting}>
          <span>＋</span> New agent
        </button>
        <button className="new-chat" onClick={onNewSession} disabled={busy || connecting}>
          <span>＋</span> New conversation
        </button>
        <div className="history-section">
          <button className="history-toggle" onClick={onToggleHistory} aria-expanded={historyOpen}>
            <span>History</span>
            <span className="history-toggle-meta"><small>{sessions.length}</small><b>{historyOpen ? "⌃" : "⌄"}</b></span>
          </button>
          {historyOpen && (
            <div className="history-list">
              {sessions.length === 0 && <p className="history-empty">No saved chats for {findAgent(agents, activeAgentId).name} yet.</p>}
              {sessions.map((session) => (
                <button
                  className={session.path === activePath ? "history-item active" : "history-item"}
                  key={session.path}
                  onClick={() => onOpenSession(session)}
                  disabled={busy || connecting}
                  title={session.name}
                >
                  <span className="history-icon">◌</span>
                  <span className="history-copy"><strong>{session.name}</strong><small>{shortDate(session.modified)}</small></span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="sidebar-footer"><span className="read-only-dot" /> Read-only teammate</div>
    </aside>
  );
}

type AgentDialogState = {
  mode: "manage" | "new" | "edit";
  agentId?: AgentId;
};

type AgentFormState = {
  name: string;
  initials: string;
  description: string;
  systemPrompt: string;
  templateId: AgentId | "";
};

const emptyAgentForm: AgentFormState = {
  name: "",
  initials: "AI",
  description: "",
  systemPrompt: "",
  templateId: "",
};

function formFromAgent(agent?: AgentProfile): AgentFormState {
  if (!agent) return emptyAgentForm;
  return {
    name: agent.name,
    initials: agent.initials,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    templateId: "",
  };
}

function AgentDialog({
  dialog,
  agents,
  busy,
  error,
  onClose,
  onNew,
  onEdit,
  onCreate,
  onUpdate,
  onDuplicate,
  onArchive,
  onDelete,
}: {
  dialog: AgentDialogState;
  agents: AgentProfile[];
  busy: boolean;
  error: string;
  onClose: () => void;
  onNew: () => void;
  onEdit: (agentId: AgentId) => void;
  onCreate: (draft: AgentDraft) => Promise<boolean>;
  onUpdate: (agent: AgentProfile) => Promise<boolean>;
  onDuplicate: (agentId: AgentId) => Promise<boolean>;
  onArchive: (agentId: AgentId, archived: boolean) => Promise<boolean>;
  onDelete: (agentId: AgentId) => Promise<boolean>;
}) {
  const editingAgent = agents.find((agent) => agent.id === dialog.agentId);
  const [form, setForm] = useState<AgentFormState>(() => formFromAgent(editingAgent));

  useEffect(() => {
    setForm(dialog.mode === "edit" ? formFromAgent(editingAgent) : emptyAgentForm);
  }, [dialog.mode, dialog.agentId, editingAgent]);

  function setField(field: keyof AgentFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applyTemplate(templateId: AgentId | "") {
    if (!templateId) {
      setForm(emptyAgentForm);
      return;
    }
    const template = agents.find((agent) => agent.id === templateId);
    if (!template) return;
    setForm({
      name: template.name,
      initials: template.initials,
      description: template.description,
      systemPrompt: template.systemPrompt,
      templateId,
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const draft = {
      name: form.name.trim(),
      initials: form.initials.trim().toUpperCase(),
      description: form.description.trim(),
      systemPrompt: form.systemPrompt.trim(),
    };
    if (!draft.name || !draft.description) return;
    if (dialog.mode === "edit" && editingAgent) {
      await onUpdate({ ...editingAgent, ...draft });
      return;
    }
    await onCreate({ ...draft, templateId: form.templateId || undefined });
  }

  if (dialog.mode === "manage") {
    return (
      <div className="modal-backdrop" role="presentation">
        <section className="agent-modal manager-modal" role="dialog" aria-modal="true" aria-labelledby="agent-manager-title">
          <header className="modal-header">
            <div>
              <div className="eyebrow">Agent workspace</div>
              <h2 id="agent-manager-title">Manage agents</h2>
              <p>Templates give you a starting point. Custom agents keep their own role and conversation history.</p>
            </div>
            <button className="modal-close" onClick={onClose} disabled={busy} aria-label="Close agent manager">×</button>
          </header>
          {error && <div className="modal-error" role="alert">{error}</div>}
          <div className="manager-list">
            {agents.map((agent) => (
              <article className={agent.archived ? "manager-agent archived" : "manager-agent"} key={agent.id}>
                <span className={`agent-avatar agent-${agent.id}`}>{agent.initials}</span>
                <div className="manager-agent-copy">
                  <div className="manager-agent-title"><strong>{agent.name}</strong><span>{agent.builtIn ? "Template" : "Custom"}{agent.archived ? " · Archived" : ""}</span></div>
                  <p>{agent.description}</p>
                </div>
                <div className="manager-agent-actions">
                  <button onClick={() => onEdit(agent.id)} disabled={busy}>Edit</button>
                  <button onClick={() => void onDuplicate(agent.id)} disabled={busy}>Duplicate</button>
                  {!agent.builtIn && <button onClick={() => void onArchive(agent.id, !agent.archived)} disabled={busy}>{agent.archived ? "Restore" : "Archive"}</button>}
                  {!agent.builtIn && <button className="danger-text" onClick={() => void onDelete(agent.id)} disabled={busy}>Delete</button>}
                </div>
              </article>
            ))}
          </div>
          <footer className="modal-footer">
            <button className="secondary-button" onClick={onClose} disabled={busy}>Done</button>
            <button className="primary-button" onClick={onNew} disabled={busy}>＋ New agent</button>
          </footer>
        </section>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="agent-modal form-modal" role="dialog" aria-modal="true" aria-labelledby="agent-form-title">
        <header className="modal-header">
          <div>
            <div className="eyebrow">{dialog.mode === "edit" ? "Customize agent" : "New agent"}</div>
            <h2 id="agent-form-title">{dialog.mode === "edit" ? `Customize ${editingAgent?.name ?? "agent"}` : "Create an agent"}</h2>
            <p>Give this teammate one clear job. You can change its instructions later.</p>
          </div>
          <button className="modal-close" onClick={onClose} disabled={busy} aria-label="Close agent form">×</button>
        </header>
        {error && <div className="modal-error" role="alert">{error}</div>}
        <form className="agent-form" onSubmit={submit}>
          {dialog.mode === "new" && (
            <label>
              Start from template
              <select value={form.templateId} onChange={(event) => applyTemplate(event.target.value)} disabled={busy}>
                <option value="">Blank agent</option>
                {agents.filter((agent) => agent.builtIn).map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}
              </select>
            </label>
          )}
          <div className="form-grid">
            <label>
              Name
              <input value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="e.g. Release Reviewer" maxLength={80} disabled={busy} required />
            </label>
            <label>
              Initials
              <input value={form.initials} onChange={(event) => setField("initials", event.target.value)} maxLength={4} disabled={busy} required />
            </label>
          </div>
          <label>
            Description
            <input value={form.description} onChange={(event) => setField("description", event.target.value)} placeholder="What outcome does this agent own?" maxLength={180} disabled={busy} required />
          </label>
          <label>
            Instructions
            <textarea value={form.systemPrompt} onChange={(event) => setField("systemPrompt", event.target.value)} placeholder="Optional: describe the role, method, and boundaries…" rows={7} maxLength={8000} disabled={busy} />
          </label>
          <div className="permission-note"><strong>Capability boundary</strong><span>All agents currently use the same local read-only tools: read, grep, find, and ls. They cannot write files or run shell commands.</span></div>
          <footer className="modal-footer">
            <button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="primary-button" type="submit" disabled={busy || !form.name.trim() || !form.description.trim()}>{busy ? "Saving…" : dialog.mode === "edit" ? "Save changes" : "Create agent"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function App() {
  const [config, setConfig] = useState<PiConfig | null>(null);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>(initialAgents);
  const [activeAgentId, setActiveAgentId] = useState<AgentId>("planner");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [error, setError] = useState("");
  const [agentDialog, setAgentDialog] = useState<AgentDialogState | null>(null);
  const activeAssistantId = useRef("");

  useEffect(() => {
    const unsubscribe = window.piBot.onEvent((event: PiEvent) => {
      if (event.type === "agent-start") setBusy(true);
      if (event.type === "agent-end" && !event.retrying) {
        setBusy(false);
        setItems((current) => current.map((item) =>
          item.id === activeAssistantId.current && item.status === "running" ? { ...item, status: "done" } : item,
        ));
      }
      if (event.type === "agent-settled") {
        setBusy(false);
        setItems((current) => current.map((item) =>
          item.id === activeAssistantId.current && item.status === "running" ? { ...item, status: "done" } : item,
        ));
      }
      if (event.type === "aborted") {
        setBusy(false);
        setError("");
      }
      if (event.type === "assistant-delta") {
        setItems((current) => current.map((item) =>
          item.id === activeAssistantId.current
            ? { ...item, body: item.body + event.delta, status: "running" }
            : item,
        ));
      }
      if (event.type === "tool-start") {
        setItems((current) => [...current, {
          id: event.id,
          kind: "tool",
          label: `Tool · ${event.name}`,
          body: event.detail,
          timestamp: time(),
          status: "running",
        }]);
      }
      if (event.type === "tool-update") {
        setItems((current) => current.map((item) => item.id === event.id ? { ...item, body: event.detail } : item));
      }
      if (event.type === "tool-end") {
        setItems((current) => current.map((item) => item.id === event.id
          ? { ...item, body: event.detail, status: event.failed ? "failed" : "done" }
          : item));
      }
      if (event.type === "error") setError(event.message);
      if (event.type === "session-sync") {
        setItems(event.transcript);
        setSessions(event.sessions);
        setConfig(event.config);
        setActiveAgentId(event.config.agentId);
        setAgents(event.agents);
      }
    });

    window.piBot.connect()
      .then((data) => {
        hydrate(data, setConfig, setItems, setSessions, setAgents);
        setActiveAgentId(data.config.agentId);
      })
      .catch((reason) => setError(readableError(reason)))
      .finally(() => setConnecting(false));

    return unsubscribe;
  }, []);

  const activePath = config?.session?.path;
  const activeAgent = findAgent(agents, activeAgentId);
  const title = config?.session?.name ?? "New conversation";
  const interactionDisabled = connecting || !config;

  const perform = useMemo(() => async (
    operation: () => Promise<PiBootstrap | null>,
    onData?: (data: PiBootstrap) => void,
  ) => {
    setConnecting(true);
    setError("");
    try {
      const data = await operation();
      if (data) {
        hydrate(data, setConfig, setItems, setSessions, setAgents);
        onData?.(data);
      }
      setBusy(false);
      return true;
    } catch (reason) {
      setError(readableError(reason));
      return false;
    } finally {
      setConnecting(false);
    }
  }, []);

  function onPrompt(message: string) {
    const assistantId = `assistant-${Date.now()}`;
    activeAssistantId.current = assistantId;
    setError("");
    setItems((current) => [...current,
      { id: `user-${Date.now()}`, kind: "user", label: "You", body: message, timestamp: time() },
      { id: assistantId, kind: "assistant", label: "Pi Bot", body: "", timestamp: time(), status: "running" },
    ]);
    setBusy(true);
    window.piBot.prompt(message).catch((reason) => {
      setBusy(false);
      if (isAbortError(reason)) {
        setError("");
        return;
      }
      setError(readableError(reason));
      setItems((current) => current.map((item) => item.id === assistantId && !item.body ? { ...item, status: "failed", body: readableError(reason) } : item));
    });
  }

  function onAbort() {
    window.piBot.abort().catch((reason) => {
      if (!isAbortError(reason)) setError(readableError(reason));
    });
  }

  function onSelectAgent(agentId: AgentId) {
    if (agentId === activeAgentId || busy || connecting) return;
    void perform(() => window.piBot.selectAgent(agentId), (data) => setActiveAgentId(data.config.agentId));
  }

  async function createAgent(draft: AgentDraft) {
    const success = await perform(() => window.piBot.createAgent(draft));
    if (success) setAgentDialog(null);
    return success;
  }

  async function updateAgent(agent: AgentProfile) {
    const success = await perform(() => window.piBot.updateAgent(agent), (data) => setActiveAgentId(data.config.agentId));
    if (success) setAgentDialog(null);
    return success;
  }

  function duplicateAgent(agentId: AgentId) {
    return perform(() => window.piBot.duplicateAgent(agentId));
  }

  function archiveAgent(agentId: AgentId, archived: boolean) {
    return perform(() => window.piBot.archiveAgent(agentId, archived), (data) => setActiveAgentId(data.config.agentId));
  }

  function deleteAgent(agentId: AgentId) {
    if (!window.confirm("Delete this agent? Its saved conversations will be kept and reassigned to Planner.")) return Promise.resolve(false);
    return perform(() => window.piBot.deleteAgent(agentId), (data) => setActiveAgentId(data.config.agentId));
  }

  return (
    <main className="variant-a">
      <Sidebar
        agents={agents}
        activeAgentId={activeAgentId}
        sessions={sessions}
        activePath={activePath}
        busy={busy}
        connecting={connecting}
        historyOpen={historyOpen}
        onSelectAgent={onSelectAgent}
        onNewAgent={() => { setError(""); setAgentDialog({ mode: "new" }); }}
        onManageAgents={() => { setError(""); setAgentDialog({ mode: "manage" }); }}
        onToggleHistory={() => setHistoryOpen((open) => !open)}
        onNewSession={() => void perform(() => window.piBot.newSession())}
        onOpenSession={(selected) => void perform(() => window.piBot.openSession(selected.path))}
      />

      <section className="a-conversation">
        <header className="section-header">
          <div>
            <div className="eyebrow">Conversation · {activeAgent.name}</div>
            <h1>Conversation</h1>
            <div className="session-name">{title}</div>
          </div>
          <span className={busy ? "live-status busy" : "live-status"}><i /> {connecting ? "Connecting" : busy ? "Working" : "Ready"}</span>
        </header>
        {error && <div className="error-line" role="alert"><strong>Pi Bot needs attention</strong><span>{error}</span></div>}
        <EventRows items={items} assistantLabel={activeAgent.name} assistantInitials={activeAgent.initials} />
        <Composer busy={busy} disabled={interactionDisabled} agentName={activeAgent.name} onPrompt={onPrompt} onAbort={onAbort} />
      </section>

      <ContextPanel
        agent={activeAgent}
        config={config}
        connecting={connecting}
        busy={busy}
        onChooseFolder={() => void perform(() => window.piBot.chooseFolder())}
        onEditAgent={() => { setError(""); setAgentDialog({ mode: "edit", agentId: activeAgent.id }); }}
        onModelChange={(key) => {
          window.piBot.setModel(key).then(setConfig).catch((reason) => setError(readableError(reason)));
        }}
        onThinkingChange={(level) => {
          window.piBot.setThinkingLevel(level).then(setConfig).catch((reason) => setError(readableError(reason)));
        }}
      />
      {agentDialog && (
        <AgentDialog
          dialog={agentDialog}
          agents={agents}
          busy={busy || connecting}
          error={error}
          onClose={() => setAgentDialog(null)}
          onNew={() => { setError(""); setAgentDialog({ mode: "new" }); }}
          onEdit={(agentId) => { setError(""); setAgentDialog({ mode: "edit", agentId }); }}
          onCreate={createAgent}
          onUpdate={updateAgent}
          onDuplicate={duplicateAgent}
          onArchive={archiveAgent}
          onDelete={deleteAgent}
        />
      )}
    </main>
  );
}
