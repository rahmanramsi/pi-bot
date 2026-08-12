export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export type AgentId = string;

export type AgentProfile = {
  id: AgentId;
  name: string;
  initials: string;
  description: string;
  systemPrompt: string;
  builtIn: boolean;
  archived: boolean;
};

export type AgentDraft = {
  name: string;
  initials: string;
  description: string;
  systemPrompt: string;
  templateId?: AgentId;
};

export type PiModelOption = {
  key: string;
  id: string;
  name: string;
  provider: string;
};

export type SessionSummary = {
  path: string;
  id: string;
  name: string;
  agentId?: AgentId;
  created?: string;
  modified?: string;
  messageCount?: number;
};

export type PiConfig = {
  agentId: AgentId;
  workspace: string;
  model: string;
  modelKey: string;
  provider: string;
  thinkingLevel: ThinkingLevel;
  availableThinkingLevels: ThinkingLevel[];
  models: PiModelOption[];
  tools: string[];
  session: {
    path?: string;
    id?: string;
    name?: string;
  } | null;
};

export type TimelineItem = {
  id: string;
  kind: "user" | "assistant" | "tool" | "status";
  label: string;
  body: string;
  status?: "running" | "done" | "failed";
  timestamp: string;
};

export type PiBootstrap = {
  config: PiConfig;
  transcript: TimelineItem[];
  sessions: SessionSummary[];
  agents: AgentProfile[];
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
  | { type: "session-sync"; transcript: TimelineItem[]; sessions: SessionSummary[]; config: PiConfig; agents: AgentProfile[] };

export type PiBotBridge = {
  connect: () => Promise<PiBootstrap>;
  chooseFolder: () => Promise<PiBootstrap | null>;
  selectAgent: (agentId: AgentId) => Promise<PiBootstrap>;
  createAgent: (draft: AgentDraft) => Promise<PiBootstrap>;
  updateAgent: (agent: AgentProfile) => Promise<PiBootstrap>;
  duplicateAgent: (agentId: AgentId) => Promise<PiBootstrap>;
  archiveAgent: (agentId: AgentId, archived: boolean) => Promise<PiBootstrap>;
  deleteAgent: (agentId: AgentId) => Promise<PiBootstrap>;
  newSession: () => Promise<PiBootstrap>;
  openSession: (sessionPath: string) => Promise<PiBootstrap>;
  getSessions: () => Promise<SessionSummary[]>;
  prompt: (message: string) => Promise<void>;
  abort: () => Promise<void>;
  setModel: (key: string) => Promise<PiConfig>;
  setThinkingLevel: (level: ThinkingLevel) => Promise<PiConfig>;
  onEvent: (listener: (event: PiEvent) => void) => () => void;
};

declare global {
  interface Window {
    piBot: PiBotBridge;
  }
}
