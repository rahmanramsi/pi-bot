import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

export const ATTACHMENT_MANIFEST_VERSION = 1;
export const MAX_ATTACHMENTS_PER_SESSION = 8;
export const MAX_TEXT_ATTACHMENT_BYTES = 64 * 1024;
export const MAX_TOTAL_TEXT_CONTEXT_BYTES = 128 * 1024;
export const MAX_IMAGE_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const textExtensions = new Set([
  ".c", ".cc", ".cpp", ".css", ".csv", ".env", ".go", ".h", ".hpp", ".html", ".ini", ".java", ".js", ".jsx",
  ".json", ".jsx", ".log", ".md", ".mjs", ".php", ".py", ".rb", ".rs", ".sh", ".sql", ".svg", ".svelte", ".toml",
  ".ts", ".tsx", ".txt", ".vue", ".xml", ".yaml", ".yml",
]);

const imageMimeBySignature = [
  { mimeType: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mimeType: "image/gif", bytes: [0x47, 0x49, 0x46] },
  { mimeType: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50] },
];

function startsWithBytes(buffer, bytes) {
  return bytes.every((byte, index) => byte === 0 || buffer[index] === byte);
}

export function detectAttachmentImageMime(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  for (const candidate of imageMimeBySignature) {
    if (bytes.length >= candidate.bytes.length && startsWithBytes(bytes, candidate.bytes)) return candidate.mimeType;
  }
  return null;
}

function safeName(value) {
  const name = typeof value === "string" ? path.basename(value).trim() : "attachment";
  return name.replace(/[\u0000-\u001f\u007f]/g, "_").slice(0, 240) || "attachment";
}

function extensionFor(name) {
  const base = path.basename(name).toLocaleLowerCase();
  if (base.startsWith(".") && !base.slice(1).includes(".")) return base;
  return path.extname(base);
}

function isTextMime(mimeType) {
  return typeof mimeType === "string" && (mimeType.toLocaleLowerCase().startsWith("text/") || [
    "application/json", "application/javascript", "application/xml", "application/x-javascript", "application/x-sh",
  ].includes(mimeType.toLocaleLowerCase()));
}

function sizeLimitFor(name, mimeType) {
  return isTextMime(mimeType) || textExtensions.has(extensionFor(name))
    ? MAX_TEXT_ATTACHMENT_BYTES
    : MAX_IMAGE_ATTACHMENT_BYTES;
}

