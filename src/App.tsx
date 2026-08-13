import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Bot,
  ChevronDown,
  CircleAlert,
  FolderOpen,
  History as HistoryIcon,
  MessageCircle,
  MessageSquarePlus,
  Plus,
  Settings2,
  Square,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar as SidebarShell,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider } from "@/components/ui/tooltip";
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
      <Plus className="composer-plus" aria-hidden="true" />
      <Input
        className="composer-input"
        aria-label={`Message ${agentName}`}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder={`Message ${agentName} about this workspace…`}
        disabled={disabled}
      />
      {busy ? (
        <Button className="stop-button" variant="destructive" type="button" onClick={onAbort} aria-label="Stop response">
          <Square />
          <span>Stop</span>
        </Button>
      ) : (
        <Button className="send-button" size="icon" type="submit" aria-label="Send message" disabled={disabled}>
          <ArrowUp />
        </Button>
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
        <span className="activity-glyph" aria-hidden="true"><Activity /></span>
        <span className="activity-title">Activity</span>
        <span className="activity-count">{stepLabel}</span>
        <Badge className={`activity-state ${status}`} variant={status === "failed" ? "destructive" : status === "running" ? "secondary" : "outline"}>{statusLabel}</Badge>
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
              {item.status && <Badge className={`chat-status ${item.status}`} variant={item.status === "failed" ? "destructive" : item.status === "running" ? "secondary" : "outline"}>{item.status}</Badge>}
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
          <div className="empty-orbit" aria-hidden="true"><Bot /></div>
          <h2>Start with the workspace</h2>
          <p>Ask {assistantLabel} to map a folder, explain a file, or find a pattern. It can inspect only; your files stay unchanged.</p>
        </div>
      ) : (
        <ScrollArea
          className="conversation-scroll"
          viewportClassName="event-rows"
          viewportRef={scrollRef}
          onScroll={handleScroll}
          role="log"
          aria-label={`${assistantLabel} conversation`}
        >
          <div className="conversation-blocks">
            {blocks.map((block) => block.kind === "activity" ? (
              <ActivityCluster items={block.items} key={`activity-${block.items[0].id}`} />
            ) : (
              <ChatMessage item={block.item} assistantLabel={assistantLabel} assistantInitials={assistantInitials} key={block.item.id} />
            ))}
          </div>
        </ScrollArea>
      )}
      {showJump && <Button className="jump-latest" variant="outline" size="sm" type="button" onClick={jumpToLatest}><ArrowDown /> New activity</Button>}
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
    <SidebarShell side="right" collapsible="none" className="a-context">
      <SidebarContent className="context-content">
        <ScrollArea className="context-scroll" viewportClassName="context-scroll-viewport">
          <div className="eyebrow">Context</div>
          <div className="context-block">
            <span>Agent</span>
            <strong>{agent.name}</strong>
            <small>{agent.description}</small>
            <Button variant="link" size="sm" className="context-action" onClick={onEditAgent} disabled={connecting || busy}>Customize agent</Button>
          </div>
          <div className="context-block">
            <span>Working folder</span>
            <strong className="context-value" title={config?.workspace}><FolderOpen /> {config?.workspace ?? "Connecting…"}</strong>
            <Button variant="link" size="sm" className="context-action" onClick={onChooseFolder} disabled={connecting || busy}>Change folder</Button>
          </div>
          <div className="context-block">
            <span>Conversation</span>
            <strong>{config?.session?.name ?? "New conversation"}</strong>
            <small>Local session history</small>
          </div>
          <div className="context-block">
            <label htmlFor="model-select">Model</label>
            <Select
              value={config?.modelKey || undefined}
              onValueChange={(value) => { if (value) onModelChange(value); }}
              disabled={connecting || busy || !config?.models.length}
              items={(config?.models ?? []).map((model) => ({ label: `${model.name} · ${model.provider}`, value: model.key }))}
            >
              <SelectTrigger id="model-select"><SelectValue placeholder={config?.models.length ? "Select a model" : "No model available"} /></SelectTrigger>
              <SelectContent>
                {config?.models.map((model) => (
                  <SelectItem value={model.key} key={model.key}>{model.name} · {model.provider}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="context-block">
            <label htmlFor="thinking-select">Thinking level</label>
            <Select
              value={config?.thinkingLevel ?? "medium"}
              onValueChange={(level) => { if (level) onThinkingChange(level as ThinkingLevel); }}
              disabled={connecting || busy || !config}
              items={thinkingOptions.map((level) => ({ label: level, value: level }))}
            >
              <SelectTrigger id="thinking-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {thinkingOptions.map((level) => <SelectItem value={level} key={level}>{level}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="eyebrow tools-title">Tools</div>
          <Separator className="context-separator" />
          <ul className="tool-list">
            {(config?.tools ?? ["read", "bash", "edit", "write", "grep", "find", "ls"]).map((tool) => (
              <li key={tool}><Wrench aria-hidden="true" /><strong>{tool}</strong></li>
            ))}
          </ul>
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter className="context-footer">
        <p className="boundary-note">Local-first. Pi works inside this folder and can read, search, edit files, and run commands in it.</p>
      </SidebarFooter>
    </SidebarShell>
  );
}

function AgentSidebar({
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
    <SidebarShell side="left" collapsible="icon" className="a-sidebar">
      <SidebarHeader>
        <header className="brand">
          <span className="brand-mark"><Bot aria-hidden="true" /></span>
          <span className="sidebar-label">Pi Bot</span>
          <SidebarTrigger />
        </header>
      </SidebarHeader>
      <SidebarContent className="sidebar-content-shell">
        <ScrollArea className="sidebar-scroll-shell" viewportClassName="sidebar-scroll">
          <SidebarGroup>
            <div className="sidebar-heading">
              <SidebarGroupLabel className="eyebrow sidebar-label">Agents</SidebarGroupLabel>
              <div className="sidebar-agent-actions">
                <SidebarMenuButton
                  className="sidebar-action sidebar-label-button"
                  onClick={onManageAgents}
                  disabled={busy || connecting}
                  aria-label="Manage agents"
                  tooltip="Manage agents"
                >
                  <Settings2 />
                  <span className="sidebar-label">Manage</span>
                </SidebarMenuButton>
                <SidebarMenuButton
                  className="sidebar-action add"
                  onClick={onNewAgent}
                  disabled={busy || connecting}
                  aria-label="Create agent"
                  tooltip="Create agent"
                >
                  <Plus />
                </SidebarMenuButton>
              </div>
            </div>
            <SidebarMenu className="agent-list" aria-label="Agents">
              {visibleAgents.map((agent) => (
                <SidebarMenuItem key={agent.id}>
                  <SidebarMenuButton
                    className="agent-item"
                    isActive={agent.id === activeAgentId}
                    onClick={() => onSelectAgent(agent.id)}
                    disabled={busy || connecting}
                    aria-current={agent.id === activeAgentId ? "page" : undefined}
                    aria-label={`${agent.name} agent`}
                    tooltip={agent.description}
                  >
                    <span className={`agent-avatar agent-${agent.id}`}>{agent.initials}</span>
                    <span className="agent-copy sidebar-label">
                      <strong>{agent.name}</strong>
                      <small className={busy && agent.id === activeAgentId ? "agent-status working" : "agent-status"}>{busy && agent.id === activeAgentId ? "Working" : agent.builtIn ? "Template" : "Custom"}</small>
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
            {archivedCount > 0 && (
              <SidebarMenuButton className="archived-hint" onClick={onManageAgents} tooltip={`${archivedCount} archived agent${archivedCount === 1 ? "" : "s"}`}>
                <span className="sidebar-label">+ {archivedCount} archived agent{archivedCount === 1 ? "" : "s"}</span>
              </SidebarMenuButton>
            )}
            <SidebarMenu className="sidebar-primary-actions">
              <SidebarMenuItem>
                <SidebarMenuButton className="new-agent" onClick={onNewAgent} disabled={busy || connecting} aria-label="New agent" tooltip="New agent">
                  <Plus /><span className="sidebar-label">New agent</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton className="new-chat" onClick={onNewSession} disabled={busy || connecting} aria-label="New conversation" tooltip="New conversation">
                  <MessageSquarePlus /><span className="sidebar-label">New conversation</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <Collapsible open={historyOpen} onOpenChange={onToggleHistory} className="history-section">
              <CollapsibleTrigger asChild>
                <button className="history-toggle" type="button" aria-expanded={historyOpen} title="History">
                  <span><HistoryIcon /><span className="sidebar-label">History</span></span>
                  <span className="history-toggle-meta"><Badge variant="secondary" className="sidebar-label">{sessions.length}</Badge><ChevronDown className={historyOpen ? "history-chevron open" : "history-chevron"} /></span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="history-list">
                {sessions.length === 0 && <p className="history-empty sidebar-label">No saved chats for {findAgent(agents, activeAgentId).name} yet.</p>}
                <SidebarMenu>
                  {sessions.map((session) => (
                    <SidebarMenuItem key={session.path}>
                      <SidebarMenuButton
                        className="history-item"
                        isActive={session.path === activePath}
                        onClick={() => onOpenSession(session)}
                        disabled={busy || connecting}
                        tooltip={session.name}
                      >
                        <MessageCircle className="history-icon" />
                        <span className="history-copy sidebar-label"><strong>{session.name}</strong><small>{shortDate(session.modified)}</small></span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </CollapsibleContent>
            </Collapsible>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter className="sidebar-footer">
        <span className="sidebar-label">Coding teammate</span>
      </SidebarFooter>
    </SidebarShell>
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
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="agent-modal manager-modal" closeDisabled={busy}>
          <DialogHeader className="modal-header">
            <div>
              <div className="eyebrow">Agent workspace</div>
              <DialogTitle id="agent-manager-title">Manage agents</DialogTitle>
              <DialogDescription className="modal-description">Templates give you a starting point. Custom agents keep their own role and conversation history.</DialogDescription>
            </div>
          </DialogHeader>
          {error && <div className="modal-error" role="alert"><CircleAlert />{error}</div>}
          <div className="manager-list">
            {agents.map((agent) => (
              <article className={agent.archived ? "manager-agent archived" : "manager-agent"} key={agent.id}>
                <span className={`agent-avatar agent-${agent.id}`}>{agent.initials}</span>
                <div className="manager-agent-copy">
                  <div className="manager-agent-title"><strong>{agent.name}</strong><span>{agent.builtIn ? "Template" : "Custom"}{agent.archived ? " · Archived" : ""}</span></div>
                  <p>{agent.description}</p>
                </div>
                <div className="manager-agent-actions">
                  <Button variant="outline" size="sm" onClick={() => onEdit(agent.id)} disabled={busy}>Edit</Button>
                  <Button variant="outline" size="sm" onClick={() => void onDuplicate(agent.id)} disabled={busy}>Duplicate</Button>
                  {!agent.builtIn && <Button variant="outline" size="sm" onClick={() => void onArchive(agent.id, !agent.archived)} disabled={busy}>{agent.archived ? "Restore" : "Archive"}</Button>}
                  {!agent.builtIn && <Button variant="destructive" size="sm" onClick={() => void onDelete(agent.id)} disabled={busy}>Delete</Button>}
                </div>
              </article>
            ))}
          </div>
          <DialogFooter className="modal-footer">
            <Button variant="outline" onClick={onClose} disabled={busy}>Done</Button>
            <Button onClick={onNew} disabled={busy}><Plus /> New agent</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="agent-modal form-modal" closeDisabled={busy}>
        <DialogHeader className="modal-header">
          <div>
            <div className="eyebrow">{dialog.mode === "edit" ? "Customize agent" : "New agent"}</div>
            <DialogTitle id="agent-form-title">{dialog.mode === "edit" ? `Customize ${editingAgent?.name ?? "agent"}` : "Create an agent"}</DialogTitle>
            <DialogDescription className="modal-description">Give this teammate one clear job. You can change its instructions later.</DialogDescription>
          </div>
        </DialogHeader>
        {error && <div className="modal-error" role="alert"><CircleAlert />{error}</div>}
        <form className="agent-form" onSubmit={submit}>
          {dialog.mode === "new" && (
            <label className="form-field">
              <span>Start from template</span>
              <Select
                value={form.templateId || "blank"}
                onValueChange={(value) => applyTemplate(value === "blank" ? "" : (value ?? ""))}
                disabled={busy}
                items={[{ label: "Blank agent", value: "blank" }, ...agents.filter((agent) => agent.builtIn).map((agent) => ({ label: agent.name, value: agent.id }))]}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blank">Blank agent</SelectItem>
                  {agents.filter((agent) => agent.builtIn).map((agent) => <SelectItem value={agent.id} key={agent.id}>{agent.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          )}
          <div className="form-grid">
            <label className="form-field">
              <span>Name</span>
              <Input value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="e.g. Release Reviewer" maxLength={80} disabled={busy} required />
            </label>
            <label className="form-field">
              <span>Initials</span>
              <Input value={form.initials} onChange={(event) => setField("initials", event.target.value)} maxLength={4} disabled={busy} required />
            </label>
          </div>
          <label className="form-field">
            <span>Description</span>
            <Input value={form.description} onChange={(event) => setField("description", event.target.value)} placeholder="What outcome does this agent own?" maxLength={180} disabled={busy} required />
          </label>
          <label className="form-field">
            <span>Instructions</span>
            <Textarea value={form.systemPrompt} onChange={(event) => setField("systemPrompt", event.target.value)} placeholder="Optional: describe the role, method, and boundaries…" rows={7} maxLength={8000} disabled={busy} />
          </label>
          <div className="permission-note"><strong>Capability boundary</strong><span>All agents use the local coding tools: read, bash, edit, write, grep, find, and ls. They can change files and run shell commands in the selected workspace.</span></div>
          <DialogFooter className="modal-footer">
            <Button variant="outline" type="button" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy || !form.name.trim() || !form.description.trim()}>{busy ? "Saving…" : dialog.mode === "edit" ? "Save changes" : "Create agent"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function App() {
  const [config, setConfig] = useState<PiConfig | null>(null);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>(initialAgents);
  const [activeAgentId, setActiveAgentId] = useState<AgentId>("planner");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      return window.localStorage.getItem("pi-bot.sidebar-open") !== "false";
    } catch {
      return true;
    }
  });
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

  useEffect(() => {
    try {
      window.localStorage.setItem("pi-bot.sidebar-open", String(sidebarOpen));
    } catch {
      // Renderer-only preference; failure should not affect the workspace.
    }
  }, [sidebarOpen]);

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
    <TooltipProvider>
      <SidebarProvider asChild open={sidebarOpen} onOpenChange={setSidebarOpen} defaultOpen>
        <main className="variant-a">
          <AgentSidebar
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

          <SidebarInset className="a-conversation">
        <header className="section-header">
          <div>
            <div className="eyebrow">{activeAgent.name}</div>
            <h1>{title}</h1>
          </div>
          <span className={busy ? "live-status busy" : "live-status"}><i /> {connecting ? "Connecting" : busy ? "Working" : "Ready"}</span>
        </header>
        {error && <div className="error-line" role="alert"><CircleAlert /><div><strong>Pi Bot needs attention</strong><span>{error}</span></div></div>}
        <EventRows items={items} assistantLabel={activeAgent.name} assistantInitials={activeAgent.initials} />
        <Composer busy={busy} disabled={interactionDisabled} agentName={activeAgent.name} onPrompt={onPrompt} onAbort={onAbort} />
          </SidebarInset>

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
      </SidebarProvider>
    </TooltipProvider>
  );
}
