import { createElement, forwardRef, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  Bot,
  Check,
  Copy,
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
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  RotateCcw,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Square,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageAction, MessageActions, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools } from "@/components/ai-elements/prompt-input";
import { Reasoning, ReasoningContent } from "@/components/ai-elements/reasoning";
import { Task, TaskContent, TaskTrigger } from "@/components/ai-elements/task";
import { Terminal } from "@/components/ai-elements/terminal";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput, type ToolStatus } from "@/components/ai-elements/tool";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sidebar, SidebarContent, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AnimatePresence, motion, motionSprings, motionTimings, motionTransitions, useReducedMotion } from "./lib/motion";
import { createStreamDeltaBatcher, type StreamDeltaBatcher } from "./lib/streaming";
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
  WorkspacePanelPreferences,
  WorkspacePanelTab,
} from "./types";

type View = "chat" | "settings";
type SettingsSection = "agents" | "models";
type Theme = "dark" | "light";
type WorkspaceTabKind = WorkspacePanelTab["kind"];
type WorkspaceTab = WorkspacePanelTab;

const defaultBrowserUrl = "https://www.google.com/";

function defaultWorkspacePanelPreferences(): WorkspacePanelPreferences {
  return {
    tabs: [{ id: "files-default", kind: "files" }],
    activeTabId: "files-default",
    open: true,
    width: 340,
  };
}

function isWorkspaceTab(value: unknown): value is WorkspaceTab {
  if (!value || typeof value !== "object" || !("id" in value) || !("kind" in value)) return false;
  return typeof value.id === "string" && (value.kind === "files" || value.kind === "browser");
}

function readLegacyWorkspacePanelPreferences(storageKey: string): WorkspacePanelPreferences | null {
  const rawTabs = localStorage.getItem(`${storageKey}:tabs`);
  const tabs = rawTabs
    ? (() => {
      try {
        const parsed: unknown = JSON.parse(rawTabs);
        return Array.isArray(parsed) && parsed.every(isWorkspaceTab) ? parsed : undefined;
      } catch {
        return undefined;
      }
    })()
    : undefined;
  const fallback = defaultWorkspacePanelPreferences();
  if (!tabs && !localStorage.getItem(`${storageKey}:active-tab`) && !localStorage.getItem(`${storageKey}:open`) && !localStorage.getItem(`${storageKey}:width`)) return null;
  const safeTabs = tabs && tabs.length > 0 ? tabs : fallback.tabs;
  const rawActiveTabId = localStorage.getItem(`${storageKey}:active-tab`);
  const rawWidth = Number(localStorage.getItem(`${storageKey}:width`));
  return {
    tabs: safeTabs,
    activeTabId: rawActiveTabId && safeTabs.some((tab) => tab.id === rawActiveTabId) ? rawActiveTabId : safeTabs[0]?.id ?? null,
    open: localStorage.getItem(`${storageKey}:open`) !== "false",
    width: Number.isFinite(rawWidth) ? Math.min(520, Math.max(280, Math.round(rawWidth))) : fallback.width,
  };
}

function clearLegacyWorkspacePanelPreferences(storageKey: string) {
  localStorage.removeItem(`${storageKey}:tabs`);
  localStorage.removeItem(`${storageKey}:active-tab`);
  localStorage.removeItem(`${storageKey}:open`);
  localStorage.removeItem(`${storageKey}:width`);
}

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

function formatWorkingDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
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

function appendAssistantDelta(previous: PiBootstrap | null, delta: string) {
  if (!previous) return previous;
  const transcript = [...previous.transcript];
  const last = transcript.at(-1);
  if (last?.kind === "assistant" && last.status === "running") {
    transcript[transcript.length - 1] = { ...last, body: `${last.body}${delta}`, status: "running" };
  } else {
    const timestampMs = Date.now();
    transcript.push({ id: `assistant-${timestampMs}`, kind: "assistant", label: findAgent(previous.agents, previous.activeAgentId)?.name ?? "Assistant", body: delta, status: "running", timestamp: timeNow(), timestampMs });
  }
  return { ...previous, transcript };
}

export function startReasoning(previous: PiBootstrap | null, id: string) {
  if (!previous) return previous;
  const transcript = [...previous.transcript];
  const index = transcript.findIndex((item) => item.id === id && item.kind === "reasoning");
  if (index >= 0) {
    const item = transcript[index];
    transcript[index] = { ...item, body: item.body ? `${item.body}\n\n` : item.body, status: "running" };
  } else {
    transcript.push({ id, kind: "reasoning", label: "Reasoning", body: "", status: "running", timestamp: timeNow(), timestampMs: Date.now() });
  }
  return { ...previous, transcript };
}

export function appendReasoningDelta(previous: PiBootstrap | null, id: string, delta: string) {
  if (!previous || !delta) return previous;
  const transcript = [...previous.transcript];
  const index = transcript.findIndex((item) => item.id === id && item.kind === "reasoning");
  if (index < 0) return previous;
  const item = transcript[index];
  transcript[index] = { ...item, body: `${item.body}${delta}`, status: "running" };
  return { ...previous, transcript };
}

