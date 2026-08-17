import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const attachmentVariants = cva(
  "group/attachment relative flex w-fit max-w-full min-w-0 shrink-0 flex-wrap rounded-xl border bg-card text-card-foreground transition-colors focus-within:ring-1 focus-within:ring-ring/50 data-[state=idle]:border-dashed",
  {
    variants: {
      size: {
        default: "gap-2 px-2.5 py-2 text-sm",
        sm: "gap-2.5 px-2 py-1.5 text-xs",
        xs: "gap-1.5 rounded-lg px-1.5 py-1 text-xs",
      },
      orientation: {
        horizontal: "min-w-40 items-center",
        vertical: "w-24 flex-col",
      },
    },
    defaultVariants: { size: "default", orientation: "horizontal" },
  },
);

function Attachment({ className, state = "done", size = "default", orientation = "horizontal", ...props }: React.ComponentProps<"div"> & VariantProps<typeof attachmentVariants> & { state?: "idle" | "uploading" | "processing" | "error" | "done" }) {
  return <div data-slot="attachment" data-state={state} data-size={size} data-orientation={orientation} className={cn(attachmentVariants({ size, orientation }), className)} {...props} />;
}

const attachmentMediaVariants = cva(
  "relative flex aspect-square size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-foreground [&_svg]:pointer-events-none group-data-[size=sm]/attachment:size-8 group-data-[size=xs]/attachment:size-7",
  { variants: { variant: { icon: "", image: "overflow-hidden [&_img]:size-full [&_img]:object-cover" } }, defaultVariants: { variant: "icon" } },
);

function AttachmentMedia({ className, variant = "icon", ...props }: React.ComponentProps<"div"> & VariantProps<typeof attachmentMediaVariants>) {
  return <div data-slot="attachment-media" data-variant={variant} className={cn(attachmentMediaVariants({ variant }), className)} {...props} />;
}

function AttachmentContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="attachment-content" className={cn("max-w-full min-w-0 flex-1 leading-tight", className)} {...props} />;
}

function AttachmentTitle({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="attachment-title" className={cn("block max-w-full min-w-0 truncate font-medium", className)} {...props} />;
}

function AttachmentDescription({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="attachment-description" className={cn("mt-0.5 block max-w-full min-w-0 truncate text-xs text-muted-foreground", className)} {...props} />;
}

function AttachmentActions({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="attachment-actions" className={cn("relative z-20 flex shrink-0 items-center", className)} {...props} />;
}

function AttachmentAction({ className, size = "icon-sm", variant = "ghost", ...props }: React.ComponentProps<typeof Button>) {
  return <Button data-slot="attachment-action" type="button" variant={variant} size={size} className={cn(className)} {...props} />;
}

function AttachmentGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="attachment-group" className={cn("flex min-w-0 gap-2 overflow-x-auto py-1", className)} {...props} />;
}

export { Attachment, AttachmentGroup, AttachmentMedia, AttachmentContent, AttachmentTitle, AttachmentDescription, AttachmentActions, AttachmentAction };
