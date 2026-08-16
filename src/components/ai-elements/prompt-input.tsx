import { CornerDownLeft, Square, X } from "lucide-react";
import {
  useCallback,
  useState,
  type ComponentProps,
  type FormEvent,
  type HTMLAttributes,
  type KeyboardEventHandler,
} from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export type PromptInputStatus = "ready" | "submitted" | "streaming" | "error";

export type PromptInputMessage = {
  text: string;
};

export type PromptInputProps = Omit<ComponentProps<"form">, "onSubmit"> & {
  onSubmit: (
    message: PromptInputMessage,
    event: FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
};

export function PromptInput({ className, children, onSubmit, ...props }: PromptInputProps) {
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const text = String(formData.get("message") ?? "");
      return onSubmit({ text }, event);
    },
    [onSubmit],
  );

  return (
    <form
      data-slot="prompt-input"
      className={cn("w-full", className)}
      onSubmit={handleSubmit}
      {...props}
    >
      <InputGroup className="overflow-hidden">{children}</InputGroup>
    </form>
  );
}

export function PromptInputBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("contents", className)} {...props} />;
}

export type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>;

export function PromptInputTextarea({
  className,
  onKeyDown,
  ...props
}: PromptInputTextareaProps) {
  const [isComposing, setIsComposing] = useState(false);

  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      onKeyDown?.(event);
      if (event.defaultPrevented || event.key !== "Enter" || event.shiftKey) return;
      if (isComposing || event.nativeEvent.isComposing) return;

      event.preventDefault();
      const submitButton = event.currentTarget.form?.querySelector<HTMLButtonElement>(
        'button[type="submit"]',
      );
      if (!submitButton?.disabled) event.currentTarget.form?.requestSubmit();
    },
    [isComposing, onKeyDown],
  );

  return (
    <InputGroupTextarea
      data-slot="prompt-input-textarea"
      className={cn("field-sizing-content max-h-32 min-h-10", className)}
      name="message"
      onCompositionEnd={() => setIsComposing(false)}
      onCompositionStart={() => setIsComposing(true)}
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export type PromptInputFooterProps = Omit<
  ComponentProps<typeof InputGroupAddon>,
  "align"
>;

export function PromptInputFooter({ className, ...props }: PromptInputFooterProps) {
  return (
    <InputGroupAddon
      align="block-end"
      className={cn("justify-between gap-1", className)}
      {...props}
    />
  );
}

export function PromptInputTools({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex min-w-0 items-center gap-1", className)} {...props} />
  );
}

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  status?: PromptInputStatus;
  onStop?: () => void;
};

export function PromptInputSubmit({
  status = "ready",
  onStop,
  onClick,
  children,
  className,
  ...props
}: PromptInputSubmitProps) {
  const generating = status === "submitted" || status === "streaming";
  const icon = status === "submitted"
    ? <Spinner />
    : status === "streaming"
      ? <Square />
      : status === "error"
        ? <X />
        : <CornerDownLeft />;

  return (
    <InputGroupButton
      aria-label={generating ? "Stop response" : "Send message"}
      className={className}
      size="icon-sm"
      type={generating && onStop ? "button" : "submit"}
      onClick={(event) => {
        if (generating && onStop) {
          event.preventDefault();
          onStop();
          return;
        }
        onClick?.(event);
      }}
      {...props}
    >
      {children ?? icon}
    </InputGroupButton>
  );
}
