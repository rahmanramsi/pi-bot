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
import { createMathPlugin } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { UIMessage } from "ai";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { createElement, isValidElement, type AnchorHTMLAttributes, type ComponentProps, type HTMLAttributes, type MouseEvent, type ReactElement, type ReactNode } from "react";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import remarkGfm from "remark-gfm";
import { Streamdown, StreamdownContext, type Components, type StreamdownProps } from "streamdown";

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

type MarkdownNode = {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

const emojiShortcodes: Record<string, string> = {
  angel: "😇",
  clap: "👏",
  fire: "🔥",
  heart: "❤️",
  laugh: "😆",
  love: "😍",
  memo: "📝",
  muscle: "💪",
  pray: "🙏",
  rocket: "🚀",
  smile: "😄",
  sob: "😭",
  sparkles: "✨",
  tada: "🎉",
  thinking: "🤔",
  thumbsup: "👍",
  warning: "⚠️",
  wave: "👋",
};

const mathPlugin = createMathPlugin({ singleDollarTextMath: true });

function htmlNode(type: string, tagName: string, children: MarkdownNode[]): MarkdownNode {
  return { type, data: { hName: tagName }, children };
}

function textNode(value: string): MarkdownNode {
  return { type: "text", value };
}

function textOnlyValue(node: MarkdownNode) {
  if (!node.children || node.children.some((child) => child.type !== "text" || typeof child.value !== "string")) return undefined;
  return node.children.map((child) => child.value ?? "").join("");
}

function definitionListNode(node: MarkdownNode) {
  if (node.type !== "paragraph") return undefined;
  const value = textOnlyValue(node);
  if (!value) return undefined;

  const lines = value.split(/\r?\n/);
  if (lines.length < 2) return undefined;

  const children: MarkdownNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const term = lines[index]?.trim();
    const definition = lines[index + 1]?.match(/^\s*:\s+(.+)$/);
    if (!term || !definition) return undefined;

    children.push(htmlNode("definition-term", "dt", [textNode(term)]));
    while (index + 1 < lines.length) {
      const nextDefinition = lines[index + 1]?.match(/^\s*:\s+(.+)$/);
      if (!nextDefinition) break;
      children.push(htmlNode("definition-description", "dd", [textNode(nextDefinition[1])]));
      index += 1;
    }
    index += 1;
  }

  return htmlNode("definition-list", "dl", children);
}

function transformDefinitionLists(parent: MarkdownNode) {
  if (!parent.children) return;
  for (let index = 0; index < parent.children.length; index += 1) {
    const child = parent.children[index];
    const definitionList = definitionListNode(child);
    if (definitionList) {
      parent.children[index] = definitionList;
      continue;
    }
    transformDefinitionLists(child);
  }
}

