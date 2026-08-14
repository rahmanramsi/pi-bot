export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type AgentId = string;

export type AgentProfile = {
  id: AgentId;
  name: string;
  initials: string;
  instructions: string;
  workspace: string;
  workspaceKind: "app" | "external" | string;
  workspaceTrusted: boolean;
  defaultModelKey: string;
  thinkingLevel: ThinkingLevel;
  archived: boolean;
};

export type AgentDraft = {
  name: string;
  initials?: string;
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
  agentId: AgentId;
  workspace?: string;
  created?: string;
  modified?: string;
  messageCount?: number;
};

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
  kind: "user" | "assistant" | "tool" | "status";
  label: string;
  body: string;
  input?: string;
  status?: "running" | "done" | "failed";
  timestamp: string;
};

export type PiSetup = {
  required: boolean;
  canImportPiAuth: boolean;
  piAuthPath: string;
  credentialStorage: "os-keychain" | "protected-app-file" | string;
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
  profile?: AgentProfile;
};

export type PiEvent =
  | { type: "assistant-delta"; delta: string }
  | { type: "tool-start"; id: string; name: string; detail: string }
  | { type: "tool-update"; id: string; detail: string }
  | { type: "tool-end"; id: string; failed: boolean; detail: string }
  | { type: "agent-start" }
  | { type: "agent-end"; retrying: boolean }
  | { type: "agent-settled" }
  | { type: "aborted" }
  | { type: "error"; message: string }
  | { type: "auth-prompt"; id: string; prompt: AuthPrompt }
  | { type: "auth-notify"; event: { type: string; message?: string; url?: string; instructions?: string; userCode?: string; verificationUri?: string } }
  | { type: "session-sync"; transcript: TimelineItem[]; sessions: SessionSummary[]; sessionsByAgent: Record<AgentId, SessionSummary[]>; config: PiConfig; agents: AgentProfile[]; setup: PiSetup; authenticated: boolean; activeAgentId: AgentId | null };

export type PiBotBridge = {
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
  deleteSession: (sessionPath: string) => Promise<PiBootstrap>;
  getSessions: (agentId?: AgentId | null) => Promise<SessionSummary[]>;
  prompt: (message: string) => Promise<void>;
  abort: () => Promise<void>;
  setAgentModel: (agentId: AgentId, key: string) => Promise<PiBootstrap>;
  setSessionModel: (agentId: AgentId, key: string) => Promise<PiBootstrap>;
  setThinkingLevel: (agentId: AgentId, level: ThinkingLevel) => Promise<PiBootstrap>;
  setProviderApiKey: (providerId: string, apiKey: string) => Promise<PiBootstrap>;
  loginProvider: (providerId: string, type: ProviderAuthMethod) => Promise<PiBootstrap>;
  logoutProvider: (providerId: string) => Promise<PiBootstrap>;
  importPiAuth: () => Promise<PiBootstrap>;
  respondAuth: (promptId: string, value: string) => Promise<void>;
  cancelAuth: (promptId: string) => Promise<void>;
  onEvent: (listener: (event: PiEvent) => void) => () => void;
};

declare global {
  interface Window {
    piBot: PiBotBridge;
  }
}
