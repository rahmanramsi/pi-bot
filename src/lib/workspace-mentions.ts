import type { WorkspaceFile } from "@/types";

export type MentionRange = {
  readonly start: number;
  readonly end: number;
  readonly query: string;
};

export type MentionInsertion = {
  readonly value: string;
  readonly cursor: number;
};

const mentionBoundary = /[\s([{]/;

export function findWorkspaceMention(value: string, cursor: number): MentionRange | null {
  const safeCursor = Math.max(0, Math.min(cursor, value.length));
  const beforeCursor = value.slice(0, safeCursor);
  const start = beforeCursor.lastIndexOf("@");
  if (start < 0) return null;

  const preceding = beforeCursor[start - 1];
  if (preceding !== undefined && !mentionBoundary.test(preceding)) return null;

  const query = beforeCursor.slice(start + 1);
  if (/[\s\r\n]/.test(query)) return null;

  return { start, end: safeCursor, query };
}

export function matchingWorkspaceFiles(files: readonly WorkspaceFile[], query: string, limit = 8): WorkspaceFile[] {
  const normalizedQuery = query.toLocaleLowerCase();
  return files
    .filter((file) => file.path.toLocaleLowerCase().includes(normalizedQuery))
    .slice(0, limit);
}

export function insertWorkspaceMention(value: string, range: MentionRange, path: string): MentionInsertion {
  const insertion = `@${path} `;
  const before = value.slice(0, range.start);
  const after = value.slice(range.end);
  return { value: `${before}${insertion}${after}`, cursor: before.length + insertion.length };
}