export function finishReasoning(previous: PiBootstrap | null, id: string) {
  if (!previous) return previous;
  const item = previous.transcript.find((entry) => entry.id === id && entry.kind === "reasoning");
  if (!item) return previous;
  if (!item.body.trim()) return { ...previous, transcript: previous.transcript.filter((entry) => entry.id !== id) };
  return { ...previous, transcript: previous.transcript.map((entry) => entry.id === id ? { ...entry, status: "done" as const } : entry) };
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

export function Composer({
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
    <PromptInput className="composer" onSubmit={submit}>
      <PromptInputTextarea
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
      <PromptInputFooter className="composer-toolbar">
        <PromptInputTools className="composer-toolbar-left">
          <span className="composer-prefix" aria-hidden="true">+</span>
          <span className="composer-divider" aria-hidden="true">•</span>
          <div className="composer-context" title={`${formatTokenCount(config.context.tokens)} of ${formatTokenCount(config.context.contextWindow)} tokens used`}>
            <span>{contextLabel} context used</span>
            <Progress className="context-meter" value={contextPercent} aria-label="Context usage" />
          </div>
        </PromptInputTools>
        <PromptInputTools className="composer-actions">
          <ModelSelect value={config.modelKey} models={config.models} onChange={onModelChange} disabled={busy || config.models.length === 0} className="composer-model-select" />
          <ThinkingSelect value={config.thinkingLevel} levels={reasoningLevels} onChange={onThinkingChange} disabled={busy || !config.modelAvailable} />
          {busy ? (
            <PromptInputSubmit className="stop-button" size="icon" status="streaming" onClick={onAbort}><Square /></PromptInputSubmit>
          ) : (
            <PromptInputSubmit className="send-button" size="icon" status="ready" disabled={disabled || !message.trim()}><Send /></PromptInputSubmit>
          )}
        </PromptInputTools>
      </PromptInputFooter>
    </PromptInput>
  );
}

function activityLabel(item: TimelineItem) {
  return item.label.replace(/^Tool\s*·\s*/, "");
}

export function timelineToolStatus(item: TimelineItem): ToolStatus {
  return item.status === "running" ? "running" : item.status === "failed" ? "failed" : "completed";
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

function activitySummary(items: TimelineItem[]) {
  const labels = new Map<string, number>();
  for (const item of items) {
    const title = activityTitle(item);
    labels.set(title, (labels.get(title) ?? 0) + 1);
  }
  const forms: Record<string, [string, string]> = {
    "Ran a command": ["Ran a command", "Ran commands"],
    "Read a file": ["Read a file", "Read files"],
    "Edited a file": ["Edited a file", "Edited files"],
    "Created a file": ["Created a file", "Created files"],
    "Checked workspace files": ["Checked workspace files", "Checked workspace files"],
    "Searched the code": ["Searched the code", "Searched the code"],
    "Checked an external source": ["Checked an external source", "Checked external sources"],
  };
  return Array.from(labels, ([title, count], index) => {
    const label = forms[title]?.[count === 1 ? 0 : 1] ?? title;
    return index === 0 ? label : `${label[0].toLowerCase()}${label.slice(1)}`;
  }).join(", ");
}

function activitySummaryIcon(items: TimelineItem[]) {
  const titles = items.map(activityTitle);
  if (titles.some((title) => title.startsWith("Edited") || title.startsWith("Created"))) return <Pencil aria-hidden="true" />;
  if (titles.some((title) => title.startsWith("Searched") || title.startsWith("Checked an external"))) return <Search aria-hidden="true" />;
  if (titles.some((title) => title.startsWith("Read") || title.startsWith("Checked workspace"))) return <FileText aria-hidden="true" />;
  return undefined;
}

function activityGroupStatus(items: TimelineItem[]): ToolStatus {
  if (items.some((item) => item.status === "failed")) return "failed";
  if (items.some((item) => item.status === "running")) return "running";
  return "completed";
}

function ActivityDetails({ item, showTitle = false }: { item: TimelineItem; showTitle?: boolean }) {
  const status = timelineToolStatus(item);
  const command = activityCommand(item);
  const output = status === "running" && item.body === item.input ? "Running…" : item.body || "No output returned.";
  return (
    <div className="activity-summary-detail">
      {showTitle && <div className="activity-summary-detail-title">{activityTitle(item)}</div>}
      {command ? (
        <Terminal className="activity-shell" command={command} output={output} status={status} isStreaming={status === "running"} autoScroll={status === "running"} />
      ) : (
        <div className="activity-output-card">
          <div className="activity-output-heading">Details</div>
          <ToolInput input={item.input} />
          <ToolOutput output={output} errorText={status === "failed" ? output : undefined} />
        </div>
      )}
    </div>
  );
}

function ActivityItem({ item }: { item: TimelineItem }) {
  const [open, setOpen] = useState(false);
  const status = timelineToolStatus(item);
  const command = activityCommand(item);
  return (
    <Tool className={`activity-item ${status}${command ? " shell" : ""}`} open={open} onOpenChange={setOpen} status={status} data-motion="activity-item">
      <ToolHeader className="activity-item-trigger" title={activitySummary([item])} status={status} icon={activitySummaryIcon([item])} />
      <ToolContent className="activity-output-content">
        <ActivityDetails item={item} />
      </ToolContent>
    </Tool>
  );
}

function ActivityItemGroup({ items }: { items: TimelineItem[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 1) return <ActivityItem item={items[0]} />;
  const status = activityGroupStatus(items);
  return (
    <Tool className={`activity-item activity-item-group ${status}`} open={open} onOpenChange={setOpen} status={status} data-motion="activity-item-group">
      <ToolHeader className="activity-item-trigger" title={activitySummary(items)} status={status} icon={activitySummaryIcon(items)} />
      <ToolContent className="activity-summary-content">
        {items.map((item) => <ActivityDetails item={item} showTitle key={item.id} />)}
      </ToolContent>
    </Tool>
  );
}

type ActivityListBlock = { kind: "narrative"; item: TimelineItem } | { kind: "tools"; items: TimelineItem[] };

function groupActivityListItems(items: TimelineItem[]) {
  const blocks: ActivityListBlock[] = [];
  for (const item of items) {
    if (item.kind === "tool" || item.kind === "status") {
      const last = blocks.at(-1);
      if (last?.kind === "tools") last.items.push(item);
      else blocks.push({ kind: "tools", items: [item] });
    } else {
      blocks.push({ kind: "narrative", item });
    }
  }
  return blocks;
}

function ActivityList({ items }: { items: TimelineItem[] }) {
  const blocks = groupActivityListItems(items);
  return (
    <div className="activity-list">
      {blocks.map((block) => block.kind === "tools"
        ? <ActivityItemGroup items={block.items} key={`tools-${block.items[0].id}`} />
        : block.item.kind === "reasoning"
          ? <ReasoningRow item={block.item} key={block.item.id} />
          : <div className="activity-progress-message" key={block.item.id}><MarkdownContent body={block.item.body} streaming={block.item.status === "running"} /></div>)}
    </div>
  );
}

export function ActivityGroup({ items, startedAt, endedAt, running = false }: { items: TimelineItem[]; startedAt?: number; endedAt?: number; running?: boolean }) {
  const runningCount = items.filter((item) => item.status === "running").length;
  const active = running || runningCount > 0;
  const [open, setOpen] = useState(active);
  const wasRunning = useRef(active);
  const fallbackStartedAt = useRef(Date.now());
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    if (active) {
      wasRunning.current = true;
      setOpen(true);
    } else if (wasRunning.current) {
      wasRunning.current = false;
      setOpen(false);
    }
  }, [active]);
  useEffect(() => {
    if (!active) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  const start = startedAt ?? items[0]?.timestampMs ?? fallbackStartedAt.current;
  const finish = active ? clock : endedAt ?? items.at(-1)?.timestampMs ?? clock;
  const label = `Working for ${formatWorkingDuration(finish - start)}`;
  return (
    <Task className="activity-group" open={open} onOpenChange={setOpen} data-motion="activity-group">
      <TaskTrigger className="activity-group-trigger" title={label} aria-label={`${label}. ${open ? "Hide" : "Show"} details`}>
        <strong>{label}</strong>
      </TaskTrigger>
      <TaskContent className="activity-group-content">
        <Separator className="activity-group-divider" />
        <ActivityList items={items} />
      </TaskContent>
    </Task>
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

export function MarkdownContent({ body, streaming, onWorkspaceFile }: { body: string; streaming: boolean; onWorkspaceFile?: (path: string) => void }) {
  return (
    <div className="markdown-content" data-motion={streaming ? "streaming-caret" : undefined}>
      <MessageResponse
        mode={streaming ? "streaming" : "static"}
        isAnimating={streaming}
        mermaidRenderer={(chart) => <MermaidDiagram chart={chart} />}
        onWorkspaceFile={onWorkspaceFile}
      >
        {body}
      </MessageResponse>
    </div>
  );
}

function ChatMessage({ item, agent }: { item: TimelineItem; agent?: AgentProfile }) {
  const isUser = item.kind === "user";
  const streaming = !isUser && item.status === "running";
  const reducedMotion = useReducedMotion();
  return (
    <motion.div layout="position" initial={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -6 }} transition={motionTransitions.standard} data-motion="chat-message">
      <Message from={isUser ? "user" : "assistant"} className={`chat-message ${isUser ? "user" : "assistant"}`}>
        <div className="chat-avatar">
          {isUser ? <Avatar className="chat-avatar-inner"><AvatarFallback>YO</AvatarFallback></Avatar> : agent ? <AgentAvatar agent={agent} /> : <Avatar className="chat-avatar-inner"><AvatarFallback>AS</AvatarFallback></Avatar>}
        </div>
        <MessageContent className="chat-message-main">
          <div className="chat-message-meta">
            <strong>{isUser ? "You" : agent?.name ?? "Assistant"}</strong>
            {item.status === "failed" && <Badge variant="destructive">Failed</Badge>}
          </div>
          <div className={`chat-bubble ${isUser ? "muted" : "ghost"}`}>
            <div className={`chat-body ${isUser ? "user" : "assistant"}`}>
              <MarkdownContent body={item.body || "Thinking…"} streaming={streaming} onWorkspaceFile={(path) => { void window.piBot.openWorkspaceFile(path); }} />
            </div>
          </div>
          <div className="chat-message-footer"><time>{item.timestamp}</time>{!isUser && item.body && <MessageActions className="message-actions"><MessageAction label="Copy response" tooltip="Copy response" onClick={() => { void navigator.clipboard?.writeText(item.body); }}><Copy /></MessageAction></MessageActions>}</div>
        </MessageContent>
      </Message>
    </motion.div>
  );
}

export function ReasoningRow({ item }: { item: TimelineItem }) {
  return (
    <Reasoning className="reasoning-row mb-0" open isStreaming={item.status === "running"}>
      <ReasoningContent className="activity-narrative-content">{item.body}</ReasoningContent>
    </Reasoning>
  );
}

export type ConversationBlock = { kind: "message"; item: TimelineItem } | { kind: "activity"; items: TimelineItem[] };

export function groupConversationItems(items: TimelineItem[]): ConversationBlock[] {
  const blocks: ConversationBlock[] = [];
  let turnItems: TimelineItem[] = [];

  function flushTurn() {
    if (turnItems.length === 0) return;
    const response = turnItems.at(-1)?.kind === "assistant" ? turnItems.at(-1) : undefined;
    const activityItems = response ? turnItems.slice(0, -1) : turnItems;
    if (activityItems.length > 0) blocks.push({ kind: "activity", items: activityItems });
    if (response) blocks.push({ kind: "message", item: response });
    turnItems = [];
  }

  for (const item of items) {
    if (item.kind === "user") {
      flushTurn();
      blocks.push({ kind: "message", item });
    } else {
      turnItems.push(item);
    }
  }
  flushTurn();
  return blocks;
}

function EventRows({ items, agent, responding }: { items: TimelineItem[]; agent?: AgentProfile; responding: boolean }) {
  const blocks = groupConversationItems(items);
  const lastActivityIndex = blocks.findLastIndex((block) => block.kind === "activity");

  return (
    <div className="conversation-feed">
      {items.length === 0 ? (
        <ConversationEmptyState className="empty-conversation" icon={<Bot className="empty-orbit" />} title={`Start a conversation with ${agent?.name ?? "Assistant"}`} description="Ask a question or describe what you want to work on." />
      ) : (
        <Conversation className="conversation-scroll" aria-label="Conversation">
          <ConversationContent className="conversation-blocks">
            <AnimatePresence initial={false}>
              {blocks.map((block, index) => {
                const messageId = block.kind === "activity" ? `activity-${block.items[0].id}` : block.item.id;
                if (block.kind === "message") return <div className="conversation-item" key={messageId}><ChatMessage item={block.item} agent={agent} /></div>;
                const previous = blocks[index - 1];
                const next = blocks[index + 1];
                const startedAt = previous?.kind === "message" && previous.item.kind === "user" ? previous.item.timestampMs : block.items[0]?.timestampMs;
                const endedAt = next?.kind === "message" && next.item.kind === "assistant" ? next.item.timestampMs : undefined;
                return <div className="conversation-item" key={messageId}><ActivityGroup items={block.items} startedAt={startedAt} endedAt={endedAt} running={responding && index === lastActivityIndex} /></div>;
              })}
            </AnimatePresence>
          </ConversationContent>
          <ConversationScrollButton className="jump-latest" size="sm"><ArrowDown /></ConversationScrollButton>
        </Conversation>
      )}
    </div>
  );
}

function AgentAvatar({ agent, active = false, className = "" }: { agent: AgentProfile; active?: boolean; className?: string }) {
  return <Avatar className={`agent-avatar ${active ? "active" : ""} ${className}`} aria-hidden="true"><AvatarFallback className="agent-avatar-fallback" style={{ backgroundColor: agentColor(agent.id) }}>{agent.initials}</AvatarFallback></Avatar>;
}

function AgentSidebarSection({
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
    <section className="agent-sidebar-section">
      <div className="agent-rail-brand" title="Pi Bot">
        <img src={theme === "dark" ? "./branding/pi-bot-logo-dark.png" : "./branding/pi-bot-logo.png"} alt="Pi Bot" />
      </div>
      <SidebarGroup className="agent-sidebar-group">
        <SidebarMenu className="agent-list" aria-label="Agents">
          {agents.map((agent) => (
            <SidebarMenuItem key={agent.id}>
              <SidebarMenuButton className={`agent-list-item ${agent.id === data.activeAgentId ? "selected" : ""}`} isActive={agent.id === data.activeAgentId} onClick={() => onSelect(agent.id)} title={agent.name} aria-label={agent.name} tooltip={agent.name} data-motion="agent-select">
                <AgentAvatar agent={agent} active={agent.id === data.activeAgentId} />
                <span><strong>{agent.name}</strong><small>{agent.workspaceKind === "external" ? "External workspace" : "App workspace"}</small></span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          {agents.length === 0 && <li className="muted-copy">No agents yet.</li>}
        </SidebarMenu>
      </SidebarGroup>
      <div className="agent-rail-actions">
        <Button className="agent-create-button" variant="outline" size="icon" onClick={onCreateAgent} title="Create agent" aria-label="Create agent"><Plus data-icon="inline-start" /></Button>
        <Button className="agent-theme-button" variant="ghost" size="icon-sm" onClick={onToggleTheme} title={theme === "dark" ? "Use light mode" : "Use dark mode"} aria-label={theme === "dark" ? "Use light mode" : "Use dark mode"}>{theme === "dark" ? <Sun data-icon="inline-start" /> : <Moon data-icon="inline-start" />}</Button>
        <Button className="agent-settings-button" variant="ghost" size="icon-sm" onClick={onSettings} title="App settings" aria-label="App settings"><Settings2 data-icon="inline-start" /></Button>
      </div>
    </section>
  );
}

type SessionSidebarProps = {
  data: PiBootstrap;
  busy: boolean;
  onNewChat: () => void;
  onOpenSession: (session: SessionSummary) => void;
  onDeleteSession: (session: SessionSummary) => void;
};

function SessionMenu({ chat, busy, onDeleteSession }: { chat: SessionSummary; busy: boolean; onDeleteSession: (session: SessionSummary) => void }) {
  return <DropdownMenu>
    <DropdownMenuTrigger className="session-menu" render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${chat.name}`} />}><MoreHorizontal /></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="session-menu-content">
      <DropdownMenuGroup>
        <DropdownMenuItem variant="destructive" disabled={busy} onClick={() => onDeleteSession(chat)} data-motion="session-delete"><Trash2 /> Delete session</DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>;
}

const SessionSidebar = forwardRef<HTMLElement, SessionSidebarProps>(function SessionSidebar({
  data,
  busy,
  onNewChat,
  onOpenSession,
  onDeleteSession,
}, ref) {
  const agent = findAgent(data.agents, data.activeAgentId);
  const sessions = agent ? data.sessionsByAgent[agent.id] ?? [] : [];
  const groups = groupSessions(sessions);
  return (
    <section ref={ref} className="session-sidebar" data-motion="session-sidebar">
      <header className="session-sidebar-header">
        <div>
          <span className="eyebrow">Sessions</span>
          <strong>{agent?.name ?? "No active agent"}</strong>
        </div>
      </header>
      <Button className="new-chat-button" onClick={onNewChat} disabled={!data.activeAgentId}><MessageSquarePlus /> New session <Plus /></Button>
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
      {agent && sessions.length === 0 && <Empty className="session-empty"><EmptyMedia variant="icon"><MessagesSquare /></EmptyMedia><EmptyTitle>No sessions yet</EmptyTitle><EmptyDescription>Start a session with {agent.name}.</EmptyDescription></Empty>}
      {!agent && <Empty className="session-empty"><EmptyMedia variant="icon"><Bot /></EmptyMedia><EmptyTitle>No active agents</EmptyTitle><EmptyDescription>Create an agent from the Agents section to begin.</EmptyDescription></Empty>}
    </section>
  );
});

function AppSidebar({
  data,
  theme,
  busy,
  onSelectAgent,
  onCreateAgent,
  onToggleTheme,
  onSettings,
  onNewChat,
  onOpenSession,
  onDeleteSession,
}: {
  data: PiBootstrap;
  theme: Theme;
  busy: boolean;
  onSelectAgent: (agentId: AgentId) => void;
  onCreateAgent: () => void;
  onToggleTheme: () => void;
  onSettings: () => void;
  onNewChat: () => void;
  onOpenSession: (session: SessionSummary) => void;
  onDeleteSession: (session: SessionSummary) => void;
}) {
  return (
    <Sidebar className="app-sidebar" collapsible="offcanvas" data-motion="app-sidebar">
      <SidebarHeader className="combined-sidebar-topbar section-topbar" aria-label="Sidebar toolbar">
        <SidebarTrigger className="sidebar-window-toggle" title="Hide sidebar" aria-label="Hide sidebar" data-motion="sidebar-toggle"><PanelLeftClose data-icon="inline-start" /></SidebarTrigger>
      </SidebarHeader>
      <SidebarContent className="app-sidebar-main">
        <div className="app-sidebar-columns">
          <AgentSidebarSection data={data} theme={theme} onSelect={onSelectAgent} onCreateAgent={onCreateAgent} onToggleTheme={onToggleTheme} onSettings={onSettings} />
          <SessionSidebar data={data} busy={busy} onNewChat={onNewChat} onOpenSession={onOpenSession} onDeleteSession={onDeleteSession} />
        </div>
      </SidebarContent>
    </Sidebar>
  );
}

function ErrorBanner({ message }: { message?: string }) {
  return <AnimatePresence initial={false}>{message && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.standard} data-motion="error-banner"><Alert className="error-line" variant="destructive"><CircleAlert /><div><AlertTitle>Couldn’t complete that</AlertTitle><AlertDescription>{message}</AlertDescription></div></Alert></motion.div>}</AnimatePresence>;
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

  return <div className="workspace-files"><AnimatePresence initial={false}>{error && <motion.div className="workspace-panel-error" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={motionTransitions.standard}><CircleAlert /><span>{error}</span></motion.div>}</AnimatePresence><div className="files-filter"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter files…" aria-label="Filter files" /><Button variant="ghost" size="icon-sm" onClick={() => void loadFiles()} disabled={loading} aria-label="Refresh files"><RefreshCw className={loading ? "spin" : ""} /></Button></div>{!loading && !error && files.length === 0 ? <Empty className="workspace-empty"><EmptyMedia variant="icon"><Files /></EmptyMedia><EmptyTitle>No files yet</EmptyTitle><EmptyDescription>Files created by your assistant will appear here.</EmptyDescription></Empty> : <div className="files-tree-list">{renderTree(roots)}</div>}</div>;
}

export function BrowserPanel({ tab, partition, onChange }: { tab: WorkspaceTab; partition: string; onChange: (next: Pick<WorkspaceTab, "url" | "title">) => void }) {
  const viewRef = useRef<BrowserView | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<BrowserView | null>(null);
  const initialUrl = useRef(tab.url || defaultBrowserUrl).current;
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

type RightWorkspacePanelProps = { data: PiBootstrap; open: boolean; storageKey: string; preferences: WorkspacePanelPreferences; onChange: (preferences: WorkspacePanelPreferences) => void; onClose: () => void };

const RightWorkspacePanel = forwardRef<HTMLElement, RightWorkspacePanelProps>(function RightWorkspacePanel({ data, open, storageKey, preferences, onChange, onClose }, ref) {
  const tabs = preferences.tabs;
  const activeTabId = preferences.activeTabId;
  const browserPartition = browserPartitionForSession(storageKey);
  const addTab = (kind: WorkspaceTabKind) => {
    const id = `${kind}-${Date.now()}`;
    onChange({ ...preferences, tabs: [...tabs, { id, kind, ...(kind === "browser" ? { url: defaultBrowserUrl } : {}) }], activeTabId: id });
  };
  const closeTab = (id: string) => {
    const next = tabs.filter((tab) => tab.id !== id);
    onChange({ ...preferences, tabs: next, activeTabId: activeTabId === id ? next.at(-1)?.id ?? null : activeTabId });
  };
  const updateBrowserTab = (id: string, next: Pick<WorkspaceTab, "url" | "title">) => onChange({ ...preferences, tabs: tabs.map((tab) => tab.id === id ? { ...tab, ...next } : tab) });
  return (
    <motion.aside ref={ref} className="right-workspace-panel" aria-label="Workspace panel" initial={{ opacity: 0, x: "8%" }} animate={{ opacity: open ? 1 : 0, x: open ? 0 : "8%" }} exit={{ opacity: 0, x: "8%" }} transition={motionSprings.panel} style={{ pointerEvents: open ? "auto" : "none" }} data-motion="workspace-panel">
      <Tabs value={activeTabId} onValueChange={(value) => onChange({ ...preferences, activeTabId: value === null ? null : String(value) })} className="workspace-tabs">
        <header className="workspace-panel-topbar section-topbar" aria-label="Workspace toolbar">
          <TabsList className="workspace-tab-list" aria-label="Workspace tabs">
            {tabs.map((tab) => <div className={`workspace-tab ${activeTabId === tab.id ? "selected" : ""}`} key={tab.id}>
              <TabsTrigger className="workspace-tab-main" value={tab.id} title={tab.kind === "browser" ? browserTabLabel(tab) : "Files"} data-motion="workspace-tab">{tab.kind === "files" ? "Files" : browserTabLabel(tab)}</TabsTrigger>
              <Button variant="ghost" size="icon-sm" className="workspace-tab-close" onClick={() => closeTab(tab.id)} aria-label={`Close ${tab.kind} tab`} data-motion="workspace-tab-close"><X /></Button>
            </div>)}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="workspace-tab-add" aria-label="Add workspace tab" />}><Plus /></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="workspace-tab-menu">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => addTab("files")}><Files /> Files</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => addTab("browser")}><Globe2 /> Browser</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </TabsList>
          <Button className="workspace-panel-close" variant="ghost" size="icon-sm" onClick={onClose} title="Hide workspace" aria-label="Hide workspace"><PanelRightClose /></Button>
        </header>
        <section className="workspace-panel-content">{tabs.map((tab) => <TabsContent key={tab.id} value={tab.id} keepMounted>{tab.kind === "files" ? <FilesSidebar workspace={data.config.workspace} /> : <BrowserPanel tab={tab} partition={browserPartition} onChange={(next) => updateBrowserTab(tab.id, next)} />}</TabsContent>)}</section>
      </Tabs>
    </motion.aside>
  );
});

type ChatViewProps = {
  data: PiBootstrap;
  busy: boolean;
  sidebarOpen: boolean;
  error?: string;
  onPrompt: (message: string) => void;
  onAbort: () => void;
  onModelChange: (key: string) => void;
  onThinkingChange: (level: ThinkingLevel) => void;
  workspaceOpen?: boolean;
  onShowWorkspace?: () => void;
};

function ChatWorkspace({ data, busy, sidebarOpen, error, onPrompt, onAbort, onModelChange, onThinkingChange }: Omit<ChatViewProps, "workspaceOpen" | "onShowWorkspace">) {
  const storageKey = `pi-bot.workspace-panel:${workspacePanelSessionKey(data)}`;
  const [preferences, setPreferences] = useState<WorkspacePanelPreferences>(defaultWorkspacePanelPreferences);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const loadedStorageKey = useRef<string | undefined>(undefined);
  const resize = useRef<{ x: number; width: number } | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    loadedStorageKey.current = undefined;
    setPreferences(defaultWorkspacePanelPreferences());
    setPreferencesLoaded(false);
    const legacy = readLegacyWorkspacePanelPreferences(storageKey);
    window.piBot.getWorkspacePreferences(storageKey)
      .then((saved) => {
        if (saved) return saved;
        if (!legacy) return defaultWorkspacePanelPreferences();
        return window.piBot.saveWorkspacePreferences(storageKey, legacy).then(() => {
          clearLegacyWorkspacePanelPreferences(storageKey);
          return legacy;
        });
      })
      .catch(() => legacy ?? defaultWorkspacePanelPreferences())
      .then((next) => {
        if (cancelled) return;
        loadedStorageKey.current = storageKey;
        setPreferences(next);
        setPreferencesLoaded(true);
      });
    return () => { cancelled = true; };
  }, [storageKey]);
  useEffect(() => {
    if (!preferencesLoaded || loadedStorageKey.current !== storageKey) return;
    void window.piBot.saveWorkspacePreferences(storageKey, preferences).catch(() => undefined);
  }, [preferences, preferencesLoaded, storageKey]);
  const startResize = (event: ReactMouseEvent<HTMLButtonElement>) => {
    resize.current = { x: event.clientX, width: preferences.width };
    const move = (next: MouseEvent) => {
      if (!resize.current) return;
      setPreferences((current) => ({ ...current, width: Math.min(520, Math.max(280, resize.current ? resize.current.width + resize.current.x - next.clientX : current.width)) }));
    };
    const end = () => {
      resize.current = undefined;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", end);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", end);
  };
  return <motion.section layout="position" transition={motionSprings.layout} className={`chat-workspace ${preferences.open ? "panel-open" : "panel-closed"}`} style={{ "--workspace-panel-width": `${preferences.width}px` } as CSSProperties} data-motion="chat-workspace"><ChatView data={data} busy={busy} sidebarOpen={sidebarOpen} error={error} onPrompt={onPrompt} onAbort={onAbort} onModelChange={onModelChange} onThinkingChange={onThinkingChange} workspaceOpen={preferences.open} onShowWorkspace={() => setPreferences((current) => ({ ...current, open: true }))} />{preferences.open && <motion.button className="workspace-resize-handle" type="button" onMouseDown={startResize} aria-label="Resize workspace panel" whileHover={{ opacity: 1 }} transition={motionTransitions.micro} data-motion="workspace-resize" />}<AnimatePresence initial={false} mode="popLayout">{preferences.open && <RightWorkspacePanel key="workspace-panel" data={data} open={preferences.open} storageKey={storageKey} preferences={preferences} onChange={setPreferences} onClose={() => setPreferences((current) => ({ ...current, open: false }))} />}</AnimatePresence></motion.section>;
}

function ChatView({
  data,
  busy,
  sidebarOpen,
  error,
  onPrompt,
  onAbort,
  onModelChange,
  onThinkingChange,
  workspaceOpen = true,
  onShowWorkspace,
}: ChatViewProps) {
  const agent = findAgent(data.agents, data.activeAgentId);
  const blocked = !agent || !data.config.modelAvailable;
  const responding = busy || data.config.streaming;
  const reducedMotion = useReducedMotion();
  return (
    <motion.main className="chat-pane" layout="position" data-motion="chat-view">
      <header className="section-topbar chat-section-topbar" aria-label="Conversation toolbar">
        {!sidebarOpen && <SidebarTrigger className="sidebar-window-toggle" title="Show sidebar" aria-label="Show sidebar" data-motion="sidebar-toggle"><PanelLeftOpen data-icon="inline-start" /></SidebarTrigger>}
        <AnimatePresence initial={false}>{responding && <motion.span className="responding-indicator" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTransitions.micro}><motion.i animate={reducedMotion ? { opacity: 1 } : { opacity: [0.35, 1, 0.35] }} transition={reducedMotion ? motionTransitions.micro : { duration: 1.2, repeat: Infinity, ease: "easeInOut" }} /> Responding</motion.span>}</AnimatePresence>
        {!workspaceOpen && onShowWorkspace && <Button className="workspace-panel-show" variant="ghost" size="icon-sm" onClick={onShowWorkspace} title="Show workspace" aria-label="Show workspace"><PanelRightOpen /></Button>}
      </header>
      <header className="chat-header">
        <div className="chat-header-leading">
          <div><h1>{data.config.session?.name ?? "New session"}</h1><span>{agent?.name ?? "No active agent"} · {compactWorkspace(data.config.workspace)}</span></div>
        </div>
      </header>
      <ErrorBanner message={error} />
      {!data.authenticated && <Alert className="notice-line"><KeyRound /><AlertDescription>Add a provider credential in App Settings to start chatting.</AlertDescription></Alert>}
      {data.authenticated && blocked && agent && <Alert className="notice-line"><CircleAlert /><AlertDescription>This agent’s model is unavailable. Choose another model in App Settings.</AlertDescription></Alert>}
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

  if (!agent) return <Empty className="settings-detail empty-settings"><EmptyMedia variant="icon"><Bot /></EmptyMedia><EmptyTitle>No active agents</EmptyTitle><EmptyDescription>Create an agent to begin.</EmptyDescription></Empty>;
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
  sidebarOpen,
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
  sidebarOpen: boolean;
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
      <header className="section-topbar settings-section-topbar" aria-label="Settings toolbar">
        {!sidebarOpen && <SidebarTrigger className="sidebar-window-toggle" title="Show sidebar" aria-label="Show sidebar" data-motion="sidebar-toggle"><PanelLeftOpen data-icon="inline-start" /></SidebarTrigger>}
      </header>
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
  useEffect(() => setValue(""), [prompt.id]);
  return <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
    <DialogContent className="auth-prompt-card" showCloseButton={false} data-motion="auth-prompt">
      <DialogHeader>
        <span className="eyebrow">Provider sign-in</span>
        <DialogTitle>{prompt.prompt.message}</DialogTitle>
        <DialogDescription className={notice ? "auth-notice" : "sr-only"}>{notice || "Complete the provider authentication prompt."}</DialogDescription>
      </DialogHeader>
      {prompt.prompt.type === "select" ? <select className="field-select" value={value} onChange={(event) => setValue(event.target.value)}><option value="">Choose an option</option>{prompt.prompt.options?.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}</select> : <Input autoFocus type={prompt.prompt.type === "secret" ? "password" : "text"} value={value} onChange={(event) => setValue(event.target.value)} placeholder={prompt.prompt.placeholder} />}
      <DialogFooter className="auth-prompt-actions"><Button variant="outline" onClick={onCancel}><X /> Cancel</Button><Button onClick={() => onRespond(value)} disabled={!value.trim()}><Check /> Continue</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [createNewAgent, setCreateNewAgent] = useState(false);
  const [authPrompt, setAuthPrompt] = useState<{ id: string; prompt: AuthPrompt }>();
  const [authNotice, setAuthNotice] = useState<string>();
  const streamBatcherRef = useRef<StreamDeltaBatcher | null>(null);
  if (!streamBatcherRef.current) {
    streamBatcherRef.current = createStreamDeltaBatcher((delta) => {
      setData((previous) => appendAssistantDelta(previous, delta));
    }, motionTimings.streamBatchMs);
  }
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const unsubscribe = window.piBot.onEvent((event: PiEvent) => {
      if (event.type === "assistant-delta") {
        streamBatcherRef.current?.push(event.delta);
      } else {
        streamBatcherRef.current?.flush();
        if (event.type === "reasoning-start") {
          setData((previous) => startReasoning(previous, event.id));
        } else if (event.type === "reasoning-delta") {
          setData((previous) => appendReasoningDelta(previous, event.id, event.delta));
        } else if (event.type === "reasoning-end") {
          setData((previous) => finishReasoning(previous, event.id));
        } else if (event.type === "tool-start") {
          setData((previous) => previous ? { ...previous, transcript: [...previous.transcript, { id: event.id, kind: "tool", label: `Tool · ${event.name}`, body: event.detail, input: event.detail, status: "running", timestamp: timeNow(), timestampMs: Date.now() }] } : previous);
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
      }
    });
    window.piBot.connect().then((result) => { setData(result); setConnecting(false); }).catch((reason) => { setError(readableError(reason)); setConnecting(false); });
    return () => {
      streamBatcherRef.current?.cancel();
      unsubscribe();
    };
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
    const timestampMs = Date.now();
    setData((previous) => previous ? { ...previous, transcript: [...previous.transcript, { id: `user-${timestampMs}`, kind: "user", label: "You", body: message, timestamp: timeNow(), timestampMs }] } : previous);
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

      return <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen} className="app-sidebar-provider">
        <div className={`app-shell ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`} data-motion="app-shell">
          <AppSidebar data={data} theme={theme} busy={busy} onSelectAgent={(id) => navigateToChat(() => window.piBot.selectAgent(id))} onCreateAgent={() => { setError(undefined); setCreateNewAgent(true); setView("settings"); }} onToggleTheme={() => setTheme((current) => current === "dark" ? "light" : "dark")} onSettings={() => { setError(undefined); setCreateNewAgent(false); setView("settings"); }} onNewChat={() => navigateToChat(() => window.piBot.newSession())} onOpenSession={(chat) => navigateToChat(() => window.piBot.openSession(chat.path, chat.agentId))} onDeleteSession={deleteSession} />
          <AnimatePresence initial={false} mode="wait">
            {view === "chat" ? <motion.div className="app-view" key={`chat-${workspacePanelSessionKey(data)}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.standard}><ChatWorkspace data={data} busy={busy} sidebarOpen={sidebarOpen} error={error} onPrompt={prompt} onAbort={() => { void window.piBot.abort(); setBusy(false); }} onModelChange={(key) => { if (activeId) updateWith(() => window.piBot.setSessionModel(activeId, key)); }} onThinkingChange={(level) => { if (activeId) updateWith(() => window.piBot.setThinkingLevel(activeId, level)); }} /></motion.div> : <motion.div className="app-view" key="settings" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.standard}><SettingsPage data={data} busy={busy} sidebarOpen={sidebarOpen} createNewAgent={createNewAgent} onBack={() => { setError(undefined); setView("chat"); }} onUpdate={(profile) => updateWith(() => window.piBot.updateAgent(profile))} onCreate={(name, initials) => void perform(() => window.piBot.createAgent({ name, initials })).then((next) => { if (next) setView("chat"); })} onChooseFolder={(agentId) => updateWith(() => window.piBot.chooseFolder(agentId))} onTrustWorkspace={(agentId) => updateWith(() => window.piBot.trustWorkspace(agentId))} onArchive={(profile) => updateWith(() => window.piBot.archiveAgent(profile.id, !profile.archived))} onDelete={deleteAgent} onModelChange={(agentId, key) => updateWith(() => window.piBot.setAgentModel(agentId, key))} onApiKey={(provider, apiKey) => { if (apiKey) updateWith(() => window.piBot.setProviderApiKey(provider.id, apiKey)); }} onOAuth={(provider) => void authenticate(() => window.piBot.loginProvider(provider.id, "oauth"))} onLogout={(provider) => { if (window.confirm(`Disconnect ${provider.name}?`)) updateWith(() => window.piBot.logoutProvider(provider.id)); }} onImport={() => void authenticate(() => window.piBot.importPiAuth())} /></motion.div>}
      </AnimatePresence>
      <AnimatePresence initial={false}>{authPrompt && <AuthPromptCard key={authPrompt.id} prompt={authPrompt} notice={authNotice} onRespond={(value) => { void window.piBot.respondAuth(authPrompt.id, value); setAuthPrompt(undefined); }} onCancel={cancelProviderSignIn} />}</AnimatePresence>
    </div>
  </SidebarProvider>;
}
