"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
} from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import {
  Children,
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface FileTreeContextType {
  expandedPaths: Set<string>;
  togglePath: (path: string) => void;
  focusedPath?: string;
  focusPath: (path: string) => void;
  selectedPath?: string;
  onSelect?: (path: string) => void;
}

// Default noop for context default value
// oxlint-disable-next-line eslint(no-empty-function)
const noop = () => {};

const FileTreeContext = createContext<FileTreeContextType>({
  // oxlint-disable-next-line eslint-plugin-unicorn(no-new-builtin)
  expandedPaths: new Set(),
  togglePath: noop,
  focusPath: noop,
});

const treeItemSelector = '[role="treeitem"][data-file-tree-path]';

function itemPath(item: Element) {
  return item.getAttribute("data-file-tree-path") ?? "";
}

function parentTreeItem(item: Element) {
  return item.parentElement?.closest<HTMLElement>(treeItemSelector) ?? null;
}

function directChildTreeItem(item: Element, parent: Element) {
  return parentTreeItem(item) === parent;
}

export type FileTreeProps = Omit<HTMLAttributes<HTMLDivElement>, "onSelect"> & {
  expanded?: Set<string>;
  defaultExpanded?: Set<string>;
  selectedPath?: string;
  onSelect?: (path: string) => void;
  onExpandedChange?: (expanded: Set<string>) => void;
};

export const FileTree = ({
  expanded: controlledExpanded,
  defaultExpanded = new Set(),
  selectedPath,
  onSelect,
  onExpandedChange,
  className,
  children,
  ...props
}: FileTreeProps) => {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const expandedPaths = controlledExpanded ?? internalExpanded;
  const [focusedPath, setFocusedPath] = useState<string>();
  const treeRef = useRef<HTMLDivElement>(null);

  const togglePath = useCallback(
    (path: string) => {
      const newExpanded = new Set(expandedPaths);
      if (newExpanded.has(path)) {
        newExpanded.delete(path);
      } else {
        newExpanded.add(path);
      }
      setInternalExpanded(newExpanded);
      onExpandedChange?.(newExpanded);
    },
    [expandedPaths, onExpandedChange]
  );

  const visibleItems = useCallback(() => {
    const items = [...(treeRef.current?.querySelectorAll<HTMLElement>(treeItemSelector) ?? [])];
    return items.filter((item) => {
      let parent = parentTreeItem(item);
      while (parent) {
        if (parent.getAttribute("aria-expanded") === "false") return false;
        parent = parentTreeItem(parent);
      }
      return true;
    });
  }, []);

  const focusPath = useCallback((path: string) => {
    setFocusedPath(path);
    const item = visibleItems().find((candidate) => itemPath(candidate) === path);
    item?.focus();
  }, [visibleItems]);

  const focusFirstChild = useCallback((parent: Element) => {
    const child = visibleItems().find((candidate) => directChildTreeItem(candidate, parent));
    if (!child) return false;
    focusPath(itemPath(child));
    return true;
  }, [focusPath, visibleItems]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as Element | null;
    const item = target?.closest<HTMLElement>(treeItemSelector);
    if (!item || !treeRef.current?.contains(item)) return;
    const items = visibleItems();
    const index = items.indexOf(item);
    if (index < 0) return;
    const path = itemPath(item);
    const isFolder = item.getAttribute("data-file-tree-kind") === "folder";
    const isExpanded = item.getAttribute("aria-expanded") === "true";
    const parent = parentTreeItem(item);

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex = event.key === "ArrowDown" ? Math.min(items.length - 1, index + 1) : Math.max(0, index - 1);
      focusPath(itemPath(items[nextIndex]));
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusPath(itemPath(event.key === "Home" ? items[0] : items.at(-1)!));
      return;
    }
    if (event.key === "ArrowRight") {
      if (!isFolder) return;
      event.preventDefault();
      if (!isExpanded) {
        togglePath(path);
      } else {
        focusFirstChild(item);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (isFolder && isExpanded) togglePath(path);
      else if (parent) focusPath(itemPath(parent));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect?.(path);
    }
  }, [focusFirstChild, focusPath, onSelect, togglePath, visibleItems]);

  useLayoutEffect(() => {
    const items = visibleItems();
    if (items.length === 0) return;
    const active = items.find((item) => itemPath(item) === focusedPath);
    const nextPath = itemPath(active ?? items[0]);
    if (nextPath !== focusedPath) setFocusedPath(nextPath);
    items.forEach((item) => { item.tabIndex = itemPath(item) === nextPath ? 0 : -1; });
  }, [children, expandedPaths, focusedPath, focusFirstChild, visibleItems]);

  const contextValue = useMemo(
    () => ({ expandedPaths, focusedPath, focusPath, onSelect, selectedPath, togglePath }),
    [expandedPaths, focusedPath, focusPath, onSelect, selectedPath, togglePath]
  );

  return (
    <FileTreeContext.Provider value={contextValue}>
      <div
        className={cn(
          "rounded-lg border bg-background font-mono text-sm",
          className
        )}
        role="tree"
        ref={treeRef}
        onKeyDown={handleKeyDown}
        {...props}
      >
        <div className="p-2">{children}</div>
      </div>
    </FileTreeContext.Provider>
  );
};

export type FileTreeIconProps = HTMLAttributes<HTMLSpanElement>;

export const FileTreeIcon = ({
  className,
  children,
  ...props
}: FileTreeIconProps) => (
  <span className={cn("shrink-0", className)} {...props}>
    {children}
  </span>
);

