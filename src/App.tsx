import { createElement, forwardRef, isValidElement, useCallback, useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  ChevronLeft,
  ExternalLink,
  FileText,
  Files,
  Folder,
  FolderOpen,
  Globe2,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  MessageSquarePlus,
  MessagesSquare,
  MoreHorizontal,
  Moon,
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Square,
  Sun,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AnimatePresence, motion, motionSprings, motionTransitions, useReducedMotion } from "./lib/motion";
import type {
  AgentId,
  AgentProfile,
  AuthPrompt,
  PiBootstrap,
  PiConfig,
  PiEvent,
  PiModelOption,
  ProviderInfo,
  SessionSummary,
  ThinkingLevel,
  TimelineItem,
  WorkspaceFile,
} from "./types";

type View = "chat" | "settings";
type SettingsSection = "agents" | "models";
type Theme = "dark" | "light";
type WorkspaceTabKind = "files" | "browser";

type WorkspaceTab = {
  id: string;
  kind: WorkspaceTabKind;
  url?: string;
  title?: string;
};

const defaultBrowserUrl = "https://www.google.com/";

type FileTreeNode = WorkspaceFile & {
  name: string;
  children: FileTreeNode[];
};

function workspacePanelSessionKey(data: PiBootstrap) {
  return data.config.session?.path ?? data.config.session?.id ?? data.activeAgentId ?? "no-session";
}

let mermaidDiagramId = 0;

function readableError(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason.replace(/^Error:\s*/, "");
  return "Something went wrong.";
}

function shortDate(value?: string) {
  if (!value) return "New";
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function groupSessions(sessions: SessionSummary[]) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const groups = { Today: [] as SessionSummary[], Yesterday: [] as SessionSummary[], Older: [] as SessionSummary[] };
  for (const session of [...sessions].sort((a, b) => new Date(b.modified ?? b.created ?? 0).getTime() - new Date(a.modified ?? a.created ?? 0).getTime())) {
    const date = new Date(session.modified ?? session.created ?? 0);
    if (date.toDateString() === now.toDateString()) groups.Today.push(session);
    else if (date.toDateString() === yesterday.toDateString()) groups.Yesterday.push(session);
    else groups.Older.push(session);
  }
  return Object.entries(groups).filter(([, items]) => items.length > 0);
}

function agentColor(id: string) {
  const palette = ["#ff5d52", "#27b9df", "#9b5de5", "#ff7a1a", "#4e7ee8", "#e84a9b", "#12b8a6"];
  const index = [...id].reduce((total, character) => total + character.charCodeAt(0), 0) % palette.length;
  return palette[index];
}

function compactWorkspace(workspace: string) {
  if (!workspace) return "No workspace";
  const parts = workspace.split("/").filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : workspace;
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
        <div className="model-select-search" onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); setQuery(""); return; } event.stopPropagation(); }} onPointerDown={(event) => event.stopPropagation()}>
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contextPercent = config.context.percent === null ? 0 : Math.min(100, Math.max(0, config.context.percent));
  const contextLabel = config.context.percent === null ? "—" : config.context.percent > 0 && config.context.percent < 1 ? "<1%" : `${config.context.percent.toFixed(0)}%`;
  const reasoningLevels = config.availableThinkingLevels.length > 0 ? config.availableThinkingLevels : ["off"] as ThinkingLevel[];

  function submit(event: { preventDefault: () => void }) {
    event.preventDefault();
    const value = message.trim();
    if (!value || busy || disabled) return;
    setMessage("");
    if (inputRef.current) {
      inputRef.current.style.height = "40px";
      inputRef.current.style.overflowY = "hidden";
    }
    onPrompt(value);
  }

  return (
    <form className="composer" onSubmit={submit}>
      <Textarea
        ref={inputRef}
        className="composer-input"
        aria-label={`Message ${agentName}`}
        value={message}
        onChange={(event) => {
          setMessage(event.target.value);
          event.currentTarget.style.height = "40px";
          const nextHeight = Math.min(event.currentTarget.scrollHeight, 150);
          event.currentTarget.style.height = `${nextHeight}px`;
          event.currentTarget.style.overflowY = event.currentTarget.scrollHeight > 150 ? "auto" : "hidden";
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }}
        placeholder="Ask Pi Bot anything…"
        disabled={disabled}
        rows={1}
      />
      <div className="composer-toolbar">
        <div className="composer-toolbar-left">
          <span className="composer-prefix" aria-hidden="true">+</span>
          <span className="composer-divider" aria-hidden="true">•</span>
          <div className="composer-context" title={`${formatTokenCount(config.context.tokens)} of ${formatTokenCount(config.context.contextWindow)} tokens used`}>
            <span>{contextLabel} context used</span>
            <div className="context-meter" role="progressbar" aria-label="Context usage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={contextPercent}><span style={{ width: `${contextPercent}%` }} /></div>
          </div>
        </div>
        <div className="composer-actions">
          <ModelSelect value={config.modelKey} models={config.models} onChange={onModelChange} disabled={busy || config.models.length === 0} className="composer-model-select" />
          <ThinkingSelect value={config.thinkingLevel} levels={reasoningLevels} onChange={onThinkingChange} disabled={busy || !config.modelAvailable} />
          {busy ? (
            <Button className="stop-button" size="icon" type="button" onClick={onAbort} aria-label="Stop response"><Square /></Button>
          ) : (
            <Button className="send-button" size="icon" type="submit" aria-label="Send message" disabled={disabled || !message.trim()}><Send /></Button>
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
    icon: status === "running" ? <LoaderCircle className="spin" /> : status === "failed" ? <CircleAlert /> : <Check />,
  };
}

function activityTitle(item: TimelineItem) {
  const name = activityLabel(item);
  const normalized = name.toLowerCase();
  if (normalized.includes("read")) return "Read a file";
  if (normalized.includes("grep") || normalized.includes("search")) return "Searched the code";
  if (normalized.includes("bash") || normalized.includes("shell") || normalized.includes("exec")) return "Ran a command";
  if (normalized.includes("edit") || normalized.includes("patch")) return "Edited a file";
  if (normalized.includes("write") || normalized.includes("create")) return "Created a file";
  if (normalized.includes("find") || normalized.includes("glob") || normalized === "ls" || normalized.includes("list")) return "Checked workspace files";
  if (normalized.includes("web") || normalized.includes("fetch")) return "Checked an external source";
  return name;
}

function activityCommand(item: TimelineItem) {
  const name = activityLabel(item).toLowerCase();
  if (!name.includes("bash") && !name.includes("shell") && !name.includes("exec")) return undefined;
  const raw = item.input ?? (item.status === "running" ? item.body : "");
  if (!raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as { command?: unknown; cmd?: unknown };
    const command = typeof parsed.command === "string" ? parsed.command : typeof parsed.cmd === "string" ? parsed.cmd : undefined;
    return command?.trim() || undefined;
  } catch {
    return raw.trim();
  }
}

function ActivityItem({ item }: { item: TimelineItem }) {
  const [open, setOpen] = useState(false);
  const state = activityStatus(item);
  const title = activityTitle(item);
  const command = activityCommand(item);
  const output = state.status === "running" && item.body === item.input ? "Running…" : item.body || "No output returned.";
  const outcome = state.status === "running" ? "Running" : state.status === "failed" ? "Failed" : "Success";
  return (
    <motion.details layout className={`activity-item ${state.status}`} open={open} onToggle={(event) => setOpen(event.currentTarget.open)} data-motion="activity-item">
      <summary>
        <span className="activity-glyph"><Terminal /></span>
        <span className="activity-summary-copy">
          <strong className="activity-summary-closed">{command ? <>Ran <code title={command}>{command}</code></> : title}</strong>
          <strong className="activity-summary-open">{command ? "Ran command" : title}</strong>
        </span>
        <motion.span className="activity-chevron" animate={{ rotate: open ? 90 : 0 }} transition={motionTransitions.micro}><ChevronRight /></motion.span>
      </summary>
      <AnimatePresence initial={false}>
        {open && <motion.div className="activity-output-motion" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTransitions.standard}>
          <div className="activity-output-card">
            <div className="activity-output-heading">{command ? "Shell" : "Details"}</div>
            {command && <code className="activity-command-full">$ {command}</code>}
            <pre>{output}</pre>
            <div className={`activity-outcome ${state.status}`}>{state.icon}<span>{outcome}</span></div>
          </div>
        </motion.div>}
      </AnimatePresence>
    </motion.details>
  );
}

