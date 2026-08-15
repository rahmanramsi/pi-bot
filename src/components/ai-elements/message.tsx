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
  components?: Components;
};

function isExternalUrl(href: string) {
  return /^(?:https?:|mailto:|tel:)/i.test(href);
}

function normalizeWorkspacePath(href: string) {
  if (!href.startsWith("workspace://")) return undefined;
  try {
    return decodeURIComponent(href.slice("workspace://".length));
  } catch {
    return href.slice("workspace://".length);
  }
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
  components,
  mode = "streaming",
  remarkPlugins = [],
  remarkRehypeOptions,
  ...props
}: MessageResponseProps) {
  const mergedComponents: Components = {
    ...components,
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
      remarkPlugins={[remarkGfm, ...remarkPlugins]}
      remarkRehypeOptions={{ ...remarkRehypeOptions, clobberPrefix: "" }}
      components={mergedComponents}
      {...props}
    >
      {children ?? ""}
    </Streamdown>
  );
});

MessageResponse.displayName = "MessageResponse";
