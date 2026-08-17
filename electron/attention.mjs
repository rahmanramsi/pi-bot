export const ATTENTION_TYPES = ["question", "failed", "blocked"];
export const ATTENTION_TOOL_NAMES = ["pi_ask_user", "pi_report_blocked"];

const attentionTextSchema = {
  type: "string",
  minLength: 1,
  maxLength: 4000,
};

const questionToolParameters = {
  type: "object",
  properties: {
    question: { ...attentionTextSchema, description: "The exact information needed from the user." },
    details: { ...attentionTextSchema, description: "Why the answer is needed or what depends on it." },
  },
  required: ["question"],
  additionalProperties: false,
};

const blockedToolParameters = {
  type: "object",
  properties: {
    reason: { ...attentionTextSchema, description: "The dependency or condition that blocks the work." },
    details: { ...attentionTextSchema, description: "The concrete change needed before work can continue." },
  },
  required: ["reason"],
  additionalProperties: false,
};

export function cleanAttentionText(value, fallback = "Work needs your attention.") {
  if (typeof value !== "string") return fallback;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 4000) : fallback;
}

export function attentionSourceEventId(sessionId, event, fallback = "event") {
  if (typeof event?.sourceEventId === "string" && event.sourceEventId.trim()) return event.sourceEventId.trim();
  if (typeof event?.eventId === "string" && event.eventId.trim()) return event.eventId.trim();
  if (typeof event?.id === "string" && event.id.trim()) return event.id.trim();
  const message = event?.message;
  const marker = [
    event?.type ?? fallback,
    message?.timestamp ?? "",
    message?.stopReason ?? "",
    message?.errorMessage ?? "",
  ].join(":");
  return `${sessionId ?? "session"}:${marker}`;
}

export function mapExplicitAttentionEvent({ agentId = null, sessionId = null } = {}, event) {
  const type = event?.type === "attention" ? event.attentionType ?? event.kind : event?.type;
  if (!ATTENTION_TYPES.includes(type)) return null;
  const summary = cleanAttentionText(event.summary ?? event.reason ?? event.title, type === "question" ? "The agent is waiting for your answer." : type === "blocked" ? "The agent is blocked." : "The run ended with an error.");
  const details = cleanAttentionText(event.details ?? event.errorMessage ?? event.message, summary);
  return {
    agentId,
    sessionId,
    type,
    summary,
    details,
    sourceEventId: attentionSourceEventId(sessionId, event, type),
  };
}

export function mapFailedAttentionEvent({ agentId = null, sessionId = null } = {}, message, sourceEventId) {
  if (!message?.errorMessage || message.stopReason === "aborted") return null;
  return {
    agentId,
    sessionId,
    type: "failed",
    summary: "The run ended with an error.",
    details: cleanAttentionText(message.errorMessage),
    sourceEventId: sourceEventId || attentionSourceEventId(sessionId, { type: "turn_end", message }, "failure"),
  };
}

function attentionToolResult(item, type, sourceEventId) {
  return {
    content: [{ type: "text", text: `${type === "question" ? "Question" : "Blocked state"} recorded for the user.` }],
    details: { attentionId: item?.id ?? null, sourceEventId },
    terminate: true,
  };
}

export function createAttentionTools({ onAttention } = {}) {
  if (typeof onAttention !== "function") throw new Error("Attention tools require an event handler.");
  return [
    {
      name: "pi_ask_user",
      label: "Ask user",
      description: "Record an explicit question that needs the user's answer before work can continue. Use this only when you are waiting for information, not for ordinary narration.",
      promptSnippet: "Record a question that needs the user's answer",
      parameters: questionToolParameters,
      executionMode: "sequential",
      async execute(toolCallId, params) {
        const sourceEventId = `pi_ask_user:${toolCallId}`;
        const item = onAttention({
          type: "question",
          summary: params.question,
          details: params.details,
          sourceEventId,
        });
        return attentionToolResult(item, "question", sourceEventId);
      },
    },
    {
      name: "pi_report_blocked",
      label: "Report blocked",
      description: "Record an explicit blocked state when a documented dependency or condition prevents continuing. Do not use this for ordinary progress updates.",
      promptSnippet: "Record a documented dependency that blocks the work",
      parameters: blockedToolParameters,
      executionMode: "sequential",
      async execute(toolCallId, params) {
        const sourceEventId = `pi_report_blocked:${toolCallId}`;
        const item = onAttention({
          type: "blocked",
          summary: params.reason,
          details: params.details,
          sourceEventId,
        });
        return attentionToolResult(item, "blocked", sourceEventId);
      },
    },
  ];
}
