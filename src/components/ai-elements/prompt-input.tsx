import { Send, Square } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const PromptInput = forwardRef<HTMLFormElement, ComponentPropsWithoutRef<"form">>(function PromptInput({ className, ...props }, ref) {
  return <form ref={ref} data-slot="prompt-input" className={cn("flex min-w-0 flex-col", className)} {...props} />;
});

export const PromptInputTextarea = forwardRef<HTMLTextAreaElement, ComponentPropsWithoutRef<"textarea">>(function PromptInputTextarea({ className, ...props }, ref) {
  return <textarea ref={ref} data-slot="prompt-input-textarea" className={cn("min-h-10 w-full resize-none", className)} {...props} />;
});

export function PromptInputFooter({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="prompt-input-footer" className={cn("flex items-center justify-between", className)} {...props} />;
}

export function PromptInputTools({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="prompt-input-tools" className={cn("flex items-center", className)} {...props} />;
}

export type PromptInputSubmitProps = ComponentPropsWithoutRef<typeof Button> & {
  status?: "ready" | "streaming" | "submitted" | "error";
};

export function PromptInputSubmit({ status = "ready", className, children, ...props }: PromptInputSubmitProps) {
  const working = status === "streaming" || status === "submitted";
  return (
    <Button className={className} type={working ? "button" : "submit"} aria-label={working ? "Stop response" : "Send message"} {...props}>
      {children ?? (working ? <Square /> : <Send />)}
    </Button>
  );
}