function ActivityList({ items }: { items: TimelineItem[] }) {
  return <div className="activity-list">{items.map((item) => <ActivityItem item={item} key={item.id} />)}</div>;
}

function ActivityGroup({ items }: { items: TimelineItem[] }) {
  const [open, setOpen] = useState(true);
  const doneCount = items.filter((item) => (item.status ?? "done") === "done").length;
  const runningCount = items.filter((item) => item.status === "running").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const summary = failedCount > 0
    ? `Attention needed on ${failedCount} of ${items.length} ${items.length === 1 ? "step" : "steps"}`
    : runningCount > 0
      ? `${doneCount} of ${items.length} steps completed`
      : `All ${items.length} ${items.length === 1 ? "step" : "steps"} completed`;
  return (
    <motion.details layout className="activity-group" open={open} onToggle={(event) => setOpen(event.currentTarget.open)} data-motion="activity-group">
      <summary>
        <span className="activity-group-glyph" aria-hidden="true"><i /><i /><i /></span>
        <span className="activity-group-copy">
          <strong>Agent activity</strong>
          <span>{summary}</span>
        </span>
        <span className="activity-group-toggle">{open ? "Hide details" : "Show details"}</span>
        <motion.span className="activity-group-chevron" animate={{ rotate: open ? 90 : 0 }} transition={motionTransitions.micro}><ChevronRight /></motion.span>
      </summary>
      <ActivityList items={items} />
    </motion.details>
  );
}

function MermaidDiagram({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let cancelled = false;
    setSvg(undefined);
    setError(undefined);

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const { default: mermaid } = await import("mermaid");
          mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });
          const { svg: renderedSvg } = await mermaid.render(`mermaid-diagram-${mermaidDiagramId++}`, chart);
          if (!cancelled) setSvg(renderedSvg);
        } catch (reason) {
          if (!cancelled) setError(readableError(reason));
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [chart]);

  if (error) {
    return <div className="mermaid-diagram-error"><span>Diagram tidak bisa dirender: {error}</span><pre><code>{chart}</code></pre></div>;
  }

  if (!svg) return <div className="mermaid-diagram-loading">Merender diagram…</div>;

  return <div className="mermaid-diagram" aria-label="Diagram Mermaid" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function MarkdownPre({ children, ...props }: ComponentPropsWithoutRef<"pre">) {
  const code = Array.isArray(children) ? children[0] : children;

  if (isValidElement<{ className?: string; children?: ReactNode }>(code) && code.props.className?.includes("language-mermaid")) {
    return <MermaidDiagram chart={String(code.props.children).replace(/\n$/, "")} />;
  }

  return <pre {...props}>{children}</pre>;
}

function MarkdownContent({ body }: { body: string }) {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
          pre: MarkdownPre,
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
    <motion.article className={`chat-message ${isUser ? "user" : "assistant"}`} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.standard} data-motion="chat-message">
      {isUser ? <div className="chat-avatar" aria-hidden="true">YO</div> : agent ? <AgentAvatar agent={agent} className="chat-avatar" /> : <div className="chat-avatar" aria-hidden="true">AS</div>}
      <div className="chat-message-main">
        <div className="chat-message-meta">
          <strong>{isUser ? "You" : agent?.name ?? "Assistant"}</strong>
          <time>{item.timestamp}</time>
          {item.status === "failed" && <Badge variant="destructive">Failed</Badge>}
        </div>
        <div className="chat-bubble"><div className="chat-body"><MarkdownContent body={item.body || "Thinking…"} /></div></div>
      </div>
    </motion.article>
  );
}

function AgentWorking({ agent }: { agent?: AgentProfile }) {
  const name = agent?.name ?? "Assistant";
  const reducedMotion = useReducedMotion();
  return (
    <motion.article className="chat-message assistant agent-working" layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={motionTransitions.standard} role="status" aria-label={`${name} is working`} data-motion="agent-working">
      {agent ? <AgentAvatar agent={agent} className="chat-avatar" /> : <div className="chat-avatar" aria-hidden="true">AS</div>}
      <div className="chat-message-main">
        <div className="chat-message-meta"><strong>{name}</strong><span className="agent-working-label">Working…</span></div>
        <div className="chat-bubble"><div className="agent-working-dots" aria-hidden="true">{[0, 1, 2].map((index) => <motion.span key={index} animate={reducedMotion ? { opacity: 1 } : { opacity: [0.3, 1, 0.3], y: [0, -3, 0] }} transition={reducedMotion ? motionTransitions.micro : { duration: 1, repeat: Infinity, delay: index * 0.12, ease: "easeInOut" }} />)}</div></div>
      </div>
    </motion.article>
  );
}

function EventRows({ items, agent, responding }: { items: TimelineItem[]; agent?: AgentProfile; responding: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
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
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
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
            <AnimatePresence initial={false}>
              {blocks.map((block) => block.kind === "activity"
                ? <ActivityGroup items={block.items} key={`activity-${block.items[0].id}`} />
                : <ChatMessage item={block.item} agent={agent} key={block.item.id} />)}
              {showAgentWorking && <AgentWorking agent={agent} key="agent-working" />}
            </AnimatePresence>
          </div>
        </div>
      )}
      {!following && items.length > 0 && <Button className="jump-latest" variant="outline" size="sm" onClick={jumpToLatest}><ArrowDown /> Latest</Button>}
    </div>
  );
}

