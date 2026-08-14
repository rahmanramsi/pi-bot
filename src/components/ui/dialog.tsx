import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, motionSprings, motionTransitions } from "@/lib/motion";

type DialogProps = React.ComponentProps<typeof DialogPrimitive.Root>;

type DialogMotionContextValue = {
  open: boolean;
};

const DialogMotionContext = React.createContext<DialogMotionContextValue | null>(null);

function Dialog({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}: DialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );

  return (
    <DialogMotionContext.Provider value={{ open }}>
      <DialogPrimitive.Root
        {...props}
        open={controlledOpen}
        defaultOpen={defaultOpen}
        onOpenChange={handleOpenChange}
      >
        {children}
      </DialogPrimitive.Root>
    </DialogMotionContext.Provider>
  );
}

const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

const DialogPortal = DialogPrimitive.Portal;

function useDialogMotion() {
  const context = React.useContext(DialogMotionContext);
  if (!context) throw new Error("DialogContent must be used inside Dialog");
  return context;
}

type DialogLayerProps = React.ComponentPropsWithoutRef<"div"> & { "data-state"?: string };
type MotionDialogContentProps = DialogLayerProps & { onClosed?: () => void };

const MotionDialogOverlay = React.forwardRef<HTMLDivElement, DialogLayerProps>(
  ({ className, style, "data-state": state, onAnimationStart: _onAnimationStart, onAnimationEnd: _onAnimationEnd, onAnimationIteration: _onAnimationIteration, onDrag: _onDrag, onDragStart: _onDragStart, onDragEnd: _onDragEnd, ...props }, ref) => {
    const open = state === "open";
    return (
      <motion.div
        ref={ref}
        {...props}
        initial={{ opacity: 0 }}
        animate={{ opacity: open ? 1 : 0 }}
        transition={motionTransitions.standard}
        className={className}
        data-state={state}
        data-motion="dialog-overlay"
        aria-hidden={!open}
        inert={!open}
        style={{ ...style, pointerEvents: open ? "auto" : "none" }}
      />
    );
  },
);
MotionDialogOverlay.displayName = "MotionDialogOverlay";

const MotionDialogContent = React.forwardRef<HTMLDivElement, MotionDialogContentProps>(
  ({ className, style, children, onClosed, "data-state": state, onAnimationStart: _onAnimationStart, onAnimationEnd: _onAnimationEnd, onAnimationIteration: _onAnimationIteration, onDrag: _onDrag, onDragStart: _onDragStart, onDragEnd: _onDragEnd, ...props }, ref) => {
    const open = state === "open";
    return (
      <motion.div
        ref={ref}
        {...props}
        initial={{ opacity: 0 }}
        animate={{ opacity: open ? 1 : 0 }}
        transition={motionTransitions.standard}
        className={className}
        data-state={state}
        data-motion="dialog-content"
        aria-hidden={!open}
        inert={!open}
        style={{ ...style, pointerEvents: open ? "auto" : "none" }}
        onAnimationComplete={() => {
          if (!open) onClosed?.();
        }}
      >
        {children}
      </motion.div>
    );
  },
);
MotionDialogContent.displayName = "MotionDialogContent";

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, onAnimationStart: _onAnimationStart, onAnimationEnd: _onAnimationEnd, onAnimationIteration: _onAnimationIteration, onDrag: _onDrag, onDragStart: _onDragStart, onDragEnd: _onDragEnd, ...props }, ref) => (
  <DialogPrimitive.Overlay forceMount asChild>
    <MotionDialogOverlay
      ref={ref}
      className={cn("fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]", className)}
      {...props}
    />
  </DialogPrimitive.Overlay>
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  closeDisabled?: boolean;
  showCloseButton?: boolean;
};

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, closeDisabled, showCloseButton = true, ...props }, ref) => {
  const { open } = useDialogMotion();
  const [present, setPresent] = React.useState(open);

  React.useEffect(() => {
    if (open) setPresent(true);
  }, [open]);

  const handleClosed = React.useCallback(() => {
    if (!open) setPresent(false);
  }, [open]);

  React.useEffect(() => {
    if (open || !present) return;

    const exitTimer = window.setTimeout(() => setPresent(false), motionTransitions.standard.duration * 1000);
    return () => window.clearTimeout(exitTimer);
  }, [open, present]);

  if (!present) return null;

  return (
    <DialogPortal forceMount>
      <DialogOverlay />
      <DialogPrimitive.Content {...props} forceMount asChild>
        <MotionDialogContent
          ref={ref}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 shadow-lg outline-none",
            className,
          )}
          data-motion="dialog-content"
          onClosed={handleClosed}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close asChild disabled={closeDisabled}>
              <motion.button
                type="button"
                whileHover={closeDisabled ? undefined : { y: -1 }}
                whileTap={closeDisabled ? undefined : { scale: 0.97 }}
                transition={motionSprings.press}
                className="absolute top-4 right-4 inline-flex size-8 items-center justify-center rounded-md opacity-70 transition-opacity hover:bg-accent hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring disabled:pointer-events-none"
                data-motion="dialog-close"
              >
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </motion.button>
            </DialogPrimitive.Close>
          )}
        </MotionDialogContent>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 text-left", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-[length:var(--text-heading)] font-semibold", className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-[length:var(--text-body)] text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
