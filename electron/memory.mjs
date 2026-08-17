import { randomUUID } from "node:crypto";
import {
  formatMemoryContext,
  normalizeMemoryWorkspace,
} from "./app-database.mjs";

export const memoryToolName = "memory";

const memoryToolParameters = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["list", "add", "update", "delete"] },
    id: { type: "string" },
    content: { type: "string" },
  },
  required: ["action"],
  additionalProperties: false,
};

export function memoryScopeForProfile(profile) {
  return {
    agentId: profile.id,
    workspace: normalizeMemoryWorkspace(profile.workspace),
  };
}

function memoryToolResult(text, details = {}) {
  return { content: [{ type: "text", text }], details };
}

export function createMemoryTool({ database, profile, sessionManager, idFactory = randomUUID }) {
  const scope = memoryScopeForProfile(profile);
  return {
    name: memoryToolName,
    label: "Memory",
    description: "List, add, update, or delete explicit persistent notes for this agent and workspace.",
    promptSnippet: "Manage explicit persistent memory notes for this agent and workspace",
    promptGuidelines: [
      "Use memory only for explicit user preferences, corrections, facts, or decisions worth keeping across chats.",
      "Do not store passwords, API keys, tokens, or other secrets.",
    ],
    parameters: memoryToolParameters,
    executionMode: "sequential",
    async execute(_toolCallId, params) {
      const action = params?.action;
      if (action === "list") {
        const memories = database.listMemories(scope.agentId, scope.workspace);
        if (memories.length === 0) return memoryToolResult("No saved memories for this agent and workspace.", { action, count: 0 });
        return memoryToolResult(memories.map((memory) => `${memory.id}: ${memory.content}`).join("\n"), { action, count: memories.length });
      }
      if (action === "add") {
        const memory = database.createMemory({
          id: idFactory(),
          agentId: scope.agentId,
          workspace: scope.workspace,
          content: params?.content,
          sourceSessionId: sessionManager?.getSessionId?.() ?? null,
        });
        return memoryToolResult(`Saved memory ${memory.id}.`, { action, memoryId: memory.id });
      }
      if (action === "update") {
        const memory = database.updateMemory(params?.id, {
          agentId: scope.agentId,
          workspace: scope.workspace,
          content: params?.content,
        });
        return memoryToolResult(`Updated memory ${memory.id}.`, { action, memoryId: memory.id });
      }
      if (action === "delete") {
        const deleted = database.deleteMemory(params?.id, scope.agentId, scope.workspace);
        if (!deleted) throw new Error("Memory was not found in this agent and workspace.");
        return memoryToolResult(`Deleted memory ${params.id}.`, { action, memoryId: params.id });
      }
      throw new Error("Memory action must be list, add, update, or delete.");
    },
  };
}

export function createMemoryContextExtension({ database, profile }) {
  const scope = memoryScopeForProfile(profile);
  return (pi) => {
    pi.on("before_agent_start", (event) => ({
      systemPrompt: `${event.systemPrompt}\n\n${formatMemoryContext(database.listMemories(scope.agentId, scope.workspace))}`,
    }));
  };
}
