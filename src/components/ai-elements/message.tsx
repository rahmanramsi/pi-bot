"use client";

import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupText,
} from "@/components/ui/button-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { UIMessage } from "ai";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { ComponentProps, HTMLAttributes, ReactElement } from "react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Streamdown, type Components } from "streamdown";
import remarkGfm from "remark-gfm";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: UIMessage["role"];
};

export const Message = ({ className, from, ...props }: MessageProps) => (
  <div
    className={cn(
      "group flex w-full max-w-[95%] flex-col gap-2",
      from === "user" ? "is-user ml-auto justify-end" : "is-assistant",
      className
    )}
    {...props}
  />
);

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageContent = ({
  children,
  className,
  ...props
}: MessageContentProps) => (
  <div
    className={cn(
      "is-user:dark flex w-fit min-w-0 max-w-full flex-col gap-2 overflow-hidden text-sm",
      "group-[.is-user]:ml-auto group-[.is-user]:rounded-lg group-[.is-user]:bg-secondary group-[.is-user]:px-4 group-[.is-user]:py-3 group-[.is-user]:text-foreground",
      "group-[.is-assistant]:text-foreground",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

export type MessageActionsProps = ComponentProps<"div">;

export const MessageActions = ({
  className,
  children,
  ...props
}: MessageActionsProps) => (
  <div className={cn("flex items-center gap-1", className)} {...props}>
    {children}
  </div>
);

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: MessageActionProps) => {
  const button = (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
      <span className="sr-only">{label || tooltip}</span>
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

interface MessageBranchContextType {
  currentBranch: number;
  totalBranches: number;
  goToPrevious: () => void;
  goToNext: () => void;
  branches: ReactElement[];
  setBranches: (branches: ReactElement[]) => void;
}

const MessageBranchContext = createContext<MessageBranchContextType | null>(
  null
);

const useMessageBranch = () => {
  const context = useContext(MessageBranchContext);

  if (!context) {
    throw new Error(
      "MessageBranch components must be used within MessageBranch"
    );
  }

  return context;
};

export type MessageBranchProps = HTMLAttributes<HTMLDivElement> & {
  defaultBranch?: number;
  onBranchChange?: (branchIndex: number) => void;
};

export const MessageBranch = ({
  defaultBranch = 0,
  onBranchChange,
  className,
  ...props
}: MessageBranchProps) => {
  const [currentBranch, setCurrentBranch] = useState(defaultBranch);
  const [branches, setBranches] = useState<ReactElement[]>([]);

  const handleBranchChange = useCallback(
    (newBranch: number) => {
      setCurrentBranch(newBranch);
      onBranchChange?.(newBranch);
    },
    [onBranchChange]
  );

  const goToPrevious = useCallback(() => {
    const newBranch =
      currentBranch > 0 ? currentBranch - 1 : branches.length - 1;
    handleBranchChange(newBranch);
  }, [currentBranch, branches.length, handleBranchChange]);

  const goToNext = useCallback(() => {
    const newBranch =
      currentBranch < branches.length - 1 ? currentBranch + 1 : 0;
    handleBranchChange(newBranch);
  }, [currentBranch, branches.length, handleBranchChange]);

  const contextValue = useMemo<MessageBranchContextType>(
    () => ({
      branches,
      currentBranch,
      goToNext,
      goToPrevious,
      setBranches,
      totalBranches: branches.length,
    }),
    [branches, currentBranch, goToNext, goToPrevious]
  );

  return (
    <MessageBranchContext.Provider value={contextValue}>
      <div
        className={cn("grid w-full gap-2 [&>div]:pb-0", className)}
        {...props}
      />
    </MessageBranchContext.Provider>
  );
};

export type MessageBranchContentProps = HTMLAttributes<HTMLDivElement>;

export const MessageBranchContent = ({
  children,
  ...props
}: MessageBranchContentProps) => {
  const { currentBranch, setBranches, branches } = useMessageBranch();
  const childrenArray = useMemo(
    () => (Array.isArray(children) ? children : [children]),
    [children]
  );

  // Use useEffect to update branches when they change
  useEffect(() => {
    if (branches.length !== childrenArray.length) {
      setBranches(childrenArray);
    }
  }, [childrenArray, branches, setBranches]);

  return childrenArray.map((branch, index) => (
    <div
      className={cn(
        "grid gap-2 overflow-hidden [&>div]:pb-0",
        index === currentBranch ? "block" : "hidden"
      )}
      key={branch.key}
      {...props}
    >
      {branch}
    </div>
  ));
};

export type MessageBranchSelectorProps = ComponentProps<typeof ButtonGroup>;

export const MessageBranchSelector = ({
  className,
  ...props
}: MessageBranchSelectorProps) => {
  const { totalBranches } = useMessageBranch();

  // Don't render if there's only one branch
  if (totalBranches <= 1) {
    return null;
  }

  return (
    <ButtonGroup
      className={cn(
        "[&>*:not(:first-child)]:rounded-l-md [&>*:not(:last-child)]:rounded-r-md",
        className
      )}
      orientation="horizontal"
      {...props}
    />
  );
};

export type MessageBranchPreviousProps = ComponentProps<typeof Button>;

export const MessageBranchPrevious = ({
  children,
  ...props
}: MessageBranchPreviousProps) => {
  const { goToPrevious, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Previous branch"
      disabled={totalBranches <= 1}
      onClick={goToPrevious}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronLeftIcon size={14} />}
    </Button>
  );
};

export type MessageBranchNextProps = ComponentProps<typeof Button>;

export const MessageBranchNext = ({
  children,
  ...props
}: MessageBranchNextProps) => {
  const { goToNext, totalBranches } = useMessageBranch();

  return (
    <Button
      aria-label="Next branch"
      disabled={totalBranches <= 1}
      onClick={goToNext}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      {children ?? <ChevronRightIcon size={14} />}
    </Button>
  );
};

export type MessageBranchPageProps = HTMLAttributes<HTMLSpanElement>;

export const MessageBranchPage = ({
  className,
  ...props
}: MessageBranchPageProps) => {
  const { currentBranch, totalBranches } = useMessageBranch();

  return (
    <ButtonGroupText
      className={cn(
        "border-none bg-transparent text-muted-foreground shadow-none",
        className
      )}
      {...props}
    >
      {currentBranch + 1} of {totalBranches}
    </ButtonGroupText>
  );
};

export type MessageResponseProps = ComponentProps<typeof Streamdown> & {
  onWorkspaceFile?: (path: string) => void;
  workspaceFiles?: readonly string[];
};

const workspaceLinkPrefix = "https://pi-bot.invalid/workspace/";

function isExternalUrl(href: string) {
  return !href.startsWith(workspaceLinkPrefix) && /^(?:https?:|mailto:|tel:)/i.test(href);
}

function normalizeWorkspacePath(href: string) {
  const encodedPath = href.startsWith(workspaceLinkPrefix)
    ? href.slice(workspaceLinkPrefix.length)
    : href.startsWith("workspace://")
      ? href.slice("workspace://".length)
      : undefined;
  if (encodedPath === undefined) return undefined;
  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
}

function normalizeRelativeWorkspacePath(value: string) {
  const candidate = value.trim().replaceAll("\\", "/");
  if (!candidate || candidate.startsWith("/") || candidate.startsWith("~") || candidate.includes(":") || candidate.includes("?") || candidate.includes("#")) return undefined;
  const segments = candidate.split("/");
  if (segments.some((segment) => !segment || segment === "..")) return undefined;
  const normalized = segments.filter((segment) => segment !== ".").join("/");
  return normalized || undefined;
}

function workspacePathLookup(files?: readonly string[]) {
  if (!files) return undefined;
  const paths = new Map<string, string>();
  for (const file of files) {
    const normalized = normalizeRelativeWorkspacePath(file);
    if (normalized) paths.set(normalized, normalized);
  }
  return paths;
}

function resolveWorkspacePath(value: string, lookup?: Map<string, string>) {
  const normalized = normalizeRelativeWorkspacePath(value);
  if (!normalized) return undefined;
  return lookup ? lookup.get(normalized) : normalized;
}

function workspaceHref(path: string) {
  return `${workspaceLinkPrefix}${encodeURIComponent(path)}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isPathBoundary(value: string, index: number, length: number) {
  const before = value[index - 1];
  const after = value[index + length];
  if (before && /[\w./-]/u.test(before)) return false;
  if (after && /[\w/-]/u.test(after)) return false;
  if (after === "." && /\w/u.test(value[index + length + 1] ?? "")) return false;
  return true;
}

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
  [key: string]: unknown;
};

function workspacePathPlugin(lookup: Map<string, string>) {
  const aliases = Array.from(lookup.keys())
    .flatMap((path) => [path, `./${path}`])
    .sort((left, right) => right.length - left.length)
    .map(escapeRegExp);
  const pathPattern = aliases.length > 0 ? new RegExp(aliases.join("|"), "g") : undefined;

  function splitTextNode(node: MarkdownNode) {
    if (!pathPattern || typeof node.value !== "string") return [node];
    const value = node.value;
    const result: MarkdownNode[] = [];
    let cursor = 0;
    pathPattern.lastIndex = 0;
    for (const match of value.matchAll(pathPattern)) {
      const raw = match[0];
      const index = match.index ?? 0;
      const path = resolveWorkspacePath(raw, lookup);
      if (!path || !isPathBoundary(value, index, raw.length)) continue;
      if (index > cursor) result.push({ type: "text", value: value.slice(cursor, index) });
      result.push({ type: "link", url: workspaceHref(path), children: [{ type: "text", value: raw }] });
      cursor = index + raw.length;
    }
    if (result.length === 0) return [node];
    if (cursor < value.length) result.push({ type: "text", value: value.slice(cursor) });
    return result;
  }

  function rewrite(node: MarkdownNode): MarkdownNode[] {
    if (node.type === "text") return splitTextNode(node);
    if (node.type === "inlineCode") {
      const path = typeof node.value === "string" ? resolveWorkspacePath(node.value, lookup) : undefined;
      return path ? [{ type: "link", url: workspaceHref(path), children: [node] }] : [node];
    }
    if (node.type === "link") {
      const path = typeof node.url === "string" ? resolveWorkspacePath(node.url, lookup) : undefined;
      return [path ? { ...node, url: workspaceHref(path) } : node];
    }
    if (!node.children) return [node];
    return [{ ...node, children: node.children.flatMap(rewrite) }];
  }

  return () => (tree: MarkdownNode) => {
    if (tree.children) tree.children = tree.children.flatMap(rewrite);
  };
}

function normalizeFragmentHref(href: string) {
  if (!href.startsWith("#") || href.startsWith("#user-content-")) return href;
  return `#user-content-${href.slice(1)}`;
}

const streamdownPlugins = { cjk, code, math, mermaid };

export const MessageResponse = memo(
  ({ className, components, onWorkspaceFile, workspaceFiles, remarkPlugins = [], remarkRehypeOptions, ...props }: MessageResponseProps) => {
    const workspacePaths = workspacePathLookup(workspaceFiles);
    const mergedComponents: Components | undefined = workspaceFiles === undefined ? components : {
      ...components,
      a: (({ href, onClick, ...anchorProps }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
        const explicitPath = href ? normalizeWorkspacePath(href) : undefined;
        const path = explicitPath !== undefined
          ? resolveWorkspacePath(explicitPath, workspacePaths)
          : href && workspacePaths ? resolveWorkspacePath(href, workspacePaths) : undefined;
        const external = href ? isExternalUrl(href) : false;
        const relative = Boolean(href && !href.startsWith("#") && !external && (explicitPath !== undefined || !/^[a-z][a-z\d+.-]*:/i.test(href)));
        const resolvedHref = href ? normalizeFragmentHref(href) : href;
        if (workspaceFiles && relative && !path) return <span {...anchorProps} />;
        return (
          <a
            {...anchorProps}
            href={path ? workspaceHref(path) : resolvedHref}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer" : undefined}
            onClick={(event) => {
              if (path && onWorkspaceFile) {
                event.preventDefault();
                onWorkspaceFile(path);
              }
              onClick?.(event);
            }}
          />
        );
      }) as Components["a"],
    };

    return (
      <Streamdown
        className={cn(
          "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          className
        )}
        plugins={streamdownPlugins}
        remarkPlugins={[remarkGfm, ...remarkPlugins, ...(workspacePaths ? [workspacePathPlugin(workspacePaths)] : [])]}
        remarkRehypeOptions={{ ...remarkRehypeOptions, clobberPrefix: "" }}
        components={mergedComponents}
        {...props}
      />
    );
  },
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    nextProps.isAnimating === prevProps.isAnimating &&
    prevProps.workspaceFiles === nextProps.workspaceFiles &&
    prevProps.onWorkspaceFile === nextProps.onWorkspaceFile
);

MessageResponse.displayName = "MessageResponse";

export type MessageToolbarProps = ComponentProps<"div">;

export const MessageToolbar = ({
  className,
  children,
  ...props
}: MessageToolbarProps) => (
  <div
    className={cn(
      "mt-4 flex w-full items-center justify-between gap-4",
      className
    )}
    {...props}
  >
    {children}
  </div>
);
