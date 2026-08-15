import { ArrowDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useCallback } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import { useReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export function Conversation({ className, ...props }: ConversationProps) {
  const reducedMotion = useReducedMotion();
  return (
    <StickToBottom
      data-slot="conversation"
      className={cn("relative flex min-h-0 flex-1 flex-col overflow-y-auto", className)}
      initial={reducedMotion ? "instant" : "smooth"}
      resize={reducedMotion ? "instant" : "smooth"}
      role="log"
      {...props}
    />
  );
}

export type ConversationContentProps = ComponentProps<typeof StickToBottom.Content>;

export function ConversationContent({ className, ...props }: ConversationContentProps) {
  return <StickToBottom.Content data-slot="conversation-content" className={cn("flex min-h-full flex-col gap-8", className)} {...props} />;
}

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  description?: string;
  icon?: ReactNode;
};

export function ConversationEmptyState({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) {
  return (
    <div className={cn("flex size-full flex-col items-center justify-center gap-3 p-8 text-center", className)} {...props}>
      {children ?? (
        <>
          {icon && <div className="text-muted-foreground">{icon}</div>}
          <div className="space-y-1">
            <h3 className="font-medium text-sm">{title}</h3>
            {description && <p className="text-muted-foreground text-sm">{description}</p>}
          </div>
        </>
      )}
    </div>
  );
}

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export function ConversationScrollButton({ className, ...props }: ConversationScrollButtonProps) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  const reducedMotion = useReducedMotion();
  const handleScroll = useCallback(() => {
    void scrollToBottom({ animation: reducedMotion ? "instant" : "smooth" });
  }, [reducedMotion, scrollToBottom]);

  if (isAtBottom) return null;
  return (
    <Button
      className={cn("absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full", className)}
      onClick={handleScroll}
      size="icon"
      type="button"
      variant="outline"
      aria-label="Scroll to latest message"
      {...props}
    >
      <ArrowDown className="size-4" />
    </Button>
  );
}
