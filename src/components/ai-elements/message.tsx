import { Copy } from "lucide-react";
import { createMathPlugin } from "@streamdown/math";
import { createElement, isValidElement, memo, type ComponentProps, type ComponentType, type HTMLAttributes, type ReactNode } from "react";
import { Streamdown, type Components, type StreamdownProps } from "streamdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./code-block";

export type MessageProps = HTMLAttributes<HTMLDivElement> & {
  from: "user" | "assistant";
};

export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      data-slot="message"
      data-from={from}
      className={cn("group flex w-full min-w-0 gap-2", from === "user" ? "is-user ml-auto flex-row-reverse justify-start" : "is-assistant", className)}
      {...props}
    />
  );
}

export type MessageContentProps = HTMLAttributes<HTMLDivElement>;

export function MessageContent({ className, ...props }: MessageContentProps) {
  return <div data-slot="message-content" className={cn("flex min-w-0 flex-col gap-2.5", className)} {...props} />;
}

export type MessageActionsProps = ComponentProps<"div">;

export function MessageActions({ className, ...props }: MessageActionsProps) {
  return <div data-slot="message-actions" className={cn("flex items-center gap-1", className)} {...props} />;
}

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

export function MessageAction({ tooltip, label, children = <Copy />, size = "icon-sm", variant = "ghost", ...props }: MessageActionProps) {
  return (
    <Button size={size} type="button" variant={variant} title={tooltip} aria-label={label ?? tooltip} {...props}>
      {children}
    </Button>
  );
}

type CodeRendererProps = { code: string; language: string };

export type MessageResponseProps = Omit<StreamdownProps, "children" | "components"> & {
  children?: string;
  mermaidRenderer?: (chart: string) => ReactNode;
  codeRenderer?: ComponentType<CodeRendererProps>;
  onWorkspaceFile?: (path: string) => void;
  components?: Components;
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

export const MessageResponse = memo(function MessageResponse({
  children,
  className,
  mermaidRenderer,
  codeRenderer: CustomCodeRenderer = ({ code, language }) => <CodeBlock code={code} language={language} />,
  onWorkspaceFile,
  components,
  mode = "streaming",
  plugins: streamdownPlugins,
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
    a: (({ href, onClick, ...anchorProps }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
      const path = href ? normalizeWorkspacePath(href) : undefined;
      const external = href ? isExternalUrl(href) : false;
      const resolvedHref = href ? normalizeFragmentHref(href) : href;
      return (
        <a
          {...anchorProps}
          href={resolvedHref}
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
    pre: (({ children: preChildren }) => {
      const codeElement = Array.isArray(preChildren) ? preChildren[0] : preChildren;
      if (isValidElement<{ className?: string; children?: ReactNode }>(codeElement) && !/language-[\w-]+/.test(codeElement.props.className ?? "")) {
        return <CustomCodeRenderer code={String(codeElement.props.children ?? "").replace(/\n$/, "")} language="text" />;
      }
      return <>{preChildren}</>;
    }) as Components["pre"],
    code: (({ className: codeClassName, children: codeChildren, ...codeProps }: React.HTMLAttributes<HTMLElement>) => {
      const match = /language-([\w-]+)/.exec(codeClassName ?? "");
      const code = String(codeChildren ?? "").replace(/\n$/, "");
      if (!match) return <code className={codeClassName} {...codeProps}>{codeChildren}</code>;
      const language = match[1];
      if (language === "mermaid" && mermaidRenderer) return mermaidRenderer(code);
      return <CustomCodeRenderer code={code} language={language} />;
    }) as Components["code"],
  };

  return (
    <Streamdown
      className={cn("size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}
      mode={mode}
      remarkPlugins={[remarkMarkdownExtensions, remarkGfm, ...remarkPlugins]}
      remarkRehypeOptions={{ ...remarkRehypeOptions, clobberPrefix: "" }}
      components={mergedComponents}
      allowedTags={{ mark: [], u: [], dl: [], dt: [], dd: [] }}
      plugins={{ ...(streamdownPlugins ?? {}), math: mathPlugin }}
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
});

MessageResponse.displayName = "MessageResponse";
