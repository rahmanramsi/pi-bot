import { FileText, Folder, LoaderCircle, RefreshCw } from "lucide-react";
import { motion, motionTransitions } from "@/lib/motion";
import type { WorkspaceFile } from "@/types";

type WorkspaceMentionMenuProps = {
  readonly items: readonly WorkspaceFile[];
  readonly loading: boolean;
  readonly error?: string;
  readonly activeIndex: number;
  readonly onSelect: (file: WorkspaceFile) => void;
  readonly onRefresh: () => void;
};

function fileName(path: string) {
  return path.split("/").at(-1) ?? path;
}

function fileDepth(path: string) {
  return Math.max(0, path.split("/").length - 1);
}

export function WorkspaceMentionMenu({ items, loading, error, activeIndex, onSelect, onRefresh }: WorkspaceMentionMenuProps) {
  return (
    <motion.div
      className="composer-mention-menu"
      id="composer-mention-listbox"
      role="listbox"
      aria-label="Workspace files and folders"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={motionTransitions.micro}
      data-motion="composer-mention-menu"
    >
      <div className="composer-mention-heading">
        <div>
          <strong>Mention workspace item</strong>
          <span>Files and folders from the active workspace</span>
        </div>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onRefresh} aria-label="Refresh workspace items" title="Refresh workspace items">
          <RefreshCw className={loading ? "spin" : ""} />
        </button>
      </div>
      {loading ? (
        <div className="composer-mention-status"><LoaderCircle className="spin" /><span>Loading workspace items…</span></div>
      ) : error ? (
        <div className="composer-mention-status composer-mention-error"><span>{error}</span></div>
      ) : items.length > 0 ? (
        <div className="composer-mention-options">
          {items.map((file, index) => {
            const isFolder = file.kind === "folder";
            return (
              <button
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                id={`composer-mention-option-${index}`}
                className={`composer-mention-option ${index === activeIndex ? "active" : ""}`}
                style={{ paddingLeft: 10 + Math.min(fileDepth(file.path), 4) * 12 }}
                key={`${file.kind}:${file.path}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onSelect(file)}
                aria-label={`${isFolder ? "Folder" : "File"} ${file.path}`}
                title={file.path}
              >
                {isFolder ? <Folder /> : <FileText />}
                <span className="composer-mention-name">{fileName(file.path)}</span>
                <span className="composer-mention-path">{file.path}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="composer-mention-status"><span>No matching files or folders.</span></div>
      )}
      <div className="composer-mention-hint">↑↓ navigate · Enter select · Esc close</div>
    </motion.div>
  );
}
