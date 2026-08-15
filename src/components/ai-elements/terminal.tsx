import Ansi from "ansi-to-react";
import { Check, CircleAlert, Copy, LoaderCircle, Trash2 } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type HTMLAttributes,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AnsiText = (Ansi as unknown as { default?: typeof Ansi }).default ?? Ansi;

type TerminalContextValue = {
  output: string;
  command?: string;
  status: TerminalRunStatus;
  isStreaming: boolean;
  autoScroll: boolean;
  onClear?: () => void;
};

const TerminalContext = createContext<TerminalContextValue>({
  output: "",
  status: "completed",
  isStreaming: false,
  autoScroll: true,
});

export type TerminalHeaderProps = HTMLAttributes<HTMLDivElement>;

export function TerminalHeader({ className, ...props }: TerminalHeaderProps) {
  return <div data-slot="terminal-header" className={cn("terminal-header", className)} {...props} />;
}

export type TerminalTitleProps = HTMLAttributes<HTMLDivElement>;

export function TerminalTitle({ className, children, ...props }: TerminalTitleProps) {
  return (
    <div data-slot="terminal-title" className={cn("terminal-title", className)} {...props}>
      {children ?? "Shell"}
    </div>
  );
}

export type TerminalStatusProps = HTMLAttributes<HTMLDivElement>;

export function TerminalStatus({ className, children, ...props }: TerminalStatusProps) {
  const { status } = useContext(TerminalContext);
  const Icon = status === "running" ? LoaderCircle : status === "failed" ? CircleAlert : Check;
  const label = status === "running" ? "Running" : status === "failed" ? "Failed" : "Success";
  return (
    <div data-slot="terminal-status" data-status={status} className={cn("terminal-status", className)} {...props}>
      {children ?? <><Icon className={status === "running" ? "spin" : undefined} aria-hidden="true" />{label}</>}
    </div>
  );
}

export type TerminalActionsProps = HTMLAttributes<HTMLDivElement>;

export function TerminalActions({ className, ...props }: TerminalActionsProps) {
  return <div data-slot="terminal-actions" className={cn("terminal-actions", className)} {...props} />;
}

export type TerminalCopyButtonProps = Omit<ComponentProps<typeof Button>, "onCopy"> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

export function TerminalCopyButton({ onCopy, onError, timeout = 2000, className, children, ...props }: TerminalCopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number>(0);
  const { output } = useContext(TerminalContext);

  const copyOutput = useCallback(async () => {
    if (!navigator.clipboard?.writeText) {
      onError?.(new Error("Clipboard API not available"));
      return;
    }
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      onCopy?.();
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopied(false), timeout);
    } catch (error) {
      onError?.(error as Error);
    }
  }, [onCopy, onError, output, timeout]);

  useEffect(() => () => window.clearTimeout(timeoutRef.current), []);
  const Icon = copied ? Check : Copy;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn("terminal-action", className)}
      onClick={copyOutput}
      aria-label={copied ? "Output copied" : "Copy output"}
      {...props}
    >
      {children ?? <Icon aria-hidden="true" />}
    </Button>
  );
}

export type TerminalClearButtonProps = ComponentProps<typeof Button>;

export function TerminalClearButton({ className, children, ...props }: TerminalClearButtonProps) {
  const { onClear } = useContext(TerminalContext);
  if (!onClear) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn("terminal-action", className)}
      onClick={onClear}
      aria-label="Clear output"
      {...props}
    >
      {children ?? <Trash2 aria-hidden="true" />}
    </Button>
  );
}

export type TerminalContentProps = HTMLAttributes<HTMLDivElement>;

export function TerminalContent({ className, children, ...props }: TerminalContentProps) {
  const { output, command, isStreaming, autoScroll } = useContext(TerminalContext);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && contentRef.current) contentRef.current.scrollTop = contentRef.current.scrollHeight;
  }, [autoScroll, output]);

  return (
    <div ref={contentRef} data-slot="terminal-content" className={cn("terminal-content", className)} {...props}>
      {children ?? (
        <>
          {command && <div data-slot="terminal-command" className="terminal-command"><span aria-hidden="true">$</span><code>{command}</code></div>}
          <pre data-slot="terminal-output"><AnsiText>{output}</AnsiText>{isStreaming && <span className="terminal-cursor" aria-hidden="true" />}</pre>
        </>
      )}
    </div>
  );
}

export type TerminalProps = HTMLAttributes<HTMLDivElement> & {
  output: string;
  command?: string;
  status?: TerminalRunStatus;
  isStreaming?: boolean;
  autoScroll?: boolean;
  onClear?: () => void;
};

export type TerminalRunStatus = "running" | "completed" | "failed";

export function Terminal({ output, command, status, isStreaming = false, autoScroll = true, onClear, className, children, ...props }: TerminalProps) {
  const runStatus = status ?? (isStreaming ? "running" : "completed");
  const value = useMemo(() => ({ output, command, status: runStatus, isStreaming, autoScroll, onClear }), [output, command, runStatus, isStreaming, autoScroll, onClear]);
  return (
    <TerminalContext.Provider value={value}>
      <div data-slot="terminal" className={cn("terminal", className)} {...props}>
        {children ?? (
          <>
            <TerminalHeader>
              <TerminalTitle />
            </TerminalHeader>
            <TerminalContent />
            <div className="terminal-footer"><TerminalStatus /></div>
          </>
        )}
      </div>
    </TerminalContext.Provider>
  );
}