function probeImageMime(sourcePath) {
  let descriptor;
  try {
    descriptor = openSync(sourcePath, "r");
    const probe = Buffer.alloc(12);
    const bytesRead = readSync(descriptor, probe, 0, probe.length, 0);
    return detectAttachmentImageMime(probe.subarray(0, bytesRead));
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function isSupportedTextAttachment(name, mimeType, buffer) {
  const extension = extensionFor(name);
  if (!isTextMime(mimeType) && !textExtensions.has(extension)) return false;
  try {
    return !new TextDecoder("utf-8", { fatal: true }).decode(buffer).includes("\u0000");
  } catch {
    return false;
  }
}

function attachmentError(message) {
  return new Error(`Attachment rejected: ${message}`);
}

function sessionPath(root, sessionId) {
  if (typeof sessionId !== "string" || !sessionId.trim() || sessionId.includes("..") || sessionId.includes("/") || sessionId.includes("\\")) {
    throw new Error("A valid session is required before adding an attachment.");
  }
  return path.join(root, sessionId);
}

function sessionDirectory(root, sessionId) {
  const directory = sessionPath(root, sessionId);
  try {
    const stats = lstatSync(directory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error("Attachment session storage is not an app-owned directory.");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return directory;
}

function manifestPath(root, sessionId) {
  return path.join(sessionDirectory(root, sessionId), "manifest.json");
}

function readManifest(root, sessionId) {
  const file = manifestPath(root, sessionId);
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (parsed?.version !== ATTACHMENT_MANIFEST_VERSION || !Array.isArray(parsed.attachments)) return [];
    return parsed.attachments.filter((item) => item
      && typeof item.id === "string"
      && typeof item.name === "string"
      && typeof item.stagedPath === "string"
      && (item.status === "sent" || (item.status === "pending" && typeof item.cleanupToken === "string" && item.cleanupToken)));
  } catch {
    return [];
  }
}

function writeManifest(root, sessionId, attachments) {
  const directory = sessionDirectory(root, sessionId);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const target = manifestPath(root, sessionId);
  const temporary = `${target}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify({ version: ATTACHMENT_MANIFEST_VERSION, attachments }, null, 2), { mode: 0o600 });
  renameSync(temporary, target);
}

function validateStoredAttachment(root, sessionId, item) {
  const directory = sessionDirectory(root, sessionId);
  const stagedPath = path.resolve(item.stagedPath);
  const relative = path.relative(directory, stagedPath);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
  try {
    return lstatSync(stagedPath).isFile();
  } catch {
    return false;
  }
}

function normalizeAttachment(item, sessionId) {
  const metadata = {
    id: item.id,
    sessionId,
    name: item.name,
    mimeType: item.mimeType,
    kind: item.kind,
    size: item.size,
    status: item.status,
    createdAt: item.createdAt,
    sentAt: item.sentAt ?? null,
  };
  if (item.status === "pending" && typeof item.cleanupToken === "string" && item.cleanupToken) metadata.cleanupToken = item.cleanupToken;
  return metadata;
}

function cleanupToken() {
  return randomBytes(32).toString("base64url");
}

function sourceBuffer(input) {
  if (typeof input?.sourcePath === "string" && input.sourcePath.trim()) {
    const sourcePath = path.resolve(input.sourcePath);
    const sourceName = safeName(input.name || sourcePath);
    const requestedMimeType = typeof input?.mimeType === "string" ? input.mimeType.toLocaleLowerCase() : "";
    let stats;
    try {
      stats = statSync(sourcePath);
    } catch {
      throw attachmentError("the selected file could not be read.");
    }
    if (!stats.isFile()) throw attachmentError("folders cannot be attached.");
    const limit = probeImageMime(sourcePath) ? MAX_IMAGE_ATTACHMENT_BYTES : sizeLimitFor(sourceName, requestedMimeType);
    if (stats.size > limit) {
      const label = limit === MAX_TEXT_ATTACHMENT_BYTES ? "text files" : "images";
      throw attachmentError(`${label} must be ${limit} bytes or smaller.`);
    }
    try {
      return { buffer: readFileSync(sourcePath), sourcePath, sourceName };
    } catch {
      throw attachmentError("the selected file could not be read.");
    }
  }
  if (input?.data instanceof ArrayBuffer || ArrayBuffer.isView(input?.data)) {
    const buffer = Buffer.from(input.data.buffer ?? input.data, input.data.byteOffset ?? 0, input.data.byteLength);
    return { buffer, sourcePath: null, sourceName: safeName(input.name) };
  }
  throw attachmentError("no file data was provided.");
}

export function validateAttachmentInput(input) {
  const source = sourceBuffer(input);
  if (source.buffer.length === 0) throw attachmentError("empty files are not supported.");
  const imageMimeType = detectAttachmentImageMime(source.buffer);
  if (imageMimeType) {
    if (source.buffer.length > MAX_IMAGE_ATTACHMENT_BYTES) throw attachmentError(`images must be ${MAX_IMAGE_ATTACHMENT_BYTES} bytes or smaller.`);
    return { ...source, mimeType: imageMimeType, kind: "image" };
  }
  const requestedMimeType = typeof input?.mimeType === "string" ? input.mimeType.toLocaleLowerCase() : "";
  if (!isSupportedTextAttachment(source.sourceName, requestedMimeType, source.buffer)) {
    throw attachmentError("only UTF-8 text files and PNG, JPEG, GIF, or WebP images are supported.");
  }
  if (source.buffer.length > MAX_TEXT_ATTACHMENT_BYTES) throw attachmentError(`text files must be ${MAX_TEXT_ATTACHMENT_BYTES} bytes or smaller.`);
  return { ...source, mimeType: requestedMimeType || "text/plain", kind: "text" };
}

export class AttachmentStore {
  constructor(root) {
    this.root = path.resolve(root);
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
  }

  list(sessionId) {
    let attachments;
    try {
      attachments = readManifest(this.root, sessionId).filter((item) => validateStoredAttachment(this.root, sessionId, item));
    } catch {
      return [];
    }
    return attachments.map((item) => normalizeAttachment(item, sessionId));
  }

  stage(sessionId, input) {
    const existing = readManifest(this.root, sessionId);
    if (existing.length >= MAX_ATTACHMENTS_PER_SESSION) throw attachmentError(`a session can contain at most ${MAX_ATTACHMENTS_PER_SESSION} attachments.`);
    const validated = validateAttachmentInput(input);
    const id = randomUUID();
    const name = safeName(validated.sourceName);
    const directory = sessionDirectory(this.root, sessionId);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const stagedPath = path.join(directory, `${id}-${name}`);
    try {
      writeFileSync(stagedPath, validated.buffer, { mode: 0o600 });
      const item = {
        id,
        name,
        mimeType: validated.mimeType,
        kind: validated.kind,
        size: validated.buffer.length,
        status: "pending",
        cleanupToken: cleanupToken(),
        stagedPath,
        createdAt: new Date().toISOString(),
        sentAt: null,
      };
      writeManifest(this.root, sessionId, [...existing, item]);
      return normalizeAttachment(item, sessionId);
    } catch (error) {
      rmSync(stagedPath, { force: true });
      if (error instanceof Error && error.message.startsWith("Attachment rejected:")) throw error;
      throw attachmentError("the file could not be staged in Pi Bot's app storage.");
    }
  }

  stageMany(sessionId, inputs) {
    if (!Array.isArray(inputs) || inputs.length === 0) return [];
    const staged = [];
    try {
      for (const input of inputs) staged.push(this.stage(sessionId, input));
      return staged;
    } catch (error) {
      for (const item of staged) this.remove(sessionId, item.id, item.cleanupToken);
      throw error;
    }
  }

  remove(sessionId, attachmentId, requestedCleanupToken) {
    const attachments = readManifest(this.root, sessionId);
    const item = attachments.find((entry) => entry.id === attachmentId);
    if (!item) throw new Error("That attachment is no longer pending.");
    if (item.status !== "pending") throw new Error("Sent attachments cannot be removed from the conversation.");
    if (typeof requestedCleanupToken !== "string" || !requestedCleanupToken || item.cleanupToken !== requestedCleanupToken) throw new Error("That attachment is no longer pending.");
    if (!validateStoredAttachment(this.root, sessionId, item)) throw new Error("That attachment is missing from Pi Bot's app storage. Remove it and attach the file again.");
    rmSync(item.stagedPath, { force: true });
    const next = attachments.filter((entry) => entry.id !== attachmentId);
    if (next.length > 0) writeManifest(this.root, sessionId, next);
    else rmSync(sessionDirectory(this.root, sessionId), { recursive: true, force: true });
    return true;
  }

  markSent(sessionId, ids) {
    const wanted = new Set(Array.isArray(ids) ? ids : []);
    if (wanted.size === 0) return [];
    const attachments = readManifest(this.root, sessionId);
    const sentAt = new Date().toISOString();
    const next = attachments.map((item) => {
      if (!wanted.has(item.id)) return item;
      const { cleanupToken: _cleanupToken, ...sent } = item;
      return { ...sent, status: "sent", sentAt };
    });
    writeManifest(this.root, sessionId, next);
    return next.filter((item) => wanted.has(item.id)).map((item) => normalizeAttachment(item, sessionId));
  }

  prepare(sessionId, ids) {
    const requested = Array.isArray(ids) ? ids : [];
    if (requested.length === 0) return [];
    if (new Set(requested).size !== requested.length) throw new Error("The same attachment was selected more than once.");
    const attachments = readManifest(this.root, sessionId);
    const prepared = [];
    let textBytes = 0;
    for (const id of requested) {
      const item = attachments.find((entry) => entry.id === id);
      if (!item || !validateStoredAttachment(this.root, sessionId, item)) throw new Error(`Attachment ${id} is missing from Pi Bot's app storage. Remove it and attach the file again.`);
      if (item.status !== "pending") throw new Error(`Attachment “${item.name}” was already sent.`);
      let data;
      try {
        data = readFileSync(item.stagedPath);
      } catch {
        throw new Error(`Attachment “${item.name}” could not be read from Pi Bot's app storage.`);
      }
      let validated;
      try {
        validated = validateAttachmentInput({ name: item.name, mimeType: item.mimeType, data });
      } catch {
        throw new Error(`Attachment “${item.name}” is no longer a supported file in Pi Bot's app storage.`);
      }
      if (validated.kind !== item.kind || validated.mimeType !== item.mimeType || validated.buffer.length !== item.size) {
        throw new Error(`Attachment “${item.name}” changed in Pi Bot's app storage. Remove it and attach the file again.`);
      }
      if (item.kind === "text") {
        if (data.length > MAX_TEXT_ATTACHMENT_BYTES) throw new Error(`Attachment “${item.name}” is too large to send.`);
        textBytes += data.length;
        if (textBytes > MAX_TOTAL_TEXT_CONTEXT_BYTES) throw new Error(`Selected text attachments exceed the ${MAX_TOTAL_TEXT_CONTEXT_BYTES}-byte context budget.`);
        try {
          data = new TextDecoder("utf-8", { fatal: true }).decode(data);
        } catch {
          throw new Error(`Attachment “${item.name}” is no longer valid UTF-8 text.`);
        }
      }
      prepared.push({ ...normalizeAttachment(item, sessionId), data });
    }
    return prepared;
  }

  cleanupSession(sessionId) {
    rmSync(sessionPath(this.root, sessionId), { recursive: true, force: true });
  }

  cleanupMissingManifests() {
    if (!existsSync(this.root)) return;
    for (const entry of readdirSync(this.root, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || (entry.isDirectory() && !existsSync(path.join(this.root, entry.name, "manifest.json")))) rmSync(path.join(this.root, entry.name), { recursive: true, force: true });
    }
  }

  cleanupOrphanedSessions(sessionIds) {
    if (!existsSync(this.root)) return;
    const valid = new Set(Array.isArray(sessionIds) ? sessionIds.filter((id) => typeof id === "string" && id) : []);
    for (const entry of readdirSync(this.root, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) {
        rmSync(path.join(this.root, entry.name), { recursive: true, force: true });
        continue;
      }
      if (!entry.isDirectory() || valid.has(entry.name)) continue;
      rmSync(path.join(this.root, entry.name), { recursive: true, force: true });
    }
  }
}

export function attachmentMetadata(attachments) {
  return (Array.isArray(attachments) ? attachments : []).map((item) => ({
    id: item.id,
    name: item.name,
    mimeType: item.mimeType,
    kind: item.kind,
    size: item.size,
  }));
}
