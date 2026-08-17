export function normalizeComposerSessionId(value) {
  return value === undefined || value === "" || value === "new" ? undefined : value;
}

export function validateComposerSessionToken(requestedSessionId, sessionId) {
  const requested = normalizeComposerSessionId(requestedSessionId);
  if (requested === undefined) return;
  if (typeof requested !== "string" || !requested || requested !== sessionId) {
    throw new Error("The conversation changed while the attachment was being prepared. Select the attachment again.");
  }
}

export function resolveOwnedComposerSession(requestedSessionId, findSession, owner) {
  const sessionId = normalizeComposerSessionId(requestedSessionId);
  if (sessionId === undefined) return undefined;
  const record = typeof findSession === "function" ? findSession(sessionId) : undefined;
  if (!record || record.agent_id !== owner?.agentId || record.workspace !== owner?.workspace) {
    throw new Error("The conversation changed while the attachment was being prepared. Select the attachment again.");
  }
  return sessionId;
}

export function resolvePendingAttachmentSession(requestedSessionId, attachmentId, requestedCleanupToken, findSession, listAttachments) {
  const sessionId = normalizeComposerSessionId(requestedSessionId);
  const record = typeof findSession === "function" && typeof sessionId === "string" ? findSession(sessionId) : undefined;
  const attachments = typeof listAttachments === "function" && typeof sessionId === "string" ? listAttachments(sessionId) : [];
  const pending = Array.isArray(attachments)
    ? attachments.find((attachment) => attachment?.id === attachmentId
      && attachment?.sessionId === sessionId
      && attachment?.status === "pending"
      && attachment?.cleanupToken === requestedCleanupToken)
    : undefined;
  if (!record || record.id !== sessionId || !pending || typeof requestedCleanupToken !== "string" || !requestedCleanupToken) {
    throw new Error("That attachment is no longer pending.");
  }
  return sessionId;
}

export async function invokePrompt(promptSession, text, images = []) {
  if (Array.isArray(images) && images.length > 0) return promptSession.prompt(text, { images });
  return promptSession.prompt(text);
}

export async function invokePromptAndMarkSent(promptSession, text, images, markSent) {
  await invokePrompt(promptSession, text, images);
  return markSent();
}
