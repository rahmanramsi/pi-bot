import { createElement, forwardRef, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { EmojiPicker } from "frimousse";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  Bot,
  CalendarClock,
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
  Pause,
  Pencil,
  Pin,
  PinOff,
  Play,
  Plus,
  RotateCcw,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Context, ContextContent, ContextContentHeader, ContextTrigger } from "@/components/ai-elements/context";
import { Message, MessageAction, MessageActions, MessageContent, MessageResponse, MessageToolbar } from "@/components/ai-elements/message";
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea, PromptInputTools, type PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { Reasoning, ReasoningContent } from "@/components/ai-elements/reasoning";
import { Task, TaskContent, TaskTrigger } from "@/components/ai-elements/task";
import { Terminal } from "@/components/ai-elements/terminal";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput, type ToolStatus } from "@/components/ai-elements/tool";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sidebar, SidebarContent, SidebarGroup, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AnimatePresence, motion, motionSprings, motionTimings, motionTransitions, useReducedMotion } from "./lib/motion";
import { createStreamDeltaBatcher, type StreamDeltaBatcher } from "./lib/streaming";
import { scheduledDateFromWallClock } from "./scheduled-time";
import type {
  AgentId,
  AgentProfile,
  AuthPrompt,
  PiBootstrap,
  PiConfig,
  PiEvent,
  PiModelOption,
  ProviderInfo,
  ScheduledJob,
  ScheduledJobDraft,
  ScheduledJobRecurrence,
  SessionSummary,
  ThinkingLevel,
  TimelineItem,
  WorkspaceFile,
  WorkspacePanelPreferences,
  WorkspacePanelTab,
} from "./types";

type View = "chat" | "settings";
type SettingsSection = "agents" | "models" | "schedules";
type Theme = "dark" | "light";
type WorkspaceTabKind = WorkspacePanelTab["kind"];
type WorkspaceTab = WorkspacePanelTab;

const defaultBrowserUrl = "https://www.google.com/";
const defaultAvatarEmoji = "🤖";

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

function compactWorkspace(workspace: string) {
  if (!workspace) return "No workspace";
  const parts = workspace.split("/").filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : workspace;
}

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