function normalizeWorkspaceLinks(parent: MarkdownNode) {
  if (!parent.children) return;
  for (const child of parent.children) {
    if (child.type === "link" && typeof child.url === "string" && child.url.startsWith("workspace://")) {
      const target = child.url.slice("workspace://".length);
      const separator = target.search(/[?#]/);
      const path = (separator === -1 ? target : target.slice(0, separator)).replace(/^\/+/, "");
      const suffix = separator === -1 ? "" : target.slice(separator);
      if (path) child.url = `/${path}${suffix}`;
    }
    normalizeWorkspaceLinks(child);
  }
}

const inlineMarkdownPattern = /(?<!\\)==([^=\n]+)==|(?<!\\)(?<!~)~([^~\n]+)~(?!~)|(?<!\\)\^([^\^\n]+)\^(?!\^)|:([a-z0-9_+-]+):/gi;

const inlineEscapeTokens = {
  "==": "\uE000pi-highlight\uE001",
  "~": "\uE000pi-subscript\uE001",
  "^": "\uE000pi-superscript\uE001",
  ":": "\uE000pi-emoji\uE001",
} as const;

function protectEscapedInlineSyntax(value: string) {
  return value.replace(/\\(==|~|\^|:)/g, (_, delimiter: keyof typeof inlineEscapeTokens) => inlineEscapeTokens[delimiter]);
}

function restoreInlineEscapeTokens(parent: MarkdownNode) {
  if (!parent.children) return;
  for (const child of parent.children) {
    if (typeof child.value === "string") {
      const preserveEscape = child.type === "code" || child.type === "inlineCode" || child.type === "html";
      child.value = Object.entries(inlineEscapeTokens).reduce(
        (value, [delimiter, token]) => value.replaceAll(token, `${preserveEscape ? "\\" : ""}${delimiter}`),
        child.value,
      );
    }
    restoreInlineEscapeTokens(child);
  }
}

function transformInlineText(value: string) {
  const children: MarkdownNode[] = [];
  let cursor = 0;
  let changed = false;
  let match: RegExpExecArray | null;

  while ((match = inlineMarkdownPattern.exec(value))) {
    const [source, highlight, subscript, superscript, shortcode] = match;
    const emoji = shortcode ? emojiShortcodes[shortcode.toLowerCase()] : undefined;
    if (shortcode && !emoji) continue;

    if (match.index > cursor) children.push(textNode(value.slice(cursor, match.index)));
    if (highlight) children.push(htmlNode("mark", "mark", [textNode(highlight)]));
    else if (subscript) children.push(htmlNode("subscript", "sub", [textNode(subscript)]));
    else if (superscript) children.push(htmlNode("superscript", "sup", [textNode(superscript)]));
    else if (emoji) children.push(textNode(emoji));
    cursor = match.index + source.length;
    changed = true;
  }

  inlineMarkdownPattern.lastIndex = 0;
  if (!changed) return undefined;
  if (cursor < value.length) children.push(textNode(value.slice(cursor)));
  return children;
}

function sourceForNode(node: MarkdownNode, source: string) {
  const position = node.position as { start?: { offset?: number }; end?: { offset?: number } } | undefined;
  const start = position?.start?.offset;
  const end = position?.end?.offset;
  if (typeof start !== "number" || typeof end !== "number") return undefined;
  return source.slice(start, end);
}

function transformInlineSyntax(parent: MarkdownNode, source: string) {
  if (!parent.children) return;
  for (let index = 0; index < parent.children.length; index += 1) {
    const child = parent.children[index];
    if (child.type === "delete" && /^~[^~\r\n]+~$/.test(sourceForNode(child, source) ?? "")) {
      parent.children[index] = htmlNode("subscript", "sub", child.children ?? []);
      continue;
    }
    if (child.type === "text" && typeof child.value === "string") {
      const replacement = transformInlineText(child.value);
      if (replacement) {
        parent.children.splice(index, 1, ...replacement);
        index += replacement.length - 1;
      }
      continue;
    }
    transformInlineSyntax(child, source);
  }
}

function remarkMarkdownExtensions() {
  return (tree: MarkdownNode, file: { value?: unknown }) => {
    normalizeWorkspaceLinks(tree);
    transformDefinitionLists(tree);
    transformInlineSyntax(tree, typeof file.value === "string" ? file.value : "");
    restoreInlineEscapeTokens(tree);
  };
}

function isExternalUrl(href: string) {
  return /^(?:https?:|mailto:|tel:)/i.test(href);
}

function isRelativeWorkspaceHref(href: string) {
  const pathPart = href.split(/[?#]/, 1)[0];
  if (!pathPart || pathPart.startsWith("\\") || pathPart.startsWith("//")) return false;
  const relativePath = pathPart.startsWith("/") ? pathPart.slice(1) : pathPart;
  if (!relativePath || /^[a-z][a-z\d+.-]*:/i.test(relativePath)) return false;
  return relativePath.startsWith("./") || relativePath.startsWith("../") || /^[^/?#]+(?:\/[^/?#]+)*$/.test(relativePath);
}

function normalizeWorkspacePath(href: string) {
  const rawPath = href.startsWith("workspace://") ? href.slice("workspace://".length).split(/[?#]/, 1)[0] : href.split(/[?#]/, 1)[0].replace(/^\//, "");
  if (!href.startsWith("workspace://") && !isRelativeWorkspaceHref(href)) return undefined;
  try {
    const decoded = decodeURIComponent(rawPath);
    return decoded || undefined;
  } catch {
    return undefined;
  }
}

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

function safeUrlTransform(url: string, key: string) {
  if (key === "href" && !isExternalUrl(url) && !url.startsWith("#") && !normalizeWorkspacePath(url)) return undefined;
  if (key === "src" && !/^https?:/i.test(url)) return undefined;
  return url;
}

function normalizeFragmentHref(href: string) {
  if (!/^#fn(?:ref)?-/i.test(href) || href.startsWith("#user-content-")) return href;
  return `#user-content-${href.slice(1)}`;
}

function reactNodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(reactNodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return reactNodeText(node.props.children);
  return "";
}

function createHeadingRenderer(tagName: "h1" | "h2" | "h3" | "h4" | "h5" | "h6", ids: Map<string, number>) {
  return function Heading({ children, id: _id, ...props }: ComponentProps<typeof tagName>) {
    const base = reactNodeText(children)
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "heading";
    const occurrence = ids.get(base) ?? 0;
    ids.set(base, occurrence + 1);
    const id = _id || (occurrence === 0 ? base : `${base}-${occurrence}`);
    return createElement(tagName, { ...props, id }, children);
  };
}

type MarkdownLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  onWorkspaceFile?: (path: string) => void;
};

function MarkdownLink({
  children,
  href,
  onClick,
  onWorkspaceFile,
  ...anchorProps
}: MarkdownLinkProps) {
  const path = href ? normalizeWorkspacePath(href) : undefined;
  const external = href ? isExternalUrl(href) : false;
  const resolvedHref = href ? normalizeFragmentHref(href) : href;
  const { linkSafety } = useContext(StreamdownContext);
  const [isConfirming, setIsConfirming] = useState(false);

  const openExternal = useCallback(() => {
    if (href) window.open(href, "_blank", "noreferrer");
    setIsConfirming(false);
  }, [href]);

  if (external && href && linkSafety?.enabled) {
    const handleExternalClick = async () => {
      if (linkSafety.onLinkCheck && await linkSafety.onLinkCheck(href)) {
        openExternal();
        return;
      }
      setIsConfirming(true);
    };
    const modal = linkSafety.renderModal?.({
      isOpen: isConfirming,
      onClose: () => setIsConfirming(false),
      onConfirm: openExternal,
      url: href,
    });

    return (
      <>
        <button
          className={cn(
            "wrap-anywhere appearance-none text-left font-medium text-primary underline",
            anchorProps.className,
          )}
          data-streamdown="link"
          onClick={() => void handleExternalClick()}
          type="button"
        >
          {children}
        </button>
        {modal ?? (isConfirming ? (
          <div aria-label="External link confirmation" data-streamdown="link-confirmation" role="dialog">
            <p>Open this external link?</p>
            <button onClick={openExternal} type="button">Open link</button>
            <button onClick={() => setIsConfirming(false)} type="button">Cancel</button>
          </div>
        ) : null)}
      </>
    );
  }

  return (
    <a
      {...anchorProps}
      href={resolvedHref}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        if (path && onWorkspaceFile) {
          event.preventDefault();
          onWorkspaceFile(path);
        }
        onClick?.(event);
      }}
    >
      {children}
    </a>
  );
}

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

export type MessageResponseProps = Omit<StreamdownProps, "children" | "components"> & {
  children?: string;
  onWorkspaceFile?: (path: string) => void;
  components?: Components;
};

const streamdownPlugins = { cjk, code, math: mathPlugin, mermaid };

export const MessageResponse = memo(function MessageResponse({
  children,
  className,
  components,
  onWorkspaceFile,
  plugins: customPlugins,
  allowedTags: _allowedTags,
  urlTransform: customUrlTransform,
  remarkPlugins = [],
  remarkRehypeOptions,
  ...props
}: MessageResponseProps) {
  const headingIds = new Map<string, number>();
  const content = protectEscapedInlineSyntax(children ?? "");
  const mergedComponents: Components = {
    ...components,
    h1: createHeadingRenderer("h1", headingIds) as Components["h1"],
    h2: createHeadingRenderer("h2", headingIds) as Components["h2"],
    h3: createHeadingRenderer("h3", headingIds) as Components["h3"],
    h4: createHeadingRenderer("h4", headingIds) as Components["h4"],
    h5: createHeadingRenderer("h5", headingIds) as Components["h5"],
    h6: createHeadingRenderer("h6", headingIds) as Components["h6"],
    a: ((anchorProps) => <MarkdownLink {...anchorProps} onWorkspaceFile={onWorkspaceFile} />) as Components["a"],
  };

  return (
    <Streamdown
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
      remarkPlugins={[remarkMarkdownExtensions, remarkGfm, ...remarkPlugins]}
      remarkRehypeOptions={{ ...remarkRehypeOptions, clobberPrefix: "" }}
      components={mergedComponents}
      allowedTags={{ mark: [], u: [], dl: [], dt: [], dd: [] }}
      plugins={{ ...streamdownPlugins, ...(customPlugins ?? {}), math: mathPlugin }}
      urlTransform={(url, key, node) => {
        const safeUrl = safeUrlTransform(url, key);
        if (safeUrl === undefined) return undefined;
        return customUrlTransform ? customUrlTransform(safeUrl, key, node) : safeUrl;
      }}
      {...props}
    >
      {content}
    </Streamdown>
  );
}, (prevProps, nextProps) => prevProps.children === nextProps.children && nextProps.isAnimating === prevProps.isAnimating);

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
