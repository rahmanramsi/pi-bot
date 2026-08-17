import path from "node:path";

export const COMPOSER_CONTEXT_VERSION = 1;
export const COMPOSER_CONTEXT_START = "--- PI BOT SELECTED CONTEXT START ---";
export const COMPOSER_CONTEXT_END = "--- PI BOT SELECTED CONTEXT END ---";

function clean(value) {
  return typeof value === "string" ? value.replace(/[\u0000\r\n]/g, " ").trim() : "";
}

function json(value) {
  return JSON.stringify(value);
}

export function normalizeWorkspaceMention(value) {
  if (!value || typeof value !== "object" || value.kind !== "file" && value.kind !== "folder" || typeof value.path !== "string") return null;
  const normalized = value.path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/{2,}/g, "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").includes("..")) return null;
  return { kind: value.kind, path: normalized.replace(/\/$/, "") };
}

export function resolveWorkspaceMention(value, listed, resolvePath) {
  if (value?.type !== "file" && value?.type !== "folder") throw new Error("Invalid workspace mention.");
  const mention = normalizeWorkspaceMention({ path: value?.path, kind: value.type });
  if (!mention) throw new Error("Invalid workspace mention.");
  const listedEntry = (Array.isArray(listed) ? listed : []).find((entry) => {
    const listedMention = normalizeWorkspaceMention({ path: entry?.path, kind: entry?.kind });
    return listedMention?.path === mention.path && listedMention.kind === mention.kind;
  });
  if (!listedEntry) throw new Error(`Workspace mention “${mention.path}” is no longer available.`);
  const resolved = typeof resolvePath === "function" ? resolvePath(mention.path) : null;
  if (!resolved || resolved.kind !== mention.kind) throw new Error(`Workspace mention “${mention.path}” changed type or is outside the workspace.`);
  return mention;
}

export function normalizeSkillMention(value) {
  if (!value || typeof value !== "object" || value.kind !== "skill") return null;
  const id = clean(value.id || value.skillId);
  return id ? { kind: "skill", id } : null;
}

export function trustedSkillOptions(trusted, skills) {
  if (trusted !== true) return [];
  return (Array.isArray(skills) ? skills : [])
    .filter((skill) => skill && typeof skill.name === "string" && skill.name.trim())
    .map((skill) => ({ id: skill.name, name: skill.name, description: typeof skill.description === "string" ? skill.description : "" }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function contextHasSelection(context) {
  return Boolean(context?.attachments?.length || context?.workspace?.length || context?.skills?.length);
}

function safeAttachmentName(value) {
  return clean(value).slice(0, 240) || "attachment";
}

function safeAttachmentContent(value) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replaceAll(COMPOSER_CONTEXT_START, "[PI BOT CONTEXT START]")
    .replaceAll(COMPOSER_CONTEXT_END, "[PI BOT CONTEXT END]");
}

export function buildPromptContext(originalText, context = {}) {
  const text = String(originalText ?? "");
  const attachments = (Array.isArray(context.attachments) ? context.attachments : []).map((item) => ({
    id: clean(item.id),
    name: safeAttachmentName(item.name),
    mimeType: clean(item.mimeType),
    kind: item.kind === "image" ? "image" : "text",
    size: Number.isFinite(item.size) ? item.size : 0,
  }));
  const workspace = (Array.isArray(context.workspace) ? context.workspace : []).map(normalizeWorkspaceMention).filter(Boolean);
  const skills = (Array.isArray(context.skills) ? context.skills : []).map(normalizeSkillMention).filter(Boolean);
  if (attachments.length === 0 && workspace.length === 0 && skills.length === 0) {
    return { text, hasContext: false, audit: null, images: [] };
  }

  const audit = {
    version: COMPOSER_CONTEXT_VERSION,
    attachments,
    workspace,
    skills,
  };
  const lines = [
    COMPOSER_CONTEXT_START,
    `version=${COMPOSER_CONTEXT_VERSION}`,
    `attachments=${json(attachments)}`,
    `workspace=${json(workspace)}`,
    `skills=${json(skills)}`,
  ];
  for (const item of attachments) {
    if (item.kind !== "text") continue;
    const source = context.attachments.find((candidate) => candidate?.id === item.id);
    lines.push(`attachment-content id=${json(item.id)} name=${json(item.name)} begin`);
    lines.push(safeAttachmentContent(source?.data));
    lines.push(`attachment-content id=${json(item.id)} end`);
  }
  for (const item of skills) lines.push(`Use the available skill ${json(item.id)} for this request.`);
  lines.push(COMPOSER_CONTEXT_END);
  return {
    text: `${text}\n\n${lines.join("\n")}`,
    hasContext: true,
    audit,
    images: (context.attachments ?? [])
      .filter((item) => item?.kind === "image" && typeof item.data === "string")
      .map((item) => ({ type: "image", data: item.data, mimeType: item.mimeType })),
  };
}

export function contextAuditBody(audit) {
  if (!audit || typeof audit !== "object") return "Prompt context selected.";
  const attachments = Array.isArray(audit.attachments) ? audit.attachments.length : 0;
  const workspace = Array.isArray(audit.workspace) ? audit.workspace.length : 0;
  const skills = Array.isArray(audit.skills) ? audit.skills.length : 0;
  const parts = [];
  if (attachments) parts.push(`${attachments} attachment${attachments === 1 ? "" : "s"}`);
  if (workspace) parts.push(`${workspace} workspace reference${workspace === 1 ? "" : "s"}`);
  if (skills) parts.push(`${skills} skill${skills === 1 ? "" : "s"}`);
  return `Selected ${parts.join(", ")}.`;
}

export function mentionDisplayText(mention) {
  if (mention?.kind === "workspace") return `@${mention.path}${mention.type === "folder" || mention.kind === "folder" ? "/" : ""}`;
  if (mention?.kind === "skill") return `@skill:${mention.id}`;
  return "";
}

export function normalizeWorkspacePath(value) {
  const normalized = normalizeWorkspaceMention({ path: value, kind: "file" });
  return normalized ? path.posix.normalize(normalized.path) : null;
}