function localDateTimeInputValue(date: Date, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function formatScheduledDate(value: string | null, timeZone: string) {
  if (!value) return "Not scheduled";
  try {
    return `${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value))} · ${timeZone}`;
  } catch {
    return "Invalid date";
  }
}

function recurrenceLabel(recurrence: ScheduledJobRecurrence) {
  return recurrence === "once" ? "One time" : recurrence === "daily" ? "Every day" : recurrence === "weekly" ? "Every week" : "Every month";
}

function scheduledRunLabel(job: ScheduledJob) {
  if (!job.lastStatus) return "No runs yet";
  if (job.lastStatus === "failed") return `Failed${job.lastError ? ` · ${job.lastError}` : ""}`;
  if (job.lastStatus === "missed") return "Missed while Pi Bot was closed";
  if (job.lastStatus === "running") return "Running now";
  return "Succeeded";
}

type ScheduledJobForm = Omit<ScheduledJobDraft, "startAt"> & { startAt: string };

function scheduledJobDraftFromData(data: PiBootstrap): ScheduledJobForm {
  const agent = findAgent(data.agents, data.activeAgentId) ?? data.agents.find((item) => !item.archived);
  const modelKey = agent?.defaultModelKey || data.config.modelKey || data.config.models[0]?.key || "";
  const model = data.config.models.find((item) => item.key === modelKey);
  return {
    name: "",
    agentId: agent?.id ?? "",
    modelKey,
    thinkingLevel: model?.reasoning ? data.config.thinkingLevel : "off",
    prompt: "",
    recurrence: "once",
    startAt: localDateTimeInputValue(new Date(Date.now() + 5 * 60 * 1000)),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
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

export function startCompaction(previous: PiBootstrap | null, id: string, reason: "threshold" | "overflow") {
  if (!previous) return previous;
  const body = reason === "overflow"
    ? "The context limit was reached. Pi Bot is condensing earlier messages and retrying."
    : "Pi Bot is condensing earlier messages before the context limit is reached.";
  const item: TimelineItem = { id, kind: "status", label: "Compacting context", body, status: "running", timestamp: timeNow(), timestampMs: Date.now() };
  return {
    ...previous,
    transcript: [...previous.transcript, item],
  };
}

export function finishCompaction(previous: PiBootstrap | null, id: string, failed: boolean, errorMessage?: string) {
  if (!previous) return previous;
  return {
    ...previous,
    transcript: previous.transcript.map((item) => item.id === id
      ? {
        ...item,
        label: failed ? "Context compaction failed" : "Context compacted",
        body: failed ? errorMessage || "Pi Bot could not condense the earlier messages." : "Earlier messages were condensed to keep this conversation within the model's context limit.",
        status: failed ? "failed" as const : "done" as const,
      }
      : item),
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
  config,
  focusKey = "composer",
  placeholder = "Message your agent",
  onPrompt,
  onAbort,
  onModelChange,
  onThinkingChange,
}: {
  busy: boolean;
  disabled: boolean;
  config: PiConfig;
  focusKey?: string;
  placeholder?: string;
  onPrompt: (message: string) => void;
  onAbort: () => void;
  onModelChange: (key: string) => void;
  onThinkingChange: (level: ThinkingLevel) => void;
}) {
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reasoningLevels = config.availableThinkingLevels.length > 0 ? config.availableThinkingLevels : ["off"] as ThinkingLevel[];

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled, focusKey]);

  function submit(prompt: PromptInputMessage) {
    const value = prompt.text.trim();
    if (!value || busy || disabled) return;
    setMessage("");
    onPrompt(value);
  }

  return (
    <PromptInput className="composer" onSubmit={submit}>
      <PromptInputBody>
        <PromptInputTextarea
          ref={inputRef}
          className="composer-input"
          aria-label="Message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
        />
      </PromptInputBody>
      <PromptInputFooter className="composer-toolbar">
        <PromptInputTools className="composer-actions">
          <Context usedTokens={config.context.tokens ?? 0} maxTokens={config.context.tokens === null ? 0 : config.context.contextWindow}>
            <ContextTrigger className="composer-context-trigger" aria-label="Context usage" />
            <ContextContent>
              <ContextContentHeader />
            </ContextContent>
          </Context>
          <ModelSelect value={config.modelKey} models={config.models} onChange={onModelChange} disabled={busy || config.models.length === 0} className="composer-model-select" />
          <ThinkingSelect value={config.thinkingLevel} levels={reasoningLevels} onChange={onThinkingChange} disabled={busy || !config.modelAvailable} />
          <PromptInputSubmit
            className={busy ? "stop-button" : "send-button"}
            variant={busy ? "ghost" : "default"}
            status={busy ? "streaming" : "ready"}
            onStop={onAbort}
            disabled={!busy && (disabled || !message.trim())}
          />
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

export function MarkdownContent({ body, streaming, workspaceFiles, onWorkspaceFile }: { body: string; streaming: boolean; workspaceFiles?: readonly string[]; onWorkspaceFile?: (path: string) => void }) {
  return (
    <div className="markdown-content" data-motion={streaming ? "streaming-caret" : undefined}>
      <MessageResponse
        mode={streaming ? "streaming" : "static"}
        isAnimating={streaming}
        workspaceFiles={workspaceFiles}
        onWorkspaceFile={onWorkspaceFile}
      >
        {body}
      </MessageResponse>
    </div>
  );
}

function ChatMessage({ item, workspaceFiles }: { item: TimelineItem; workspaceFiles?: readonly string[] }) {
  const isUser = item.kind === "user";
  const copyLabel = isUser ? "Copy message" : "Copy response";
  const streaming = !isUser && item.status === "running";
  const reducedMotion = useReducedMotion();
  return (
    <motion.div layout="position" initial={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? { opacity: 1 } : { opacity: 0, y: -6 }} transition={motionTransitions.standard} data-motion="chat-message">
      <Message from={isUser ? "user" : "assistant"} className={`chat-message ${isUser ? "user" : "assistant"}`}>
        <MessageContent className="chat-message-main">
          {isUser ? <span className="user-message-text">{item.body}</span> : <MarkdownContent body={item.body || "Thinking…"} streaming={streaming} workspaceFiles={workspaceFiles} onWorkspaceFile={(path) => { void window.piBot.openWorkspaceFile(path); }} />}
        </MessageContent>
        <MessageToolbar className="chat-message-footer"><time>{item.timestamp}</time>{item.status === "failed" && <Badge variant="destructive">Failed</Badge>}{item.body && <MessageActions className="message-actions"><MessageAction label={copyLabel} tooltip={copyLabel} onClick={() => { void navigator.clipboard?.writeText(item.body); }}><Copy /></MessageAction></MessageActions>}</MessageToolbar>
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

function EventRows({ items, responding, sessionId, workspaceFiles }: { items: TimelineItem[]; responding: boolean; sessionId: string; workspaceFiles?: readonly string[] }) {
  const blocks = groupConversationItems(items);
  const lastActivityIndex = blocks.findLastIndex((block) => block.kind === "activity");

  return (
    <div className="conversation-feed">
      {items.length === 0 ? (
        <ConversationEmptyState className="empty-conversation" title="Start a conversation" description="Ask a question or describe what you want to work on." />
      ) : (
        <Conversation key={sessionId} className="conversation-scroll" aria-label="Conversation" initial="instant">
          <ConversationContent className="conversation-blocks">
            <AnimatePresence initial={false}>
              {blocks.map((block, index) => {
                const messageId = block.kind === "activity" ? `activity-${block.items[0].id}` : block.item.id;
                if (block.kind === "message") return <div className="conversation-item" key={messageId}><ChatMessage item={block.item} workspaceFiles={workspaceFiles} /></div>;
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

function AgentAvatar({ agent, className = "" }: { agent: AgentProfile; className?: string }) {
  return <Avatar className={`agent-avatar ${className}`} aria-hidden="true"><AvatarFallback>{agent.initials}</AvatarFallback></Avatar>;
}

function AvatarEmojiPicker({ value, onChange, disabled }: { value: string; onChange: (emoji: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger render={<Button type="button" variant="outline" className="avatar-picker-trigger" disabled={disabled} aria-label="Choose avatar emoji" />}>{value || defaultAvatarEmoji}</PopoverTrigger><PopoverContent className="avatar-emoji-picker" align="end"><EmojiPicker.Root columns={8} onEmojiSelect={({ emoji }) => { onChange(emoji); setOpen(false); }}><EmojiPicker.Search aria-label="Search emoji" placeholder="Search emoji" /><EmojiPicker.Viewport><EmojiPicker.Loading>Loading…</EmojiPicker.Loading><EmojiPicker.Empty>No emoji found.</EmojiPicker.Empty><EmojiPicker.List /></EmojiPicker.Viewport></EmojiPicker.Root></PopoverContent></Popover>;
}

function AgentSidebarSection({
  data,
  theme,
  busy,
  runningAgentIds,
  unreadAgentIds,
  query,
  onQueryChange,
  onSelect,
  onTogglePin,
  onCreateAgent,
  onToggleTheme,
  onSettings,
}: {
  data: PiBootstrap;
  theme: Theme;
  busy: boolean;
  runningAgentIds: ReadonlySet<AgentId>;
  unreadAgentIds: ReadonlySet<AgentId>;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (agentId: AgentId) => void;
  onTogglePin: (agent: AgentProfile) => void;
  onCreateAgent: () => void;
  onToggleTheme: () => void;
  onSettings: () => void;
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const latestSessionFor = (agent: AgentProfile) => [...(data.sessionsByAgent[agent.id] ?? [])]
    .sort((a, b) => new Date(b.latestResponseAt ?? 0).getTime() - new Date(a.latestResponseAt ?? 0).getTime())[0];
  const latestTimestampFor = (agent: AgentProfile) => {
    const latest = latestSessionFor(agent);
    return new Date(latest?.latestResponseAt ?? 0).getTime();
  };
  const agents = data.agents
    .filter((agent) => !agent.archived)
    .filter((agent) => !normalizedQuery || `${agent.name} ${agent.description}`.toLocaleLowerCase().includes(normalizedQuery))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || latestTimestampFor(b) - latestTimestampFor(a) || a.name.localeCompare(b.name));
  return (
    <section className="agent-sidebar-section">
      <header className="agent-inbox-header">
        <div className="agent-inbox-brand" title="Pi Bot">
          <img src={theme === "dark" ? "./branding/pi-bot-logo-dark.png" : "./branding/pi-bot-logo.png"} alt="Pi Bot" />
          <strong>Pi Bot</strong>
        </div>
        <Button className="agent-create-button" variant="ghost" size="icon" onClick={onCreateAgent} title="Create agent" aria-label="Create agent" disabled={busy}><Plus /></Button>
      </header>
      <label className="agent-search">
        <Search aria-hidden="true" />
        <Input value={query} onChange={(event) => onQueryChange(event.target.value)} className="agent-search-input" placeholder="Search" aria-label="Search agents" />
      </label>
      <SidebarGroup className="agent-sidebar-group">
        <SidebarMenu className="agent-list" aria-label="Agents">
          {agents.map((agent) => {
            const latest = latestSessionFor(agent);
            const isAgentWorking = runningAgentIds.has(agent.id) || (agent.id === data.activeAgentId && data.config.streaming);
            const isAgentUnread = unreadAgentIds.has(agent.id);
            return <SidebarMenuItem key={agent.id}>
              <ContextMenu>
                <ContextMenuTrigger className="agent-list-context">
                  <SidebarMenuButton className={`agent-list-item ${agent.id === data.activeAgentId ? "selected" : ""}`} isActive={agent.id === data.activeAgentId} onClick={() => onSelect(agent.id)} title={agent.name} aria-label={agent.name} tooltip={agent.name} data-motion="agent-select">
                    <AgentAvatar agent={agent} />
                    <span className="agent-list-copy">
                      <span className="agent-list-heading"><strong>{agent.name}</strong><span className="agent-list-meta">{agent.pinned && <span className="agent-pin-indicator" title="Pinned"><Pin aria-hidden="true" /></span>}{isAgentWorking ? <span className="agent-running-indicator" role="status" title={`${agent.name} is working`}><LoaderCircle className="spin" aria-hidden="true" /><span>Working</span></span> : isAgentUnread ? <span className="agent-unread-indicator" role="status" title={`${agent.name} has an unread response`}><span className="agent-unread-dot" aria-hidden="true" /><span>Unread</span></span> : <time>{shortDate(latest?.modified ?? latest?.created)}</time>}</span></span>
                      <small>{latest?.preview ?? "Start a conversation"}</small>
                    </span>
                  </SidebarMenuButton>
                </ContextMenuTrigger>
                <ContextMenuContent className="agent-context-menu-content"><ContextMenuGroup>
                  <ContextMenuItem disabled={busy} onClick={() => onTogglePin(agent)}>{agent.pinned ? <PinOff /> : <Pin />} {agent.pinned ? "Unpin agent" : "Pin agent"}</ContextMenuItem>
                </ContextMenuGroup></ContextMenuContent>
              </ContextMenu>
            </SidebarMenuItem>;
          })}
          {agents.length === 0 && <li className="muted-copy agent-list-empty">{normalizedQuery ? "No agents match your search." : "No agents yet."}</li>}
        </SidebarMenu>
      </SidebarGroup>
      <div className="agent-inbox-footer">
        <Button className="agent-theme-button" variant="ghost" size="icon-sm" onClick={onToggleTheme} title={theme === "dark" ? "Use light mode" : "Use dark mode"} aria-label={theme === "dark" ? "Use light mode" : "Use dark mode"}>{theme === "dark" ? <Sun data-icon="inline-start" /> : <Moon data-icon="inline-start" />}</Button>
        <Button className="agent-settings-button" variant="ghost" size="icon-sm" onClick={onSettings} title="App settings" aria-label="App settings"><Settings2 data-icon="inline-start" /></Button>
      </div>
    </section>
  );
}

type HistorySidebarProps = {
  data: PiBootstrap;
  busy: boolean;
  theme: Theme;
  onNewChat: () => void;
  onOpenSession: (session: SessionSummary) => void;
  onDeleteSession: (session: SessionSummary) => void;
  onBack: () => void;
  onToggleTheme: () => void;
  onSettings: () => void;
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

function HistorySidebar({
  data,
  busy,
  theme,
  onNewChat,
  onOpenSession,
  onDeleteSession,
  onBack,
  onToggleTheme,
  onSettings,
}: HistorySidebarProps) {
  const agent = findAgent(data.agents, data.activeAgentId);
  const sessions = agent ? data.sessionsByAgent[agent.id] ?? [] : [];
  const groups = groupSessions(sessions);
  return (
    <section className="history-sidebar" data-motion="history-sidebar">
      <header className="history-sidebar-header">
        <Button className="history-back-button" variant="ghost" size="sm" onClick={onBack} aria-label="Back to agents"><ArrowLeft /> <span>All agents</span></Button>
        {agent && <AgentAvatar agent={agent} />}
        <div className="history-sidebar-agent">
          <strong>{agent?.name ?? "No active agent"}</strong>
          {agent?.description && <small>{agent.description}</small>}
        </div>
      </header>
      <Button className="new-chat-button" onClick={onNewChat} disabled={!data.activeAgentId || busy}><MessageSquarePlus /> New conversation <Plus /></Button>
      {agent && sessions.length === 0 && <Empty className="session-empty"><EmptyMedia variant="icon"><MessagesSquare /></EmptyMedia><EmptyHeader><EmptyTitle>No sessions yet</EmptyTitle><EmptyDescription>Start a new session with {agent.name}.</EmptyDescription></EmptyHeader></Empty>}
      {!agent && <Empty className="session-empty"><EmptyMedia variant="icon"><Bot /></EmptyMedia><EmptyHeader><EmptyTitle>No active agents</EmptyTitle><EmptyDescription>Create an agent from the Agents section to begin.</EmptyDescription></EmptyHeader></Empty>}
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
      <div className="agent-inbox-footer">
        <Button className="agent-theme-button" variant="ghost" size="icon-sm" onClick={onToggleTheme} title={theme === "dark" ? "Use light mode" : "Use dark mode"} aria-label={theme === "dark" ? "Use light mode" : "Use dark mode"}>{theme === "dark" ? <Sun data-icon="inline-start" /> : <Moon data-icon="inline-start" />}</Button>
        <Button className="agent-settings-button" variant="ghost" size="icon-sm" onClick={onSettings} title="App settings" aria-label="App settings"><Settings2 data-icon="inline-start" /></Button>
      </div>
    </section>
  );
}

function AppSidebar({
  data,
  theme,
  busy,
  runningAgentIds,
  unreadAgentIds,
  historyAgentId,
  onSelectAgent,
  onTogglePin,
  onCreateAgent,
  onToggleTheme,
  onSettings,
  onNewChat,
  onOpenSession,
  onDeleteSession,
  onBackFromHistory,
}: {
  data: PiBootstrap;
  theme: Theme;
  busy: boolean;
  runningAgentIds: ReadonlySet<AgentId>;
  unreadAgentIds: ReadonlySet<AgentId>;
  historyAgentId: AgentId | null;
  onSelectAgent: (agentId: AgentId) => void;
  onTogglePin: (agent: AgentProfile) => void;
  onCreateAgent: () => void;
  onToggleTheme: () => void;
  onSettings: () => void;
  onNewChat: () => void;
  onOpenSession: (session: SessionSummary) => void;
  onDeleteSession: (session: SessionSummary) => void;
  onBackFromHistory: () => void;
}) {
  const [query, setQuery] = useState("");
  return (
    <Sidebar className="app-sidebar" collapsible="offcanvas" data-motion="app-sidebar">
      <SidebarHeader className="combined-sidebar-topbar section-topbar" aria-label="Sidebar toolbar">
        <SidebarTrigger className="sidebar-window-toggle" title="Hide sidebar" aria-label="Hide sidebar" data-motion="sidebar-toggle"><PanelLeftClose data-icon="inline-start" /></SidebarTrigger>
      </SidebarHeader>
      <SidebarContent className="app-sidebar-main">
        {historyAgentId ? <HistorySidebar data={{ ...data, activeAgentId: historyAgentId }} theme={theme} busy={busy} onBack={onBackFromHistory} onNewChat={onNewChat} onOpenSession={onOpenSession} onDeleteSession={onDeleteSession} onToggleTheme={onToggleTheme} onSettings={onSettings} /> : <AgentSidebarSection data={data} theme={theme} busy={busy} runningAgentIds={runningAgentIds} unreadAgentIds={unreadAgentIds} query={query} onQueryChange={setQuery} onSelect={onSelectAgent} onTogglePin={onTogglePin} onCreateAgent={onCreateAgent} onToggleTheme={onToggleTheme} onSettings={onSettings} />}
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
  workspaceFiles?: readonly string[];
  onShowHistory?: (agentId: AgentId) => void;
  workspaceOpen?: boolean;
  onShowWorkspace?: () => void;
};

function ChatWorkspace({ data, busy, sidebarOpen, error, onPrompt, onAbort, onModelChange, onThinkingChange, onShowHistory }: Omit<ChatViewProps, "workspaceOpen" | "onShowWorkspace">) {
  const storageKey = `pi-bot.workspace-panel:${workspacePanelSessionKey(data)}`;
  const [workspaceFileState, setWorkspaceFileState] = useState<{ workspace: string; paths: string[] }>({ workspace: "", paths: [] });
  const [preferences, setPreferences] = useState<WorkspacePanelPreferences>(defaultWorkspacePanelPreferences);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const loadedStorageKey = useRef<string | undefined>(undefined);
  const resize = useRef<{ x: number; width: number } | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    const workspace = data.config.workspace;
    if (!workspace) {
      setWorkspaceFileState({ workspace: "", paths: [] });
      return () => { cancelled = true; };
    }
    window.piBot.listWorkspaceFiles()
      .then((files) => {
        if (!cancelled) setWorkspaceFileState({ workspace, paths: files.filter((file) => file.kind === "file").map((file) => file.path) });
      })
      .catch(() => {
        if (!cancelled) setWorkspaceFileState({ workspace, paths: [] });
      });
    return () => { cancelled = true; };
  }, [data.config.workspace, busy]);
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
  const workspaceFiles = workspaceFileState.workspace && workspaceFileState.workspace === data.config.workspace ? workspaceFileState.paths : undefined;
  return <motion.section layout="position" transition={motionSprings.layout} className={`chat-workspace ${preferences.open ? "panel-open" : "panel-closed"}`} style={{ "--workspace-panel-width": `${preferences.width}px` } as CSSProperties} data-motion="chat-workspace"><ChatView data={data} busy={busy} sidebarOpen={sidebarOpen} error={error} onPrompt={onPrompt} onAbort={onAbort} onModelChange={onModelChange} onThinkingChange={onThinkingChange} workspaceFiles={workspaceFiles} onShowHistory={onShowHistory} workspaceOpen={preferences.open} onShowWorkspace={() => setPreferences((current) => ({ ...current, open: true }))} />{preferences.open && <motion.button className="workspace-resize-handle" type="button" onMouseDown={startResize} aria-label="Resize workspace panel" whileHover={{ opacity: 1 }} transition={motionTransitions.micro} data-motion="workspace-resize" />}<AnimatePresence initial={false} mode="popLayout">{preferences.open && <RightWorkspacePanel key="workspace-panel" data={data} open={preferences.open} storageKey={storageKey} preferences={preferences} onChange={setPreferences} onClose={() => setPreferences((current) => ({ ...current, open: false }))} />}</AnimatePresence></motion.section>;
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
  workspaceFiles,
  onShowHistory,
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
        <div className="chat-agent-title">
          {agent && <AgentAvatar agent={agent} />}
          <span><strong>{agent?.name ?? "No active agent"}</strong></span>
          {agent && onShowHistory && <DropdownMenu>
            <DropdownMenuTrigger render={<Button className="chat-agent-menu-button" variant="ghost" size="icon-sm" aria-label={`Open menu for ${agent.name}`} />}><MoreHorizontal data-icon="inline-start" /></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="chat-agent-menu-content"><DropdownMenuGroup>
              <DropdownMenuItem onClick={() => onShowHistory(agent.id)} data-motion="chat-history"><MessagesSquare /> Chat history</DropdownMenuItem>
            </DropdownMenuGroup></DropdownMenuContent>
          </DropdownMenu>}
        </div>
        <AnimatePresence initial={false}>{responding && <motion.span className="responding-indicator" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={motionTransitions.micro}><motion.i animate={reducedMotion ? { opacity: 1 } : { opacity: [0.35, 1, 0.35] }} transition={reducedMotion ? motionTransitions.micro : { duration: 1.2, repeat: Infinity, ease: "easeInOut" }} /> Responding</motion.span>}</AnimatePresence>
        {!workspaceOpen && onShowWorkspace && <Button className="workspace-panel-show" variant="ghost" size="icon-sm" onClick={onShowWorkspace} title="Show workspace" aria-label="Show workspace"><PanelRightOpen /></Button>}
      </header>
      <ErrorBanner message={error} />
      {!data.authenticated && <Alert className="notice-line"><KeyRound /><AlertDescription>Add a provider credential in App Settings to start chatting.</AlertDescription></Alert>}
      {data.authenticated && blocked && agent && <Alert className="notice-line"><CircleAlert /><AlertDescription>This agent’s model is unavailable. Choose another model in App Settings.</AlertDescription></Alert>}
      <EventRows items={data.transcript} responding={responding} sessionId={data.config.session?.path ?? "new-session"} workspaceFiles={workspaceFiles} />
      <Composer busy={responding} disabled={blocked || responding} config={data.config} focusKey={workspacePanelSessionKey(data)} placeholder={agent ? `Message ${agent.name}` : "Message your agent"} onPrompt={onPrompt} onAbort={onAbort} onModelChange={onModelChange} onThinkingChange={onThinkingChange} />
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
  onCreate: (name: string, initials: string, description: string) => void;
  onSave: (agent: AgentProfile) => void;
  onChooseFolder: (agentId: AgentId) => void;
  onTrustWorkspace: (agentId: AgentId) => void;
  onArchive: (agent: AgentProfile) => void;
  onDelete: (agent: AgentProfile) => void;
  onModelChange: (agentId: AgentId, key: string) => void;
}) {
  const [name, setName] = useState(agent?.name ?? "");
  const [initials, setInitials] = useState(agent?.initials ?? defaultAvatarEmoji);
  const [description, setDescription] = useState(agent?.description ?? "");
  const [instructions, setInstructions] = useState(agent?.instructions ?? "");
  useEffect(() => {
    setName(agent?.name ?? "");
    setInitials(agent?.initials ?? defaultAvatarEmoji);
    setDescription(agent?.description ?? "");
    setInstructions(agent?.instructions ?? "");
  }, [agent?.id, agent?.name, agent?.initials, agent?.description, agent?.instructions, isNew]);

  if (isNew) {
    return <section className="settings-detail"><div className="detail-heading"><div><span className="eyebrow">New agent</span><h2>Create an agent</h2><p>Give this teammate a name. Its workspace starts isolated and empty.</p></div></div><div className="settings-form"><label className="form-field"><span>Name</span><Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Deep Research Agent" /></label><label className="form-field compact-field"><span>Avatar</span><AvatarEmojiPicker value={initials} onChange={setInitials} /></label><label className="form-field"><span>Description <em>optional</em></span><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What does this agent do?" /></label><div className="settings-actions"><Button onClick={() => onCreate(name, initials, description)} disabled={busy || !name.trim()}><Plus /> Create agent</Button></div></div></section>;
  }

  if (!agent) return <Empty className="settings-detail empty-settings"><EmptyMedia variant="icon"><Bot /></EmptyMedia><EmptyTitle>No active agents</EmptyTitle><EmptyDescription>Create an agent to begin.</EmptyDescription></Empty>;
  return (
    <section className="settings-detail">
      <div className="detail-heading"><div className="detail-agent-title"><AgentAvatar agent={{ ...agent, initials: initials || agent.initials }} /><div><span className="eyebrow">Agent settings</span><h2>{agent.name}</h2><p>Identity, instructions, workspace, and default model for new chats.</p></div></div></div>
      <div className="settings-form">
        <div className="form-grid"><label className="form-field"><span>Name</span><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Deep Research Agent" disabled={busy} /></label><label className="form-field compact-field"><span>Avatar</span><AvatarEmojiPicker value={initials} onChange={setInitials} disabled={busy} /></label></div>
        <label className="form-field"><span>Description</span><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What does this agent do?" disabled={busy} /></label>
        <label className="form-field"><span>Instructions</span><Textarea className="instructions-field" value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Write what this agent should do, what to focus on, what to avoid..." disabled={busy} /></label>
        <div className="settings-card"><div className="settings-card-heading"><div><span className="eyebrow">Workspace</span><strong>{agent.workspaceKind === "app" ? "App-owned workspace" : "External workspace"}</strong></div><FolderOpen /></div><p className="workspace-path" title={agent.workspace}>{agent.workspace || "No workspace"}</p><div className="settings-card-actions"><Button variant="outline" size="sm" onClick={() => onChooseFolder(agent.id)} disabled={busy}><FolderOpen /> Change workspace</Button>{agent.workspaceKind === "external" && !agent.workspaceTrusted && <Button variant="outline" size="sm" onClick={() => onTrustWorkspace(agent.id)} disabled={busy}><ShieldCheck /> Trust skills</Button>}</div><small>{agent.workspaceTrusted ? "Workspace skills are available from .agents/skills." : "Skills are disabled until this workspace is trusted."}</small></div>
        <div className="form-field"><span>Default model <em>applies to new chats</em></span><ModelSelect value={agent.defaultModelKey} models={models} onChange={(key) => onModelChange(agent.id, key)} disabled={busy || models.length === 0} className="field-select-trigger" /></div>
        <div className="settings-actions"><Button onClick={() => onSave({ ...agent, name: name.trim() || agent.name, initials, description: description.trim(), instructions })} disabled={busy || !name.trim()}><Check /> Save changes</Button></div>
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

function ScheduledJobsSettings({
  data,
  busy,
  onSave,
  onPause,
  onRun,
  onDelete,
  onOpenSession,
}: {
  data: PiBootstrap;
  busy: boolean;
  onSave: (id: string | undefined, draft: ScheduledJobDraft) => void;
  onPause: (job: ScheduledJob) => void;
  onRun: (job: ScheduledJob) => void;
  onDelete: (job: ScheduledJob) => void;
  onOpenSession: (job: ScheduledJob) => void;
}) {
  const [editingId, setEditingId] = useState<string>();
  const [form, setForm] = useState<ScheduledJobForm>(() => scheduledJobDraftFromData(data));
  const editingJob = editingId && editingId !== "new" ? data.scheduledJobs.find((job) => job.id === editingId) : undefined;

  useEffect(() => {
    if (!editingId) return;
    if (editingId === "new") {
      setForm(scheduledJobDraftFromData(data));
      return;
    }
    if (editingJob) {
      setForm({
        name: editingJob.name,
        agentId: editingJob.agentId,
        modelKey: editingJob.modelKey,
        thinkingLevel: editingJob.thinkingLevel,
        prompt: editingJob.prompt,
        recurrence: editingJob.recurrence,
        startAt: localDateTimeInputValue(new Date(editingJob.startAt), editingJob.timeZone),
        timeZone: editingJob.timeZone,
      });
    }
  }, [editingId, editingJob, data]);

  const selectedModel = data.config.models.find((model) => model.key === form.modelKey);
  const availableThinkingLevels: ThinkingLevel[] = selectedModel?.reasoning ? ["off", "minimal", "low", "medium", "high", "xhigh", "max"] : ["off"];
  const activeAgents = data.agents.filter((agent) => !agent.archived);

  function updateAgent(agentId: string) {
    const agent = activeAgents.find((item) => item.id === agentId);
    const modelKey = agent?.defaultModelKey && data.config.models.some((model) => model.key === agent.defaultModelKey)
      ? agent.defaultModelKey
      : data.config.models[0]?.key ?? "";
    const model = data.config.models.find((item) => item.key === modelKey);
    setForm((previous) => ({ ...previous, agentId, modelKey, thinkingLevel: model?.reasoning ? previous.thinkingLevel : "off" }));
  }

  function save() {
    const startAt = scheduledDateFromWallClock(form.startAt, form.timeZone);
    if (!startAt) return;
    onSave(editingId === "new" ? undefined : editingId, {
      ...form,
      startAt: startAt.toISOString(),
      thinkingLevel: availableThinkingLevels.includes(form.thinkingLevel) ? form.thinkingLevel : "off",
    });
    setEditingId(undefined);
  }

  return <motion.section className="settings-detail scheduled-settings" layout data-motion="scheduled-settings">
    <div className="detail-heading"><div><span className="eyebrow">App settings</span><h2>Scheduled jobs</h2><p>Prepare work for an agent to run while Pi Bot is open. Each job keeps its own agent, workspace, model, reasoning level, and prompt.</p></div></div>
    <div className="scheduled-toolbar"><Button onClick={() => { setForm(scheduledJobDraftFromData(data)); setEditingId("new"); }} disabled={busy || activeAgents.length === 0 || data.config.models.length === 0}><Plus /> New scheduled job</Button><span className="muted-copy">{data.scheduledJobs.length} job{data.scheduledJobs.length === 1 ? "" : "s"}</span></div>
    <div className="scheduled-lifecycle-note"><CalendarClock /><span><strong>Open-app only</strong><small>Jobs do not run after Pi Bot closes. Missed runs are skipped on the next launch, and overlapping runs are not started.</small></span></div>
    {data.scheduledJobs.length > 0 ? <div className="scheduled-job-list">{data.scheduledJobs.map((job) => {
      const agent = findAgent(data.agents, job.agentId);
      return <article className={`scheduled-job-row ${job.status === "paused" ? "paused" : ""}`} key={job.id}>
        <header className="scheduled-job-header"><div><strong>{job.name}</strong><span>{agent?.name ?? "Agent unavailable"} · {compactWorkspace(job.workspace)}</span></div><span className={`scheduled-status ${job.status}`}>{job.status === "paused" ? "Paused" : "Active"}</span></header>
        <p className="scheduled-job-prompt">{job.prompt}</p>
        <div className="scheduled-job-meta"><span><b>Schedule</b>{recurrenceLabel(job.recurrence)} · {formatScheduledDate(job.startAt, job.timeZone)}</span><span><b>Next run</b>{formatScheduledDate(job.nextRunAt, job.timeZone)}</span><span title={job.lastError ?? undefined}><b>Last run</b>{job.lastRunAt ? `${scheduledRunLabel(job)} · ${formatScheduledDate(job.lastRunAt, job.timeZone)}` : scheduledRunLabel(job)}</span></div>
        <div className="scheduled-job-actions"><Button variant="outline" size="sm" onClick={() => onPause(job)} disabled={busy}><>{job.status === "paused" ? <Play /> : <Pause />}{job.status === "paused" ? "Resume" : "Pause"}</></Button><Button variant="outline" size="sm" onClick={() => onRun(job)} disabled={busy}><RefreshCw /> Run now</Button><Button variant="ghost" size="sm" onClick={() => { setForm({ name: job.name, agentId: job.agentId, modelKey: job.modelKey, thinkingLevel: job.thinkingLevel, prompt: job.prompt, recurrence: job.recurrence, startAt: localDateTimeInputValue(new Date(job.startAt), job.timeZone), timeZone: job.timeZone }); setEditingId(job.id); }} disabled={busy}><Pencil /> Edit</Button>{job.lastSessionPath && <Button variant="ghost" size="sm" onClick={() => onOpenSession(job)} disabled={busy}><MessagesSquare /> Open session</Button>}<Button variant="ghost" size="sm" onClick={() => onDelete(job)} disabled={busy}><Trash2 /> Delete</Button></div>
      </article>;
    })}</div> : <Empty className="scheduled-empty"><EmptyMedia variant="icon"><CalendarClock /></EmptyMedia><EmptyTitle>No scheduled jobs yet</EmptyTitle><EmptyDescription>Create a recurring or one-time prompt for an agent. It will stay here across app restarts.</EmptyDescription></Empty>}
    {editingId && <section className="scheduled-job-editor"><div className="detail-heading"><div><span className="eyebrow">{editingId === "new" ? "New job" : "Edit job"}</span><h3>{editingId === "new" ? "Schedule agent work" : "Update scheduled job"}</h3></div><Button variant="ghost" size="icon-sm" onClick={() => setEditingId(undefined)} aria-label="Close scheduled job editor"><X /></Button></div><div className="scheduled-form"><label className="form-field"><span>Name</span><Input autoFocus value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} placeholder="e.g. Review open pull requests" /></label><div className="form-grid"><label className="form-field"><span>Agent</span><select className="field-select" value={form.agentId} onChange={(event) => updateAgent(event.target.value)}>{activeAgents.map((agent) => <option value={agent.id} key={agent.id}>{agent.name}</option>)}</select></label><label className="form-field"><span>Model</span><select className="field-select" value={form.modelKey} onChange={(event) => { const model = data.config.models.find((item) => item.key === event.target.value); setForm((previous) => ({ ...previous, modelKey: event.target.value, thinkingLevel: model?.reasoning ? previous.thinkingLevel : "off" })); }} disabled={data.config.models.length === 0}>{data.config.models.map((model) => <option value={model.key} key={model.key}>{model.name} · {model.provider}</option>)}</select></label></div><div className="form-grid"><label className="form-field"><span>Recurrence</span><select className="field-select" value={form.recurrence} onChange={(event) => setForm((previous) => ({ ...previous, recurrence: event.target.value as ScheduledJobRecurrence }))}><option value="once">One time</option><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option></select></label><label className="form-field"><span>Reasoning</span><select className="field-select" value={form.thinkingLevel} onChange={(event) => setForm((previous) => ({ ...previous, thinkingLevel: event.target.value as ThinkingLevel }))}>{availableThinkingLevels.map((level) => <option value={level} key={level}>{labelThinkingLevel(level)}</option>)}</select></label></div><div className="form-grid"><label className="form-field"><span>{form.recurrence === "once" ? "Run at" : "First run at"}</span><Input type="datetime-local" value={form.startAt} onChange={(event) => setForm((previous) => ({ ...previous, startAt: event.target.value }))} /></label><label className="form-field"><span>Time zone</span><Input value={form.timeZone} readOnly /><small className="field-help">The schedule uses this IANA time zone. Recurring monthly dates clamp to the last day when a month is shorter.</small></label></div><label className="form-field"><span>Prompt</span><Textarea className="scheduled-prompt-field" rows={5} value={form.prompt} onChange={(event) => setForm((previous) => ({ ...previous, prompt: event.target.value }))} placeholder="What should the agent do?" /></label><div className="settings-actions"><Button variant="outline" onClick={() => setEditingId(undefined)} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy || !form.name.trim() || !form.agentId || !form.modelKey || !form.prompt.trim()}><Check /> Save scheduled job</Button></div></div></section>}
  </motion.section>;
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
  onCreateScheduledJob,
  onUpdateScheduledJob,
  onPauseScheduledJob,
  onRunScheduledJob,
  onDeleteScheduledJob,
  onOpenScheduledSession,
}: {
  data: PiBootstrap;
  busy: boolean;
  sidebarOpen: boolean;
  createNewAgent: boolean;
  onBack: () => void;
  onUpdate: (profile: AgentProfile) => void;
  onCreate: (name: string, initials: string, description: string) => void;
  onChooseFolder: (agentId: AgentId) => void;
  onTrustWorkspace: (agentId: AgentId) => void;
  onArchive: (agent: AgentProfile) => void;
  onDelete: (agent: AgentProfile) => void;
  onModelChange: (agentId: AgentId, key: string) => void;
  onApiKey: (provider: ProviderInfo, apiKey?: string) => void;
  onOAuth: (provider: ProviderInfo) => void;
  onLogout: (provider: ProviderInfo) => void;
  onImport: () => void;
  onCreateScheduledJob: (draft: ScheduledJobDraft) => void;
  onUpdateScheduledJob: (id: string, draft: ScheduledJobDraft) => void;
  onPauseScheduledJob: (job: ScheduledJob) => void;
  onRunScheduledJob: (job: ScheduledJob) => void;
  onDeleteScheduledJob: (job: ScheduledJob) => void;
  onOpenScheduledSession: (job: ScheduledJob) => void;
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
          <motion.button type="button" className={section === "schedules" ? "selected" : ""} onClick={() => setSection("schedules")} whileTap={{ scale: 0.98 }} transition={motionSprings.press} data-motion="settings-nav">
            {section === "schedules" && <motion.span className="settings-nav-active" layoutId="settings-nav-active" transition={motionSprings.layout} aria-hidden="true" />}
            <CalendarClock /><span>Scheduled jobs</span><small>{data.scheduledJobs.length}</small>
          </motion.button>
        </nav>
        <AnimatePresence initial={false} mode="wait">
          {section === "models" ? <motion.div key="models" className="settings-panel-motion" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={motionTransitions.standard}><ModelsSettings data={data} busy={busy} onApiKey={onApiKey} onOAuth={onOAuth} onLogout={onLogout} onImport={onImport} /></motion.div> : section === "schedules" ? <motion.div key="schedules" className="settings-panel-motion" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={motionTransitions.standard}><ScheduledJobsSettings data={data} busy={busy} onSave={(id, draft) => { if (id) onUpdateScheduledJob(id, draft); else onCreateScheduledJob(draft); }} onPause={onPauseScheduledJob} onRun={onRunScheduledJob} onDelete={onDeleteScheduledJob} onOpenSession={onOpenScheduledSession} /></motion.div> : <motion.div key="agents" className="agent-settings-layout" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={motionTransitions.standard}>
            <aside className="settings-agent-list"><div className="settings-list-heading"><span className="eyebrow">All agents</span><Button variant="outline" size="icon-sm" onClick={() => setSelectedId("new")} disabled={busy} aria-label="Create agent"><Plus /></Button></div>{data.agents.map((agent) => <motion.button type="button" className={`settings-agent-item ${selectedId === agent.id ? "selected" : ""} ${agent.archived ? "archived" : ""}`} key={agent.id} onClick={() => setSelectedId(agent.id)} whileTap={{ scale: 0.99 }} transition={motionSprings.press} data-motion="settings-agent-select">{selectedId === agent.id && <motion.span className="settings-agent-active" layoutId="settings-agent-active" transition={motionSprings.layout} aria-hidden="true" />}<AgentAvatar agent={agent} /><span><strong>{agent.name}</strong><small>{agent.archived ? "Archived" : agent.workspaceKind === "external" ? "External workspace" : "App workspace"}</small></span></motion.button>)}{data.agents.length === 0 && <p className="muted-copy">No agents yet.</p>}</aside>
            <AgentEditor agent={selected} models={data.config.models} isNew={selectedId === "new"} busy={busy} onCreate={(name, initials, description) => onCreate(name, initials, description)} onSave={onUpdate} onChooseFolder={onChooseFolder} onTrustWorkspace={onTrustWorkspace} onArchive={onArchive} onDelete={onDelete} onModelChange={onModelChange} />
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
  const [historyAgentId, setHistoryAgentId] = useState<AgentId | null>(null);
  const [createNewAgent, setCreateNewAgent] = useState(false);
  const [authPrompt, setAuthPrompt] = useState<{ id: string; prompt: AuthPrompt }>();
  const [authNotice, setAuthNotice] = useState<string>();
  const [runningAgentIds, setRunningAgentIds] = useState<Set<AgentId>>(() => new Set());
  const [unreadAgentIds, setUnreadAgentIds] = useState<Set<AgentId>>(() => new Set());
  const activeAgentIdRef = useRef<AgentId | null>(null);
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
        } else if (event.type === "compaction-start") {
          setData((previous) => startCompaction(previous, event.id, event.reason));
        } else if (event.type === "compaction-end") {
          setData((previous) => finishCompaction(previous, event.id, event.failed, event.errorMessage));
        } else if (event.type === "tool-start") {
          setData((previous) => previous ? { ...previous, transcript: [...previous.transcript, { id: event.id, kind: "tool", label: `Tool · ${event.name}`, body: event.detail, input: event.detail, status: "running", timestamp: timeNow(), timestampMs: Date.now() }] } : previous);
        } else if (event.type === "tool-update") {
          setData((previous) => {
            if (!previous) return previous;
            return { ...previous, transcript: previous.transcript.map((item) => item.id === event.id ? { ...item, body: event.detail } : item) };
          });
        } else if (event.type === "tool-end") {
          setData((previous) => previous ? { ...previous, transcript: previous.transcript.map((item) => item.id === event.id ? { ...item, body: event.detail, status: event.failed ? "failed" : "done" } : item) } : previous);
        } else if (event.type === "agent-status") {
          setRunningAgentIds((previous) => {
            const next = new Set(previous);
            if (event.running) next.add(event.agentId);
            else next.delete(event.agentId);
            return next;
          });
          if (!event.running && activeAgentIdRef.current !== event.agentId) setUnreadAgentIds((previous) => new Set(previous).add(event.agentId));
        }
        else if (event.type === "agent-start") setBusy(true);
        else if (event.type === "agent-settled" || event.type === "aborted") setBusy(false);
        else if (event.type === "agent-end" && !event.retrying) setBusy(false);
        else if (event.type === "error") { setBusy(false); setError(event.message); }
        else if (event.type === "auth-prompt") setAuthPrompt({ id: event.id, prompt: event.prompt });
        else if (event.type === "auth-notify") setAuthNotice(event.event.message || event.event.instructions || (event.event.url ? `Continue in your browser: ${event.event.url}` : undefined));
        else if (event.type === "session-sync") {
          activeAgentIdRef.current = event.activeAgentId;
          setData((previous) => previous ? { ...previous, transcript: event.transcript, sessions: event.sessions, sessionsByAgent: event.sessionsByAgent, config: event.config, agents: event.agents, setup: event.setup, authenticated: event.authenticated, activeAgentId: event.activeAgentId, scheduledJobs: event.scheduledJobs } : previous);
        }
        else if (event.type === "scheduled-jobs-sync") setData((previous) => previous ? { ...previous, scheduledJobs: event.scheduledJobs } : previous);
      }
    });
    Promise.all([window.piBot.connect(), window.piBot.getTheme()]).then(([result, savedTheme]) => { activeAgentIdRef.current = result.activeAgentId; setData(result); setTheme(savedTheme); setConnecting(false); }).catch((reason) => { setError(readableError(reason)); setConnecting(false); });
    return () => {
      streamBatcherRef.current?.cancel();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (data?.setup.required) window.piBot.reportRendererStage("setup-ready");
  }, [data]);

  useEffect(() => {
    if (!historyAgentId) return;
    const agent = data?.agents.find((item) => item.id === historyAgentId);
    if (!agent || agent.archived) setHistoryAgentId(null);
  }, [data, historyAgentId]);

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
    const agentId = data?.activeAgentId;
    if (agentId) setRunningAgentIds((previous) => new Set(previous).add(agentId));
    const timestampMs = Date.now();
    setData((previous) => previous ? { ...previous, transcript: [...previous.transcript, { id: `user-${timestampMs}`, kind: "user", label: "You", body: message, timestamp: timeNow(), timestampMs }] } : previous);
    try { await window.piBot.prompt(message); } catch (reason) {
      setError(readableError(reason));
      setBusy(false);
      if (agentId) setRunningAgentIds((previous) => {
        const next = new Set(previous);
        next.delete(agentId);
        return next;
      });
    }
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
  function selectAgent(agentId: AgentId) {
    setHistoryAgentId(null);
    activeAgentIdRef.current = agentId;
    setUnreadAgentIds((previous) => {
      const next = new Set(previous);
      next.delete(agentId);
      return next;
    });
    navigateToChat(() => window.piBot.selectAgent(agentId));
  }
  function showHistory(agentId: AgentId) {
    setHistoryAgentId(agentId);
    setSidebarOpen(true);
  }
  function startNewConversation() {
    setHistoryAgentId(null);
    navigateToChat(() => window.piBot.newSession());
  }
  function openConversation(chat: SessionSummary) {
    setHistoryAgentId(null);
    activeAgentIdRef.current = chat.agentId;
    setUnreadAgentIds((previous) => {
      const next = new Set(previous);
      next.delete(chat.agentId);
      return next;
    });
    navigateToChat(() => window.piBot.openSession(chat.path, chat.agentId));
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
  function toggleAgentPin(profile: AgentProfile) {
    updateWith(() => window.piBot.updateAgent({ ...profile, pinned: !profile.pinned }));
  }
  function createScheduledJob(draft: ScheduledJobDraft) {
    updateWith(() => window.piBot.createScheduledJob(draft));
  }
  function updateScheduledJob(id: string, draft: ScheduledJobDraft) {
    updateWith(() => window.piBot.updateScheduledJob(id, draft));
  }
  function pauseScheduledJob(job: ScheduledJob) {
    updateWith(() => window.piBot.setScheduledJobPaused(job.id, job.status !== "paused"));
  }
  function runScheduledJob(job: ScheduledJob) {
    updateWith(() => window.piBot.runScheduledJob(job.id));
  }
  function deleteScheduledJob(job: ScheduledJob) {
    if (!window.confirm(`Delete “${job.name}” permanently? Its run history will be removed.`)) return;
    updateWith(() => window.piBot.deleteScheduledJob(job.id));
  }
  function openScheduledSession(job: ScheduledJob) {
    if (!job.lastSessionPath) return;
    navigateToChat(() => window.piBot.openScheduledSession(job.id));
  }
  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    void window.piBot.saveTheme(next).catch((reason) => {
      setTheme(theme);
      setError(readableError(reason));
    });
  }

      return <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen} className="app-sidebar-provider">
        <div className={`app-shell ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`} data-motion="app-shell">
          <AppSidebar data={data} theme={theme} busy={busy} runningAgentIds={runningAgentIds} unreadAgentIds={unreadAgentIds} historyAgentId={historyAgentId} onSelectAgent={selectAgent} onTogglePin={toggleAgentPin} onCreateAgent={() => { setHistoryAgentId(null); setError(undefined); setCreateNewAgent(true); setView("settings"); }} onToggleTheme={toggleTheme} onSettings={() => { setHistoryAgentId(null); setError(undefined); setCreateNewAgent(false); setView("settings"); }} onNewChat={startNewConversation} onOpenSession={openConversation} onDeleteSession={deleteSession} onBackFromHistory={() => setHistoryAgentId(null)} />
          <AnimatePresence initial={false} mode="wait">
            {view === "chat" ? <motion.div className="app-view" key="chat" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.standard}><ChatWorkspace data={data} busy={busy} sidebarOpen={sidebarOpen} error={error} onPrompt={prompt} onAbort={() => { void window.piBot.abort(); setBusy(false); }} onModelChange={(key) => { if (activeId) updateWith(() => window.piBot.setSessionModel(activeId, key)); }} onThinkingChange={(level) => { if (activeId) updateWith(() => window.piBot.setThinkingLevel(activeId, level)); }} onShowHistory={showHistory} /></motion.div> : <motion.div className="app-view" key="settings" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={motionTransitions.standard}><SettingsPage data={data} busy={busy} sidebarOpen={sidebarOpen} createNewAgent={createNewAgent} onBack={() => { setError(undefined); setView("chat"); }} onUpdate={(profile) => updateWith(() => window.piBot.updateAgent(profile))} onCreate={(name, initials, description) => void perform(() => window.piBot.createAgent({ name, initials, description })).then((next) => { if (next) setView("chat"); })} onChooseFolder={(agentId) => updateWith(() => window.piBot.chooseFolder(agentId))} onTrustWorkspace={(agentId) => updateWith(() => window.piBot.trustWorkspace(agentId))} onArchive={(profile) => updateWith(() => window.piBot.archiveAgent(profile.id, !profile.archived))} onDelete={deleteAgent} onModelChange={(agentId, key) => updateWith(() => window.piBot.setAgentModel(agentId, key))} onApiKey={(provider, apiKey) => { if (apiKey) updateWith(() => window.piBot.setProviderApiKey(provider.id, apiKey)); }} onOAuth={(provider) => void authenticate(() => window.piBot.loginProvider(provider.id, "oauth"))} onLogout={(provider) => { if (window.confirm(`Disconnect ${provider.name}?`)) updateWith(() => window.piBot.logoutProvider(provider.id)); }} onImport={() => void authenticate(() => window.piBot.importPiAuth())} onCreateScheduledJob={createScheduledJob} onUpdateScheduledJob={updateScheduledJob} onPauseScheduledJob={pauseScheduledJob} onRunScheduledJob={runScheduledJob} onDeleteScheduledJob={deleteScheduledJob} onOpenScheduledSession={openScheduledSession} /></motion.div>}
      </AnimatePresence>
      <AnimatePresence initial={false}>{authPrompt && <AuthPromptCard key={authPrompt.id} prompt={authPrompt} notice={authNotice} onRespond={(value) => { void window.piBot.respondAuth(authPrompt.id, value); setAuthPrompt(undefined); }} onCancel={cancelProviderSignIn} />}</AnimatePresence>
    </div>
  </SidebarProvider>;
}
