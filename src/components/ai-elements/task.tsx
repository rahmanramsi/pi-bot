import type { ComponentProps } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type TaskProps = ComponentProps<typeof Collapsible>;

export function Task({ className, defaultOpen = true, open, ...props }: TaskProps) {
  return <Collapsible data-slot="task" className={cn(className)} defaultOpen={open === undefined ? defaultOpen : undefined} open={open} {...props} />;
}

export type TaskTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  title?: string;
};

export function TaskTrigger({ children, className, title, ...props }: TaskTriggerProps) {
  return (
    <CollapsibleTrigger data-slot="task-trigger" className={cn(className)} {...props}>
      {children ?? title}
    </CollapsibleTrigger>
  );
}

export type TaskContentProps = ComponentProps<typeof CollapsibleContent>;

export function TaskContent({ className, ...props }: TaskContentProps) {
  return <CollapsibleContent data-slot="task-content" className={cn(className)} {...props} />;
}
