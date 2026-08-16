import { Copy } from "lucide-react";
import { isValidElement, memo, type ComponentProps, type ComponentType, type HTMLAttributes, type ReactNode } from "react";
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
  workspaceFiles?: readonly string[];
  components?: Components;
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

export const MessageResponse = memo(function MessageResponse({
  children,
  className,
  mermaidRenderer,
  codeRenderer: CustomCodeRenderer = ({ code, language }) => <CodeBlock code={code} language={language} />,
  onWorkspaceFile,
  workspaceFiles,
  components,
  mode = "streaming",
  remarkPlugins = [],
  remarkRehypeOptions,
  ...props
}: MessageResponseProps) {
  const workspacePaths = workspacePathLookup(workspaceFiles);
  const mergedComponents: Components = {
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
      remarkPlugins={[remarkGfm, ...remarkPlugins, ...(workspacePaths ? [workspacePathPlugin(workspacePaths)] : [])]}
      remarkRehypeOptions={{ ...remarkRehypeOptions, clobberPrefix: "" }}
      components={mergedComponents}
      {...props}
    >
      {children ?? ""}
    </Streamdown>
  );
});

MessageResponse.displayName = "MessageResponse";