function AgentAvatar({ agent, active = false, className = "" }: { agent: AgentProfile; active?: boolean; className?: string }) {
  return <span className={`agent-avatar ${active ? "active" : ""} ${className}`} style={{ backgroundColor: agentColor(agent.id) }} aria-hidden="true">{agent.initials}</span>;
}

function AgentRail({
  data,
  theme,
  onSelect,
  onCreateAgent,
  onToggleTheme,
  onSettings,
}: {
  data: PiBootstrap;
  theme: Theme;
  onSelect: (agentId: AgentId) => void;
  onCreateAgent: () => void;
  onToggleTheme: () => void;
  onSettings: () => void;
}) {
  const agents = data.agents.filter((agent) => !agent.archived);
  return (
    <motion.aside className="agent-rail" layout data-motion="agent-rail">
      <div className="rail-brand" title="Pi Bot"><img src={theme === "dark" ? "./branding/pi-bot-logo-dark.png" : "./branding/pi-bot-logo.png"} alt="" /></div>
      <div className="rail-agents" aria-label="Agents">
        {agents.map((agent) => (
          <motion.button className={`rail-agent-button ${agent.id === data.activeAgentId ? "selected" : ""}`} type="button" onClick={() => onSelect(agent.id)} title={agent.name} aria-label={agent.name} key={agent.id} whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} transition={motionSprings.press} data-motion="agent-select">
            {agent.id === data.activeAgentId && <motion.span className="rail-active-indicator" layoutId="rail-active-indicator" transition={motionSprings.layout} aria-hidden="true" />}
            <AgentAvatar agent={agent} active={agent.id === data.activeAgentId} />
          </motion.button>
        ))}
      </div>
      <div className="rail-spacer" />
      <motion.button className="rail-action create" type="button" onClick={onCreateAgent} title="Create agent" aria-label="Create agent" whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} transition={motionSprings.press} data-motion="rail-action"><Plus /></motion.button>
      <motion.button className="rail-action" type="button" onClick={onToggleTheme} title={theme === "dark" ? "Use light mode" : "Use dark mode"} aria-label={theme === "dark" ? "Use light mode" : "Use dark mode"} whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} transition={motionSprings.press} data-motion="rail-action"><AnimatePresence initial={false} mode="wait"><motion.span key={theme} initial={{ opacity: 0, rotate: -20, scale: 0.8 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={{ opacity: 0, rotate: 20, scale: 0.8 }} transition={motionTransitions.micro}>{theme === "dark" ? <Sun /> : <Moon />}</motion.span></AnimatePresence></motion.button>
      <motion.button className="rail-action" type="button" onClick={onSettings} title="App settings" aria-label="App settings" whileHover={{ y: -1 }} whileTap={{ scale: 0.96 }} transition={motionSprings.press} data-motion="rail-action"><Settings2 /></motion.button>
    </motion.aside>
  );
}

type SessionSidebarProps = {
  data: PiBootstrap;
  busy: boolean;
  onNewChat: () => void;
  onOpenSession: (session: SessionSummary) => void;
  onDeleteSession: (session: SessionSummary) => void;
  onCollapse: () => void;
};

function SessionMenu({ chat, busy, onDeleteSession }: { chat: SessionSummary; busy: boolean; onDeleteSession: (session: SessionSummary) => void }) {
  const [open, setOpen] = useState(false);
  return <details className="session-menu" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary aria-label={`Actions for ${chat.name}`}><MoreHorizontal /></summary>
    <AnimatePresence initial={false}>{open && <motion.div initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={motionTransitions.micro}><motion.button type="button" onClick={() => onDeleteSession(chat)} disabled={busy} whileTap={{ scale: 0.98 }} transition={motionSprings.press} data-motion="session-delete"><Trash2 /> Delete session</motion.button></motion.div>}</AnimatePresence>
  </details>;
}

const SessionSidebar = forwardRef<HTMLElement, SessionSidebarProps>(function SessionSidebar({
  data,
  busy,
  onNewChat,
  onOpenSession,
  onDeleteSession,
  onCollapse,
}, ref) {
  const agent = findAgent(data.agents, data.activeAgentId);
  const sessions = agent ? data.sessionsByAgent[agent.id] ?? [] : [];
  const groups = groupSessions(sessions);
  return (
    <motion.aside ref={ref} className="session-sidebar" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={motionTransitions.standard} layout data-motion="session-sidebar">
      <header className="session-sidebar-header">
        <div>
          <span className="eyebrow">Agent</span>
          <strong>{agent?.name ?? "No active agent"}</strong>
        </div>
        <motion.button type="button" onClick={onCollapse} aria-label="Hide sessions" title="Hide sessions" whileHover={{ y: -1 }} whileTap={{ scale: 0.94 }} transition={motionSprings.press} data-motion="sidebar-toggle"><PanelLeftClose /></motion.button>
      </header>
      <Button className="new-chat-button" onClick={onNewChat} disabled={!data.activeAgentId}><MessageSquarePlus /> New session <Plus /></Button>
      {agent && <p className="session-scope">History is scoped to this agent and workspace.</p>}
      <div className="session-groups">
        {groups.map(([label, items]) => (
          <section className="session-group" key={label}>
            <h2>{label}</h2>
            {items.map((chat) => (
              <div className={`session-row ${chat.path === data.config.session?.path ? "selected" : ""}`} key={chat.path}>
                <motion.button className="session-main" type="button" onClick={() => onOpenSession(chat)} whileTap={{ scale: 0.99 }} transition={motionSprings.press} data-motion="session-select">
                  <strong>{chat.name}</strong>
                  <span><time>{shortDate(chat.modified)}</time>{typeof chat.messageCount === "number" && <small>{chat.messageCount} msg{chat.messageCount === 1 ? "" : "s"}</small>}</span>
                </motion.button>
                <SessionMenu chat={chat} busy={busy} onDeleteSession={onDeleteSession} />
              </div>
            ))}
          </section>
        ))}
      </div>
      {agent && sessions.length === 0 && <div className="session-empty"><MessagesSquare /><strong>No sessions yet</strong><p>Start a session with {agent.name}.</p></div>}
      {!agent && <div className="session-empty"><Bot /><strong>No active agents</strong><p>Create an agent from the rail to begin.</p></div>}
    </motion.aside>
  );
});

function ErrorBanner({ message }: { message?: string }) {
  return <AnimatePresence initial={false}>{message && <motion.div className="error-line" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.standard} role="alert" data-motion="error-banner"><CircleAlert /><div><strong>Couldn’t complete that</strong><span>{message}</span></div></motion.div>}</AnimatePresence>;
}

function normalizeBrowserUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return defaultBrowserUrl;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.includes(".") && !trimmed.includes(" ")) return `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

function browserTabLabel(tab: Pick<WorkspaceTab, "url" | "title">) {
  if (tab.title?.trim()) return tab.title.trim();
  try {
    return new URL(tab.url || defaultBrowserUrl).hostname.replace(/^www\./, "");
  } catch {
    return "Browser";
  }
}

function browserPartitionForSession(storageKey: string) {
  let hash = 5381;
  for (const character of storageKey) hash = (hash * 33) ^ character.charCodeAt(0);
  return `persist:pi-bot-browser-${(hash >>> 0).toString(36)}`;
}

type BrowserView = HTMLElement & {
  loadURL: (url: string) => Promise<void>;
  getURL: () => string;
  getTitle: () => string;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  stop: () => void;
};

function makeFileTree(files: WorkspaceFile[]) {
  const roots: FileTreeNode[] = [];
  const nodes = new Map<string, FileTreeNode>();
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    const name = parts.at(-1);
    if (!name) continue;
    const node: FileTreeNode = { ...file, name, children: [] };
    nodes.set(file.path, node);
    const parent = nodes.get(parts.slice(0, -1).join("/"));
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function treeMatches(node: FileTreeNode, query: string): boolean {
  return !query || node.name.toLocaleLowerCase().includes(query) || node.children.some((child) => treeMatches(child, query));
}

function FilesSidebar({ workspace }: { workspace: string }) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const loadFiles = async () => {
    setLoading(true);
    setError(undefined);
    try {
      setFiles(await window.piBot.listWorkspaceFiles());
    } catch (reason) {
      setFiles([]);
      setError(readableError(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadFiles(); }, [workspace]);

  const roots = useMemo(() => makeFileTree(files), [files]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const selectFile = (file: FileTreeNode) => {
    if (file.kind === "folder") {
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(file.path)) next.delete(file.path);
        else next.add(file.path);
        return next;
      });
      return;
    }
    setError(undefined);
    void window.piBot.openWorkspaceFile(file.path).catch((reason) => setError(readableError(reason)));
  };
  const renderTree = (items: FileTreeNode[], depth = 0): ReactNode => items.filter((item) => treeMatches(item, normalizedQuery)).map((item) => {
    const isFolder = item.kind === "folder";
    const isOpen = expanded.has(item.path) || Boolean(normalizedQuery);
    return <motion.div key={item.path} layout data-motion="file-tree-item"><motion.button type="button" className="file-tree-row" style={{ "--tree-indent": `${depth * 16}px` } as CSSProperties} onClick={() => selectFile(item)} title={item.path} whileTap={{ scale: 0.99 }} transition={motionSprings.press} data-motion="file-tree-row">{isFolder ? <motion.span className="file-tree-arrow" animate={{ rotate: isOpen ? 90 : 0 }} transition={motionTransitions.micro}><ChevronRight /></motion.span> : <span className="file-tree-spacer" />}{isFolder ? <Folder /> : <FileText />}<span>{item.name}</span></motion.button><AnimatePresence initial={false}>{isFolder && isOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTransitions.standard} layout>{renderTree(item.children, depth + 1)}</motion.div>}</AnimatePresence></motion.div>;
  });

  return <div className="workspace-files"><AnimatePresence initial={false}>{error && <motion.div className="workspace-panel-error" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={motionTransitions.standard}><CircleAlert /><span>{error}</span></motion.div>}</AnimatePresence><div className="files-filter"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter files…" aria-label="Filter files" /><Button variant="ghost" size="icon-sm" onClick={() => void loadFiles()} disabled={loading} aria-label="Refresh files"><RefreshCw className={loading ? "spin" : ""} /></Button></div>{!loading && !error && files.length === 0 ? <motion.div className="workspace-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Files /><strong>No files yet</strong><p>Files created by your assistant will appear here.</p></motion.div> : <div className="files-tree-list">{renderTree(roots)}</div>}</div>;
}

function BrowserPanel({ tab, partition, onChange }: { tab: WorkspaceTab; partition: string; onChange: (next: Pick<WorkspaceTab, "url" | "title">) => void }) {
  const viewRef = useRef<BrowserView | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<BrowserView | null>(null);
  const initialUrl = tab.url || defaultBrowserUrl;
  const [address, setAddress] = useState(initialUrl);
  const [currentUrl, setCurrentUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const setBrowserView = useCallback((node: BrowserView | null) => {
    viewRef.current = node;
    setView(node);
  }, []);

  const sync = () => {
    const view = viewRef.current;
    if (!view) return;
    try {
      const url = view.getURL();
      if (url) {
        setCurrentUrl(url);
        setAddress(url);
        onChange({ url, title: view.getTitle().trim() || undefined });
      }
      setCanBack(view.canGoBack());
      setCanForward(view.canGoForward());
    } catch { /* The guest can be recreated while Electron reloads. */ }
  };

  const navigate = (value: string) => {
    const url = normalizeBrowserUrl(value);
    setAddress(url);
    setLoadError(undefined);
    void viewRef.current?.loadURL(url).catch(() => undefined);
  };

  useEffect(() => {
    if (!view) return;
    const start = () => { setLoading(true); setLoadError(undefined); };
    const stop = () => { setLoading(false); sync(); };
    const navigate = () => sync();
    const failed = (event: Event & { errorCode?: number; errorDescription?: string }) => {
      if (event.errorCode === -3) return;
      setLoading(false);
      setLoadError(event.errorDescription || "This page could not be loaded.");
    };
    view.addEventListener("did-start-loading", start);
    view.addEventListener("did-stop-loading", stop);
    view.addEventListener("did-navigate", navigate);
    view.addEventListener("did-navigate-in-page", navigate);
    view.addEventListener("did-fail-load", failed);
    return () => {
      view.removeEventListener("did-start-loading", start);
      view.removeEventListener("did-stop-loading", stop);
      view.removeEventListener("did-navigate", navigate);
      view.removeEventListener("did-navigate-in-page", navigate);
      view.removeEventListener("did-fail-load", failed);
    };
  }, [view]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!view || !frame) return;
    const resizeView = () => {
      const { width, height } = frame.getBoundingClientRect();
      view.style.width = `${Math.round(width)}px`;
      view.style.height = `${Math.round(height)}px`;
    };
    const observer = new ResizeObserver(resizeView);
    observer.observe(frame);
    resizeView();
    return () => observer.disconnect();
  }, [view]);

  const webview = createElement("webview" as never, {
    ref: setBrowserView,
    src: initialUrl,
    className: "workspace-browser-view",
    partition,
    webpreferences: "contextIsolation=yes,sandbox=yes,nodeIntegration=no",
  });

  return <div className="workspace-browser">
    <div className="browser-toolbar">
      <Button variant="ghost" size="icon-sm" disabled={!canBack} onClick={() => viewRef.current?.goBack()} aria-label="Back" title="Back"><ChevronLeft /></Button>
      <Button variant="ghost" size="icon-sm" disabled={!canForward} onClick={() => viewRef.current?.goForward()} aria-label="Forward" title="Forward"><ChevronRight /></Button>
      <Button variant="ghost" size="icon-sm" onClick={() => loading ? viewRef.current?.stop() : viewRef.current?.reload()} aria-label={loading ? "Stop loading" : "Reload"} title={loading ? "Stop loading" : "Reload"}>{loading ? <X /> : <RefreshCw />}</Button>
      <form className="browser-address" onSubmit={(event) => { event.preventDefault(); navigate(address); }}><LockKeyhole /><input value={address} onChange={(event) => setAddress(event.target.value)} aria-label="Browser address" spellCheck={false} /></form>
      <Button variant="ghost" size="icon-sm" onClick={() => void window.piBot.openExternal(currentUrl).catch(() => undefined)} aria-label="Open in default browser" title="Open in default browser"><ExternalLink /></Button>
    </div>
    <div className="workspace-browser-frame" ref={frameRef}>{webview}<AnimatePresence initial={false}>{loadError && <motion.div className="browser-load-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTransitions.standard}><CircleAlert /><strong>Couldn’t open this page</strong><p>{loadError}</p><Button variant="outline" size="sm" onClick={() => viewRef.current?.reload()}>Try again</Button></motion.div>}</AnimatePresence></div>
  </div>;
}

type RightWorkspacePanelProps = { data: PiBootstrap; open: boolean; storageKey: string };

const RightWorkspacePanel = forwardRef<HTMLElement, RightWorkspacePanelProps>(function RightWorkspacePanel({ data, open, storageKey }, ref) {
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`${storageKey}:tabs`) || "[]");
      if (Array.isArray(saved) && saved.every((tab) => typeof tab?.id === "string" && (tab.kind === "files" || tab.kind === "browser"))) return saved;
    } catch { /* A malformed local preference starts fresh. */ }
    return [{ id: "files-default", kind: "files" }];
  });
  const [activeTabId, setActiveTabId] = useState<string | null>(() => localStorage.getItem(`${storageKey}:active-tab`) || "files-default");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMenuLeft, setPickerMenuLeft] = useState(8);
  const tabsRef = useRef<HTMLElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { localStorage.setItem(`${storageKey}:tabs`, JSON.stringify(tabs)); }, [storageKey, tabs]);
  useEffect(() => { if (activeTabId) localStorage.setItem(`${storageKey}:active-tab`, activeTabId); else localStorage.removeItem(`${storageKey}:active-tab`); }, [activeTabId, storageKey]);
  useEffect(() => {
    if (!pickerOpen) return;
    const updatePickerMenuPosition = () => {
      const tabsElement = tabsRef.current;
      const pickerElement = pickerRef.current;
      if (!tabsElement || !pickerElement) return;
      setPickerMenuLeft(pickerElement.getBoundingClientRect().left - tabsElement.getBoundingClientRect().left);
    };
    updatePickerMenuPosition();
    const tabList = tabListRef.current;
    tabList?.addEventListener("scroll", updatePickerMenuPosition);
    window.addEventListener("resize", updatePickerMenuPosition);
    return () => {
      tabList?.removeEventListener("scroll", updatePickerMenuPosition);
      window.removeEventListener("resize", updatePickerMenuPosition);
    };
  }, [pickerOpen, tabs]);
  useEffect(() => {
    if (!pickerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPickerOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pickerOpen]);
  const browserPartition = browserPartitionForSession(storageKey);
  const addTab = (kind: WorkspaceTabKind) => {
    const id = `${kind}-${Date.now()}`;
    setTabs((current) => [...current, { id, kind, ...(kind === "browser" ? { url: defaultBrowserUrl } : {}) }]);
    setActiveTabId(id);
    setPickerOpen(false);
  };
  const closeTab = (id: string) => {
    const next = tabs.filter((tab) => tab.id !== id);
    setTabs(next);
    if (activeTabId === id) setActiveTabId(next.at(-1)?.id ?? null);
  };
  const updateBrowserTab = (id: string, next: Pick<WorkspaceTab, "url" | "title">) => setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, ...next } : tab));
  return (
    <motion.aside ref={ref} className="right-workspace-panel" aria-label="Workspace panel" initial={{ opacity: 0, x: "8%" }} animate={{ opacity: open ? 1 : 0, x: open ? 0 : "8%" }} exit={{ opacity: 0, x: "8%" }} transition={motionSprings.panel} style={{ pointerEvents: open ? "auto" : "none" }} data-motion="workspace-panel">
      <nav className="workspace-tabs" ref={tabsRef} aria-label="Workspace tabs">
        <div className="workspace-tab-list" ref={tabListRef}>
          {tabs.map((tab) => <div className={`workspace-tab ${activeTabId === tab.id ? "selected" : ""}`} key={tab.id}>
            <motion.button type="button" className="workspace-tab-main" onClick={() => setActiveTabId(tab.id)} title={tab.kind === "browser" ? browserTabLabel(tab) : "Files"} whileTap={{ scale: 0.98 }} transition={motionSprings.press} data-motion="workspace-tab">{tab.kind === "files" ? "Files" : browserTabLabel(tab)}</motion.button>
            <motion.button type="button" className="workspace-tab-close" onClick={() => closeTab(tab.id)} aria-label={`Close ${tab.kind} tab`} whileTap={{ scale: 0.9 }} transition={motionSprings.press} data-motion="workspace-tab-close"><X /></motion.button>
          </div>)}
          <div className="workspace-tab-picker" ref={pickerRef}><motion.button type="button" className="workspace-tab-add" onClick={() => setPickerOpen((value) => !value)} aria-label="Add workspace tab" aria-haspopup="menu" aria-expanded={pickerOpen} whileTap={{ scale: 0.9 }} transition={motionSprings.press} data-motion="workspace-tab-add"><Plus /></motion.button></div>
        </div>
        <AnimatePresence initial={false}>{pickerOpen && <motion.div className="workspace-tab-menu" role="menu" style={{ left: pickerMenuLeft }} initial={{ opacity: 0, y: -4, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={motionTransitions.micro}>
          <motion.button type="button" role="menuitem" onClick={() => addTab("files")} whileTap={{ scale: 0.98 }}><Files />Files</motion.button>
          <motion.button type="button" role="menuitem" onClick={() => addTab("browser")} whileTap={{ scale: 0.98 }}><Globe2 />Browser</motion.button>
        </motion.div>}</AnimatePresence>
      </nav>
      <section className="workspace-panel-content">{tabs.map((tab) => <div key={tab.id} hidden={tab.id !== activeTabId}>{tab.kind === "files" ? <FilesSidebar workspace={data.config.workspace} /> : <BrowserPanel tab={tab} partition={browserPartition} onChange={(next) => updateBrowserTab(tab.id, next)} />}</div>)}</section>
    </motion.aside>
  );
});

function ChatWorkspace({ data, busy, error, sessionSidebarOpen, onOpenSessionSidebar, onPrompt, onAbort, onModelChange, onThinkingChange }: ComponentPropsWithoutRef<typeof ChatView>) {
  const storageKey = `pi-bot.workspace-panel:${workspacePanelSessionKey(data)}`;
  const [panelOpen, setPanelOpen] = useState(() => localStorage.getItem(`${storageKey}:open`) !== "false");
  const [panelWidth, setPanelWidth] = useState(() => Math.min(520, Math.max(280, Number(localStorage.getItem(`${storageKey}:width`)) || 340)));
  const resize = useRef<{ x: number; width: number } | undefined>(undefined);
  useEffect(() => { localStorage.setItem(`${storageKey}:open`, String(panelOpen)); }, [panelOpen, storageKey]);
  useEffect(() => { localStorage.setItem(`${storageKey}:width`, String(panelWidth)); }, [panelWidth, storageKey]);
  const startResize = (event: ReactMouseEvent<HTMLButtonElement>) => {
    resize.current = { x: event.clientX, width: panelWidth };
    const move = (next: MouseEvent) => {
      if (!resize.current) return;
      setPanelWidth(Math.min(520, Math.max(280, resize.current.width + resize.current.x - next.clientX)));
    };
    const end = () => {
      resize.current = undefined;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
  };
  return <motion.section layout transition={motionSprings.layout} className={`chat-workspace ${panelOpen ? "panel-open" : "panel-closed"}`} style={{ "--workspace-panel-width": `${panelWidth}px` } as CSSProperties} data-motion="chat-workspace"><ChatView data={data} busy={busy} error={error} sessionSidebarOpen={sessionSidebarOpen} onOpenSessionSidebar={onOpenSessionSidebar} onPrompt={onPrompt} onAbort={onAbort} onModelChange={onModelChange} onThinkingChange={onThinkingChange} />{panelOpen && <motion.button className="workspace-resize-handle" type="button" onMouseDown={startResize} aria-label="Resize workspace panel" whileHover={{ opacity: 1 }} transition={motionTransitions.micro} data-motion="workspace-resize" />}<Button className="workspace-panel-toggle" variant="ghost" size="icon-sm" onClick={() => setPanelOpen((value) => !value)} title={panelOpen ? "Hide workspace" : "Show workspace"} aria-label={panelOpen ? "Hide workspace" : "Show workspace"}>{panelOpen ? <PanelRightClose /> : <PanelRightOpen />}</Button><AnimatePresence initial={false} mode="popLayout">{panelOpen && <RightWorkspacePanel key="workspace-panel" data={data} open={panelOpen} storageKey={storageKey} />}</AnimatePresence></motion.section>;
}

function ChatView({
  data,
  busy,
  error,
  sessionSidebarOpen,
  onOpenSessionSidebar,
  onPrompt,
  onAbort,
  onModelChange,
  onThinkingChange,
}: {
  data: PiBootstrap;
  busy: boolean;
  error?: string;
  sessionSidebarOpen: boolean;
  onOpenSessionSidebar: () => void;
  onPrompt: (message: string) => void;
  onAbort: () => void;
  onModelChange: (key: string) => void;
  onThinkingChange: (level: ThinkingLevel) => void;
}) {
  const agent = findAgent(data.agents, data.activeAgentId);
  const blocked = !agent || !data.config.modelAvailable;
  const responding = busy || data.config.streaming;
  const reducedMotion = useReducedMotion();
  return (
    <motion.main className="chat-pane" layout data-motion="chat-view">
      <header className="chat-header">
        <div className="chat-header-leading">
          {!sessionSidebarOpen && <div className="header-launchers"><motion.button type="button" onClick={onOpenSessionSidebar} title="Show sessions" aria-label="Show sessions" whileHover={{ y: -1 }} whileTap={{ scale: 0.94 }} transition={motionSprings.press} data-motion="sidebar-toggle"><MessagesSquare /></motion.button></div>}
          <div><h1>{data.config.session?.name ?? "New session"}</h1><span>{agent?.name ?? "No active agent"} · {compactWorkspace(data.config.workspace)}</span></div>
        </div>
        <AnimatePresence initial={false}>{responding && <motion.span className="responding-indicator" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTransitions.micro}><motion.i animate={reducedMotion ? { opacity: 1 } : { opacity: [0.35, 1, 0.35] }} transition={reducedMotion ? motionTransitions.micro : { duration: 1.2, repeat: Infinity, ease: "easeInOut" }} /> Responding</motion.span>}</AnimatePresence>
      </header>
      <ErrorBanner message={error} />
      {!data.authenticated && <div className="notice-line"><KeyRound /><span>Add a provider credential in App Settings to start chatting.</span></div>}
      {data.authenticated && blocked && agent && <div className="notice-line"><CircleAlert /><span>This agent’s model is unavailable. Choose another model in App Settings.</span></div>}
      <EventRows items={data.transcript} agent={agent} responding={responding} />
      <Composer busy={responding} disabled={blocked || responding} agentName={agent?.name ?? "Assistant"} config={data.config} onPrompt={onPrompt} onAbort={onAbort} onModelChange={onModelChange} onThinkingChange={onThinkingChange} />
    </motion.main>
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
  return <motion.section className="settings-detail" layout data-motion="models-settings"><div className="detail-heading"><div><span className="eyebrow">App settings</span><h2>Models & authentication</h2><p>Credentials are global. Each agent chooses its own default model.</p></div></div><div className="settings-card security-card"><LockKeyhole /><div><strong>{connected ? `${connected} provider${connected === 1 ? "" : "s"} connected` : "No provider connected"}</strong><small>Stored in the app’s protected app file.</small></div></div><AnimatePresence initial={false}>{apiProvider && <motion.div className="inline-auth-card" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.standard}><div><span className="eyebrow">Connect provider</span><strong>{apiProvider.name}</strong></div><Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste an API key" autoFocus /><div className="settings-card-actions"><Button onClick={() => { onApiKey(apiProvider, apiKey); setApiKey(""); setApiProvider(undefined); }} disabled={busy || !apiKey.trim()}><KeyRound /> Save key</Button><Button variant="ghost" onClick={() => setApiProvider(undefined)}>Cancel</Button></div></motion.div>}</AnimatePresence><div className="provider-list">{data.setup.providers.length ? data.setup.providers.map((provider) => <motion.div key={provider.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}><AuthProviderRow provider={provider} busy={busy} onApiKey={(selected) => setApiProvider(selected)} onOAuth={onOAuth} onLogout={onLogout} /></motion.div>) : <p className="muted-copy">No provider authentication methods are available.</p>}</div>{data.setup.canImportPiAuth && <motion.div className="import-card" layout><div><strong>Import from Pi</strong><p>One-time import of all credentials detected from your local Pi installation.</p></div><Button variant="outline" onClick={onImport} disabled={busy}><KeyRound /> Import Pi auth</Button></motion.div>}<p className="settings-footnote">Pi Bot works without the Pi desktop app or CLI. Existing Pi credentials are only copied when you choose the one-time import.</p></motion.section>;
}

function SettingsPage({
  data,
  busy,
  createNewAgent,
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
  createNewAgent: boolean;
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
  const [selectedId, setSelectedId] = useState<AgentId | "new">(createNewAgent ? "new" : (data.activeAgentId ?? (data.agents[0]?.id ?? "new")));
  useEffect(() => {
    if (selectedId !== "new" && !data.agents.some((agent) => agent.id === selectedId)) setSelectedId(data.agents[0]?.id ?? "new");
  }, [data.agents, selectedId]);
  const selected = selectedId === "new" ? undefined : data.agents.find((agent) => agent.id === selectedId);
  return (
    <motion.main className="settings-page" layout data-motion="settings-page">
      <header className="settings-header"><Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to chat"><ArrowLeft /></Button><div><span className="eyebrow">Pi Bot</span><h1>App Settings</h1></div></header>
      <div className="settings-layout">
        <nav className="settings-nav">
          <motion.button type="button" className={section === "agents" ? "selected" : ""} onClick={() => setSection("agents")} whileTap={{ scale: 0.98 }} transition={motionSprings.press} data-motion="settings-nav">
            {section === "agents" && <motion.span className="settings-nav-active" layoutId="settings-nav-active" transition={motionSprings.layout} aria-hidden="true" />}
            <Bot /><span>Agents</span><small>{data.agents.length}</small>
          </motion.button>
          <motion.button type="button" className={section === "models" ? "selected" : ""} onClick={() => setSection("models")} whileTap={{ scale: 0.98 }} transition={motionSprings.press} data-motion="settings-nav">
            {section === "models" && <motion.span className="settings-nav-active" layoutId="settings-nav-active" transition={motionSprings.layout} aria-hidden="true" />}
            <KeyRound /><span>Models & authentication</span>
          </motion.button>
        </nav>
        <AnimatePresence initial={false} mode="wait">
          {section === "models" ? <motion.div key="models" className="settings-panel-motion" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={motionTransitions.standard}><ModelsSettings data={data} busy={busy} onApiKey={onApiKey} onOAuth={onOAuth} onLogout={onLogout} onImport={onImport} /></motion.div> : <motion.div key="agents" className="agent-settings-layout" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={motionTransitions.standard}>
            <aside className="settings-agent-list"><div className="settings-list-heading"><span className="eyebrow">All agents</span><Button variant="outline" size="icon-sm" onClick={() => setSelectedId("new")} disabled={busy} aria-label="Create agent"><Plus /></Button></div>{data.agents.map((agent) => <motion.button type="button" className={`settings-agent-item ${selectedId === agent.id ? "selected" : ""} ${agent.archived ? "archived" : ""}`} key={agent.id} onClick={() => setSelectedId(agent.id)} whileTap={{ scale: 0.99 }} transition={motionSprings.press} data-motion="settings-agent-select">{selectedId === agent.id && <motion.span className="settings-agent-active" layoutId="settings-agent-active" transition={motionSprings.layout} aria-hidden="true" />}<AgentAvatar agent={agent} /><span><strong>{agent.name}</strong><small>{agent.archived ? "Archived" : agent.workspaceKind === "external" ? "External workspace" : "App workspace"}</small></span></motion.button>)}{data.agents.length === 0 && <p className="muted-copy">No agents yet.</p>}</aside>
            <AgentEditor agent={selected} models={data.config.models} isNew={selectedId === "new"} busy={busy} onCreate={(name, initials) => onCreate(name, initials)} onSave={onUpdate} onChooseFolder={onChooseFolder} onTrustWorkspace={onTrustWorkspace} onArchive={onArchive} onDelete={onDelete} onModelChange={onModelChange} />
          </motion.div>}
        </AnimatePresence>
      </div>
    </motion.main>
  );
}

function AuthPromptCard({ prompt, notice, onRespond, onCancel }: { prompt: { id: string; prompt: AuthPrompt }; notice?: string; onRespond: (value: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);
  return <motion.div className="auth-prompt-card" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={motionTransitions.standard} role="dialog" aria-modal="true" data-motion="auth-prompt"><span className="eyebrow">Provider sign-in</span><h3>{prompt.prompt.message}</h3>{notice && <p className="auth-notice">{notice}</p>}{prompt.prompt.type === "select" ? <select className="field-select" value={value} onChange={(event) => setValue(event.target.value)}><option value="">Choose an option</option>{prompt.prompt.options?.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select> : <Input autoFocus type={prompt.prompt.type === "secret" ? "password" : "text"} value={value} onChange={(event) => setValue(event.target.value)} placeholder={prompt.prompt.placeholder} /> }<div className="auth-prompt-actions"><Button variant="outline" onClick={onCancel}><X /> Cancel</Button><Button onClick={() => onRespond(value)} disabled={!value.trim()}><Check /> Continue</Button></div></motion.div>;
}

function SetupPage({ data, busy, error, onContinue, onImport, onApiKey, onOAuth }: { data: PiBootstrap; busy: boolean; error?: string; onContinue: (accepted: boolean) => void; onImport: (accepted: boolean) => void; onApiKey: (providerId: string, apiKey: string, accepted: boolean) => void; onOAuth: (provider: ProviderInfo, accepted: boolean) => void }) {
  const apiProviders = data.setup.providers.filter((provider) => provider.methods.includes("api_key"));
  const [providerId, setProviderId] = useState(apiProviders[0]?.id ?? "");
  const [apiKey, setApiKey] = useState("");
  const [executionRiskAccepted, setExecutionRiskAccepted] = useState(false);
  const provider = data.setup.providers.find((item) => item.id === providerId);
  return <motion.main className="setup-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={motionTransitions.standard} data-motion="setup-page"><motion.div className="setup-card" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...motionTransitions.emphasis, delay: 0.04 }}><div className="setup-mark"><img src="./branding/pi-bot-logo-dark.png" alt="" /></div><span className="eyebrow">Public Alpha</span><h1>Set up Pi Bot</h1><p className="setup-lede">Connect a provider and start chatting with a workspace teammate.</p><ErrorBanner message={error} /><label className="setup-risk"><input type="checkbox" checked={executionRiskAccepted} onChange={(event) => setExecutionRiskAccepted(event.target.checked)} /><span><strong>I understand the execution risk</strong><small>Pi Bot can run commands and read, create, edit, or delete files in the selected workspace without asking for approval for each action.</small></span></label>{apiProviders.length > 0 ? <motion.div className="setup-auth-form" layout><label className="form-field"><span>Provider</span><select className="field-select" value={providerId} onChange={(event) => setProviderId(event.target.value)}>{apiProviders.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="form-field"><span>API key</span><Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste a provider API key" /></label><Button className="setup-primary" onClick={() => onApiKey(providerId, apiKey, executionRiskAccepted)} disabled={busy || !executionRiskAccepted || !apiKey.trim() || !providerId}>{busy ? <LoaderCircle className="spin" /> : <KeyRound />} Connect provider</Button>{provider?.methods.includes("oauth") && <Button variant="outline" onClick={() => onOAuth(provider, executionRiskAccepted)} disabled={busy || !executionRiskAccepted}><ExternalLink /> Sign in with subscription</Button>}</motion.div> : <p className="muted-copy">No direct API-key provider is available. You can import credentials from Pi if they are detected.</p>}{data.setup.canContinue && <Button className="setup-continue" variant="outline" onClick={() => onContinue(executionRiskAccepted)} disabled={busy || !executionRiskAccepted}><Check /> Continue with connected provider</Button>}{data.setup.canImportPiAuth && <motion.div className="setup-import" layout><div><strong>Already use Pi?</strong><p>Import all detected Pi credentials once. The original auth stays untouched.</p></div><Button variant="outline" onClick={() => onImport(executionRiskAccepted)} disabled={busy || !executionRiskAccepted}><KeyRound /> Import auth from Pi</Button></motion.div>}<p className="setup-storage"><LockKeyhole /> Credentials are stored in the app’s protected app file.</p></motion.div></motion.main>;
}

export function App() {
  const [data, setData] = useState<PiBootstrap | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [connecting, setConnecting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [view, setView] = useState<View>("chat");
  const [sessionSidebarOpen, setSessionSidebarOpen] = useState(true);
  const [createNewAgent, setCreateNewAgent] = useState(false);
  const [authPrompt, setAuthPrompt] = useState<{ id: string; prompt: AuthPrompt }>();
  const [authNotice, setAuthNotice] = useState<string>();
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

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
        setData((previous) => previous ? { ...previous, transcript: [...previous.transcript, { id: event.id, kind: "tool", label: `Tool · ${event.name}`, body: event.detail, input: event.detail, status: "running", timestamp: timeNow() }] } : previous);
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

  useEffect(() => {
    if (data?.setup.required) window.piBot.reportRendererStage("setup-ready");
  }, [data]);

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
    try { const next = await perform(action); setAuthPrompt(undefined); setAuthNotice(undefined); setView("chat"); return next; } catch (reason) {
      if (readableError(reason) === "Authentication was cancelled.") {
        setError(undefined);
        setBusy(false);
        setAuthPrompt(undefined);
        setAuthNotice(undefined);
      }
      return undefined;
    }
  }

  function cancelProviderSignIn() {
    if (!authPrompt) return;
    const promptId = authPrompt.id;
    setAuthPrompt(undefined);
    setAuthNotice(undefined);
    setBusy(false);
    setError(undefined);
    void window.piBot.cancelAuth(promptId).catch((reason) => setError(readableError(reason)));
  }

  if (connecting || !data) return <motion.div className="loading-screen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} data-motion="loading-screen"><LoaderCircle className="spin" /><span>Opening Pi Bot…</span></motion.div>;
  if (data.setup.required) return <><SetupPage data={data} busy={busy} error={error} onContinue={(accepted) => void authenticate(() => window.piBot.completeSetup(accepted))} onImport={(accepted) => void authenticate(() => window.piBot.importPiAuth(accepted))} onApiKey={(providerId, apiKey, accepted) => void authenticate(() => window.piBot.setProviderApiKey(providerId, apiKey, accepted))} onOAuth={(provider, accepted) => void authenticate(() => window.piBot.loginProvider(provider.id, "oauth", accepted))} /><AnimatePresence initial={false}>{authPrompt && <AuthPromptCard key={authPrompt.id} prompt={authPrompt} notice={authNotice} onRespond={(value) => { void window.piBot.respondAuth(authPrompt.id, value); setAuthPrompt(undefined); }} onCancel={cancelProviderSignIn} />}</AnimatePresence></>;

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

  return <div className={`app-shell ${sessionSidebarOpen ? "session-sidebar-open" : "session-sidebar-closed"}`} data-motion="app-shell">
    <AgentRail data={data} theme={theme} onSelect={(id) => navigateToChat(() => window.piBot.selectAgent(id))} onCreateAgent={() => { setError(undefined); setCreateNewAgent(true); setView("settings"); }} onToggleTheme={() => setTheme((current) => current === "dark" ? "light" : "dark")} onSettings={() => { setError(undefined); setCreateNewAgent(false); setView("settings"); }} />
    <AnimatePresence initial={false} mode="popLayout">{sessionSidebarOpen && <SessionSidebar key="session-sidebar" data={data} busy={busy} onNewChat={() => navigateToChat(() => window.piBot.newSession())} onOpenSession={(chat) => navigateToChat(() => window.piBot.openSession(chat.path, chat.agentId))} onDeleteSession={deleteSession} onCollapse={() => setSessionSidebarOpen(false)} />}</AnimatePresence>
    <AnimatePresence initial={false} mode="wait">
      {view === "chat" ? <motion.div className="app-view" key={`chat-${workspacePanelSessionKey(data)}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.standard}><ChatWorkspace data={data} busy={busy} error={error} sessionSidebarOpen={sessionSidebarOpen} onOpenSessionSidebar={() => setSessionSidebarOpen(true)} onPrompt={prompt} onAbort={() => { void window.piBot.abort(); setBusy(false); }} onModelChange={(key) => { if (activeId) updateWith(() => window.piBot.setSessionModel(activeId, key)); }} onThinkingChange={(level) => { if (activeId) updateWith(() => window.piBot.setThinkingLevel(activeId, level)); }} /></motion.div> : <motion.div className="app-view" key="settings" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.standard}><SettingsPage data={data} busy={busy} createNewAgent={createNewAgent} onBack={() => { setError(undefined); setView("chat"); }} onUpdate={(profile) => updateWith(() => window.piBot.updateAgent(profile))} onCreate={(name, initials) => void perform(() => window.piBot.createAgent({ name, initials })).then((next) => { if (next) setView("chat"); })} onChooseFolder={(agentId) => updateWith(() => window.piBot.chooseFolder(agentId))} onTrustWorkspace={(agentId) => updateWith(() => window.piBot.trustWorkspace(agentId))} onArchive={(profile) => updateWith(() => window.piBot.archiveAgent(profile.id, !profile.archived))} onDelete={deleteAgent} onModelChange={(agentId, key) => updateWith(() => window.piBot.setAgentModel(agentId, key))} onApiKey={(provider, apiKey) => { if (apiKey) updateWith(() => window.piBot.setProviderApiKey(provider.id, apiKey)); }} onOAuth={(provider) => void authenticate(() => window.piBot.loginProvider(provider.id, "oauth"))} onLogout={(provider) => { if (window.confirm(`Disconnect ${provider.name}?`)) updateWith(() => window.piBot.logoutProvider(provider.id)); }} onImport={() => void authenticate(() => window.piBot.importPiAuth())} /></motion.div>}
    </AnimatePresence>
    <AnimatePresence initial={false}>{authPrompt && <AuthPromptCard key={authPrompt.id} prompt={authPrompt} notice={authNotice} onRespond={(value) => { void window.piBot.respondAuth(authPrompt.id, value); setAuthPrompt(undefined); }} onCancel={cancelProviderSignIn} />}</AnimatePresence>
  </div>;
}
