import { Check, CircleAlert, LoaderCircle, Terminal } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ToolStatus = "running" | "completed" | "failed";

export type ToolProps = ComponentPropsWithoutRef<"details"> & {
  status?: ToolStatus;
  onOpenChange?: (open: boolean) => void;
};

export const Tool = forwardRef<HTMLDetailsElement, ToolProps>(function Tool({ className, status, onToggle, onOpenChange, ...props }, ref) {
  return (
    <details
      ref={ref}
      data-slot="tool"
      data-status={status}
      className={cn("group/tool w-full", className)}
      onToggle={(event) => {
        if (event.currentTarget.open) {
          for (const output of event.currentTarget.querySelectorAll("pre, [data-slot='terminal-content']")) {
            output.scrollLeft = 0;
            output.scrollTop = 0;
          }
        }
        onToggle?.(event);
        onOpenChange?.(event.currentTarget.open);
      }}
      {...props}
    />
  );
});

export type ToolHeaderProps = Omit<ComponentPropsWithoutRef<"summary">, "title" | "children"> & {
  title?: ReactNode;
  status?: ToolStatus;
  children?: ReactNode;
};

function statusIcon(status: ToolStatus) {
  if (status === "running") return <LoaderCircle className="spin" />;
  if (status === "failed") return <CircleAlert />;
  return <Check />;
}

export function ToolHeader({ className, title, status = "completed", children, ...props }: ToolHeaderProps) {
  const label = status === "running" ? "Running" : status === "failed" ? "Failed" : "Completed";
  return (
    <summary data-slot="tool-header" className={cn("flex list-none items-center gap-2", className)} {...props}>
      <Terminal aria-hidden="true" />
      <span className="tool-header-title">{title ?? children}</span>
      <span className={`tool-status ${status}`} aria-label={label} title={label}>{statusIcon(status)}<span>{label}</span></span>
    </summary>
  );
}

export function ToolContent({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="tool-content" className={cn("space-y-3", className)} {...props} />;
}

export type ToolInputProps = ComponentPropsWithoutRef<"div"> & { input?: unknown };

export function ToolInput({ className, input, ...props }: ToolInputProps) {
  if (input === undefined || input === null || input === "") return null;
  const value = typeof input === "string" ? input : JSON.stringify(input, null, 2);
  return <div data-slot="tool-input" className={cn("tool-detail-block", className)} {...props}><h4>Input</h4><pre>{value}</pre></div>;
}

export type ToolOutputProps = ComponentPropsWithoutRef<"div"> & { output?: unknown; errorText?: string };

export function ToolOutput({ className, output, errorText, ...props }: ToolOutputProps) {
  if (output === undefined && !errorText) return null;
  const value = typeof output === "string" ? output : JSON.stringify(output, null, 2);
  return <div data-slot="tool-output" className={cn("tool-detail-block", errorText && "failed", className)} {...props}><h4>{errorText ? "Error" : "Output"}</h4>{errorText ? <pre>{errorText}</pre> : <pre>{value}</pre>}</div>;
}
