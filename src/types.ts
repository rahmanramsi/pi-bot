export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type AgentId = string;

export type AgentProfile = {
  id: AgentId;
  name: string;
  initials: string;
  description: string;
  instructions: string;
  workspace: string;
  workspaceKind: "app" | "external" | string;
  workspaceTrusted: boolean;
  defaultModelKey: string;
  thinkingLevel: ThinkingLevel;
  archived: boolean;
  pinned: boolean;
};

export type AgentDraft = {
  name: string;
  initials?: string;
  description?: string;
};

export type PiModelOption = {
  key: string;
  id: string;
  name: string;
  provider: string;
  reasoning: boolean;
  contextWindow: number;
};

export type SessionSummary = {
  path: string;
  id: string;
  name: string;
  preview?: string;
  agentId: AgentId;
  workspace?: string;
  created?: string;
  modified?: string;
  latestResponseAt?: string;
  messageCount?: number;
};

export type ScheduledJobRecurrence = "once" | "daily" | "weekly" | "monthly";
export type ScheduledJobStatus = "active" | "paused";
export type ScheduledJobRunStatus = "running" | "succeeded" | "failed" | "missed";

export type ScheduledJob = {
  id: string;
  name: string;
  agentId: AgentId;
  workspace: string;
  workspaceTrusted: boolean;
  modelKey: string;
  thinkingLevel: ThinkingLevel;
  prompt: string;
  recurrence: ScheduledJobRecurrence;
  startAt: string;
  timeZone: string;
  status: ScheduledJobStatus;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: ScheduledJobRunStatus | null;
  lastError: string | null;
  lastSessionPath: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScheduledJobDraft = Pick<ScheduledJob, "name" | "agentId" | "modelKey" | "thinkingLevel" | "prompt" | "recurrence" | "startAt" | "timeZone">;

export type ProviderAuthMethod = "api_key" | "oauth";

export type ProviderInfo = {
  id: string;
  name: string;
  methods: ProviderAuthMethod[];
  configured: boolean;
  source?: string;
  label?: string;
};

export type AuthPrompt = {
  type: "text" | "secret" | "select" | "manual_code";
  message: string;
  placeholder?: string;
  options?: Array<{ id: string; label: string; description?: string }>;
};

export type PiConfig = {
  agentId: AgentId | null;
  workspace: string;
  workspaceKind: string;
  workspaceTrusted: boolean;
  model: string;
  modelKey: string;
  defaultModelKey: string;
  modelAvailable: boolean;
  provider: string;
  thinkingLevel: ThinkingLevel;
  availableThinkingLevels: ThinkingLevel[];
  streaming: boolean;
  context: {
    tokens: number | null;
    contextWindow: number;
    percent: number | null;
  };
  models: PiModelOption[];
  tools: string[];
  session: { path?: string; id?: string; name?: string } | null;
};

export type TimelineItem = {
  id: string;
  kind: "user" | "assistant" | "reasoning" | "tool" | "status";
  label: string;
  body: string;
  input?: string;
  status?: "running" | "done" | "failed";
  timestamp: string;
  timestampMs?: number;
};

export type WorkspaceFile = {
  path: string;
  kind: "file" | "folder";
};

export type WorkspacePanelTab = {
  id: string;
  kind: "files" | "browser";
  url?: string;
  title?: string;
};

export type WorkspacePanelPreferences = {
  tabs: WorkspacePanelTab[];
  activeTabId: string | null;
  open: boolean;
  width: number;
};

export type PiSetup = {
  required: boolean;
  canContinue: boolean;
  canImportPiAuth: boolean;
  piAuthPath: string;
  credentialStorage: "protected-app-file";
  providers: ProviderInfo[];
};

export type PiBootstrap = {
  config: PiConfig;
  transcript: TimelineItem[];
  sessions: SessionSummary[];
  sessionsByAgent: Record<AgentId, SessionSummary[]>;
  agents: AgentProfile[];
  setup: PiSetup;
  authenticated: boolean;
  activeAgentId: AgentId | null;
  scheduledJobs: ScheduledJob[];
  profile?: AgentProfile;
};

export type PiEvent =
  | { type: "assistant-delta"; delta: string }
  | { type: "reasoning-start"; id: string }
  | { type: "reasoning-delta"; id: string; delta: string }
  | { type: "reasoning-end"; id: string }
  | { type: "tool-start"; id: string; name: string; detail: string }
  | { type: "tool-update"; id: string; detail: string }
  | { type: "tool-end"; id: string; failed: boolean; detail: string }
  | { type: "agent-status"; agentId: AgentId; running: boolean }
  | { type: "compaction-start"; id: string; reason: "threshold" | "overflow" }
  | { type: "compaction-end"; id: string; failed: boolean; errorMessage?: string }
  | { type: "agent-start" }
  | { type: "agent-end"; retrying: boolean }
  | { type: "agent-settled" }
  | { type: "aborted" }
  | { type: "error"; message: string }
  | { type: "auth-prompt"; id: string; prompt: AuthPrompt }
  | { type: "auth-notify"; event: { type: string; message?: string; url?: string; instructions?: string; userCode?: string; verificationUri?: string } }
  | { type: "session-sync"; transcript: TimelineItem[]; sessions: SessionSummary[]; sessionsByAgent: Record<AgentId, SessionSummary[]>; config: PiConfig; agents: AgentProfile[]; setup: PiSetup; authenticated: boolean; activeAgentId: AgentId | null; scheduledJobs: ScheduledJob[] }
  | { type: "scheduled-jobs-sync"; scheduledJobs: ScheduledJob[] };

export type PiBotBridge = {
  reportRendererStage: (stage: string) => void;
  connect: () => Promise<PiBootstrap>;
  chooseFolder: (agentId?: AgentId | null) => Promise<PiBootstrap | null>;
  selectAgent: (agentId: AgentId) => Promise<PiBootstrap>;
  createAgent: (draft: AgentDraft) => Promise<PiBootstrap>;
  updateAgent: (profile: AgentProfile) => Promise<PiBootstrap>;
  archiveAgent: (agentId: AgentId, archived: boolean) => Promise<PiBootstrap>;
  deleteAgent: (agentId: AgentId, deleteWorkspace?: boolean) => Promise<PiBootstrap>;
  trustWorkspace: (agentId: AgentId) => Promise<PiBootstrap>;
  newSession: () => Promise<PiBootstrap>;
  openSession: (sessionPath: string, agentId: AgentId) => Promise<PiBootstrap>;
  openScheduledSession: (jobId: string) => Promise<PiBootstrap>;
  deleteSession: (sessionPath: string) => Promise<PiBootstrap>;
  getSessions: (agentId?: AgentId | null) => Promise<SessionSummary[]>;
  getScheduledJobs: () => Promise<ScheduledJob[]>;
  createScheduledJob: (draft: ScheduledJobDraft) => Promise<PiBootstrap>;
  updateScheduledJob: (id: string, draft: ScheduledJobDraft) => Promise<PiBootstrap>;
  setScheduledJobPaused: (id: string, paused: boolean) => Promise<PiBootstrap>;
  runScheduledJob: (id: string) => Promise<PiBootstrap>;
  deleteScheduledJob: (id: string) => Promise<PiBootstrap>;
  prompt: (message: string) => Promise<void>;
  abort: () => Promise<void>;
  completeSetup: (accepted: boolean) => Promise<PiBootstrap>;
  setAgentModel: (agentId: AgentId, key: string) => Promise<PiBootstrap>;
  setSessionModel: (agentId: AgentId, key: string) => Promise<PiBootstrap>;
  setThinkingLevel: (agentId: AgentId, level: ThinkingLevel) => Promise<PiBootstrap>;
  setProviderApiKey: (providerId: string, apiKey: string, accepted?: boolean) => Promise<PiBootstrap>;
  loginProvider: (providerId: string, type: ProviderAuthMethod, accepted?: boolean) => Promise<PiBootstrap>;
  logoutProvider: (providerId: string) => Promise<PiBootstrap>;
  importPiAuth: (accepted?: boolean) => Promise<PiBootstrap>;
  respondAuth: (promptId: string, value: string) => Promise<void>;
  cancelAuth: (promptId: string) => Promise<void>;
  getTheme: () => Promise<"dark" | "light">;
  saveTheme: (theme: "dark" | "light") => Promise<"dark" | "light">;
  getWorkspacePreferences: (key: string) => Promise<WorkspacePanelPreferences | null>;
  saveWorkspacePreferences: (key: string, preferences: WorkspacePanelPreferences) => Promise<WorkspacePanelPreferences>;
  listWorkspaceFiles: () => Promise<WorkspaceFile[]>;
  openWorkspaceFile: (path: string) => Promise<void>;
  revealWorkspaceFile: (path: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  onEvent: (listener: (event: PiEvent) => void) => () => void;
};

declare global {
  interface Window {
    piBot: PiBotBridge;
  }
}