export type FileTreeNameProps = HTMLAttributes<HTMLSpanElement>;

export const FileTreeName = ({
  className,
  children,
  ...props
}: FileTreeNameProps) => (
  <span className={cn("truncate", className)} {...props}>
    {children}
  </span>
);

interface FileTreeFolderContextType {
  path: string;
  name: string;
  isExpanded: boolean;
}

const FileTreeFolderContext = createContext<FileTreeFolderContextType>({
  isExpanded: false,
  name: "",
  path: "",
});

export type FileTreeFolderProps = HTMLAttributes<HTMLDivElement> & {
  path: string;
  name: string;
  icon?: ReactNode;
};

export const FileTreeFolder = ({
  path,
  name,
  icon,
  className,
  children,
  ...props
}: FileTreeFolderProps) => {
  const { expandedPaths, focusPath, focusedPath, togglePath, selectedPath, onSelect } =
    useContext(FileTreeContext);
  const isExpanded = expandedPaths.has(path);
  const isSelected = selectedPath === path;
  const isFocused = focusedPath === path;

  const handleOpenChange = useCallback(() => {
    togglePath(path);
  }, [togglePath, path]);

  const handleSelect = useCallback(() => {
    focusPath(path);
    onSelect?.(path);
  }, [focusPath, onSelect, path]);

  const folderContextValue = useMemo(
    () => ({ isExpanded, name, path }),
    [isExpanded, name, path]
  );

  return (
    <FileTreeFolderContext.Provider value={folderContextValue}>
      <Collapsible onOpenChange={handleOpenChange} open={isExpanded}>
        <div
          className={cn("", className)}
          role="treeitem"
          tabIndex={isFocused ? 0 : -1}
          aria-expanded={isExpanded}
          aria-selected={isSelected}
          data-file-tree-path={path}
          data-file-tree-kind="folder"
          data-file-tree-has-children={Children.count(children) > 0}
          onFocus={(event) => { if (event.target === event.currentTarget) focusPath(path); }}
          {...props}
        >
          <div
            className={cn(
              "flex w-full items-center gap-1 rounded px-2 py-1 text-left transition-colors hover:bg-muted/50",
              isSelected && "bg-muted"
            )}
          >
            <CollapsibleTrigger nativeButton={false} render={<span aria-label={isExpanded ? `Collapse ${name}` : `Expand ${name}`} className="flex shrink-0 cursor-pointer items-center border-none bg-transparent p-0" onPointerDown={() => focusPath(path)} tabIndex={-1} />}><ChevronRightIcon
                                        className={cn(
                                          "size-4 shrink-0 text-muted-foreground transition-transform",
                                          isExpanded && "rotate-90"
                                        )}
                                      /></CollapsibleTrigger>
            <button
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-left"
              onClick={handleSelect}
              tabIndex={-1}
              type="button"
            >
              <FileTreeIcon>
                {icon ?? (isExpanded ? (
                  <FolderOpenIcon className="size-4 text-blue-500" />
                ) : (
                  <FolderIcon className="size-4 text-blue-500" />
                ))}
              </FileTreeIcon>
              <FileTreeName>{name}</FileTreeName>
            </button>
          </div>
          <CollapsibleContent>
            <div className="ml-4 border-l pl-2" role="group">{children}</div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </FileTreeFolderContext.Provider>
  );
};

interface FileTreeFileContextType {
  path: string;
  name: string;
}

const FileTreeFileContext = createContext<FileTreeFileContextType>({
  name: "",
  path: "",
});

export type FileTreeFileProps = HTMLAttributes<HTMLDivElement> & {
  path: string;
  name: string;
  icon?: ReactNode;
};

export const FileTreeFile = ({
  path,
  name,
  icon,
  className,
  children,
  ...props
}: FileTreeFileProps) => {
  const { focusPath, focusedPath, selectedPath, onSelect } = useContext(FileTreeContext);
  const isSelected = selectedPath === path;
  const isFocused = focusedPath === path;

  const handleClick = useCallback(() => {
    focusPath(path);
    onSelect?.(path);
  }, [focusPath, onSelect, path]);

  const fileContextValue = useMemo(() => ({ name, path }), [name, path]);

  return (
    <FileTreeFileContext.Provider value={fileContextValue}>
      <div
        className={cn(
          "flex cursor-pointer items-center gap-1 rounded px-2 py-1 transition-colors hover:bg-muted/50",
          isSelected && "bg-muted",
          className
        )}
        onClick={handleClick}
        role="treeitem"
        tabIndex={isFocused ? 0 : -1}
        aria-selected={isSelected}
        data-file-tree-path={path}
        data-file-tree-kind="file"
        onFocus={(event) => { if (event.target === event.currentTarget) focusPath(path); }}
        {...props}
      >
        {children ?? (
          <>
            {/* Spacer for alignment */}
            <span className="size-4 shrink-0" />
            <FileTreeIcon>
              {icon ?? <FileIcon className="size-4 text-muted-foreground" />}
            </FileTreeIcon>
            <FileTreeName>{name}</FileTreeName>
          </>
        )}
      </div>
    </FileTreeFileContext.Provider>
  );
};

export type FileTreeActionsProps = HTMLAttributes<HTMLDivElement>;

const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

export const FileTreeActions = ({
  className,
  children,
  ...props
}: FileTreeActionsProps) => (
  <div
    className={cn("ml-auto flex items-center gap-1", className)}
    onClick={stopPropagation}
    onKeyDown={stopPropagation}
    role="group"
    {...props}
  >
    {children}
  </div>
);
