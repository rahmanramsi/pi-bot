export function thinkingText(content) {
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => part?.type === "thinking" ? part.thinking : "")
    .filter(Boolean)
    .join("\n\n");
}

export function reasoningId(message) {
  return `reasoning-${message?.timestamp ?? "unknown"}`;
}
