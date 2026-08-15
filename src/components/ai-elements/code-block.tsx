import { Check, Copy } from "lucide-react";
import { createHighlighter, type BundledLanguage } from "shiki";
import { useCallback, useEffect, useMemo, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const supportedLanguages = ["javascript", "typescript", "tsx", "jsx", "json", "bash", "shellscript", "css", "html", "xml", "markdown", "python", "ruby", "go", "rust", "java", "c", "cpp", "sql", "yaml"] as BundledLanguage[];
const plainTextLanguage = "text" as BundledLanguage;
const aliases: Record<string, BundledLanguage> = { ts: "typescript", js: "javascript", sh: "bash", shell: "bash", md: "markdown", yml: "yaml", plaintext: plainTextLanguage, txt: plainTextLanguage };
const highlighter = createHighlighter({ langs: supportedLanguages, themes: ["github-light", "github-dark"] });

function normalizeLanguage(language: string): BundledLanguage {
  const normalized = language.trim().toLowerCase();
  const aliased = aliases[normalized] ?? normalized;
  return supportedLanguages.includes(aliased as BundledLanguage) ? aliased as BundledLanguage : plainTextLanguage;
}

export function CodeBlockContainer({ className, language, ...props }: ComponentPropsWithoutRef<"div"> & { language: string }) {
  return <div data-slot="code-block" data-language={language} className={cn("code-block", className)} {...props} />;
}

export function CodeBlockHeader({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="code-block-header" className={cn("code-block-header", className)} {...props} />;
}

export function CodeBlockTitle({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="code-block-title" className={cn("code-block-title", className)} {...props} />;
}

export function CodeBlockActions({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="code-block-actions" className={cn("code-block-actions", className)} {...props} />;
}

export function CodeBlockCopyButton({ code: propCode, className, children, onCopy, onError, ...props }: ComponentPropsWithoutRef<typeof Button> & { code?: string; onCopy?: () => void; onError?: (error: Error) => void }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      onError?.(new Error("Clipboard API not available"));
      return;
    }
    const code = propCode ?? "";
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      onCopy?.();
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      onError?.(error as Error);
    }
  }, [onCopy, onError, propCode]);
  return <Button type="button" size="icon-sm" variant="ghost" className={cn("code-block-copy", className)} aria-label="Copy code" onClick={copy} {...props}>{children ?? (copied ? <Check /> : <Copy />)}</Button>;
}

function HighlightedCode({ code, language }: { code: string; language: BundledLanguage }) {
  const [html, setHtml] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    setHtml(undefined);
    void highlighter.then((instance) => {
      const result = instance.codeToHtml(code, { lang: language, themes: { light: "github-light", dark: "github-dark" } });
      if (!cancelled) setHtml(result);
    }).catch(() => {
      if (!cancelled) setHtml(undefined);
    });
    return () => { cancelled = true; };
  }, [code, language]);

  if (!html) return <pre><code>{code}</code></pre>;
  return <div className="code-block-highlighted" dangerouslySetInnerHTML={{ __html: html }} />;
}

export type CodeBlockProps = ComponentPropsWithoutRef<"div"> & { code: string; language: string; showLineNumbers?: boolean; children?: ReactNode };

export function CodeBlock({ code, language, className, children, ...props }: CodeBlockProps) {
  const normalized = useMemo(() => normalizeLanguage(language), [language]);
  return (
    <CodeBlockContainer language={language} className={className} {...props}>
      {children ?? (
        <>
          <CodeBlockHeader>
            <CodeBlockTitle>{language || "text"}</CodeBlockTitle>
            <CodeBlockActions><CodeBlockCopyButton code={code} /></CodeBlockActions>
          </CodeBlockHeader>
        </>
      )}
      {normalized === plainTextLanguage ? <pre><code>{code}</code></pre> : <HighlightedCode code={code} language={normalized} />}
    </CodeBlockContainer>
  );
}
