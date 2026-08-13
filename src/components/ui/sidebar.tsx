import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type SidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  state: "expanded" | "collapsed";
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used within a SidebarProvider.");
  return context;
}

type SidebarProviderProps = React.ComponentProps<"div"> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  asChild?: boolean;
};

const SidebarProvider = React.forwardRef<HTMLDivElement, SidebarProviderProps>(
  ({ defaultOpen = true, open: openProp, onOpenChange, className, style, asChild = false, ...props }, ref) => {
    const [openState, setOpenState] = React.useState(defaultOpen);
    const open = openProp ?? openState;
    const setOpen = React.useCallback((nextOpen: boolean) => {
      const next = typeof nextOpen === "boolean" ? nextOpen : !open;
      onOpenChange?.(next);
      if (openProp === undefined) setOpenState(next);
    }, [onOpenChange, open, openProp]);
    const state = open ? "expanded" : "collapsed";
    const Comp = asChild ? Slot : "div";

    return (
      <SidebarContext.Provider value={{ open, setOpen, state, toggleSidebar: () => setOpen(!open) }}>
        <Comp
          ref={ref}
          data-slot="sidebar-provider"
          data-sidebar-state={state}
          className={cn("group/sidebar-wrapper", className)}
          style={style}
          {...props}
        />
      </SidebarContext.Provider>
    );
  },
);
SidebarProvider.displayName = "SidebarProvider";

type SidebarProps = React.ComponentProps<"aside"> & {
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
  collapsible?: "offcanvas" | "icon" | "none";
};

const Sidebar = React.forwardRef<HTMLElement, SidebarProps>(
  ({ side = "left", variant = "sidebar", collapsible = "offcanvas", className, ...props }, ref) => {
    const { state } = useSidebar();
    const effectiveState = collapsible === "none" ? "expanded" : state;
    return (
      <aside
        ref={ref}
        data-slot="sidebar"
        data-side={side}
        data-variant={variant}
        data-state={effectiveState}
        data-collapsible={effectiveState === "collapsed" ? collapsible : undefined}
        className={cn("sidebar-shell", className)}
        {...props}
      />
    );
  },
);
Sidebar.displayName = "Sidebar";

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-header" className={cn("sidebar-header", className)} {...props} />;
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-content" className={cn("sidebar-content", className)} {...props} />;
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-footer" className={cn("sidebar-footer", className)} {...props} />;
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-group" className={cn("sidebar-group", className)} {...props} />;
}

function SidebarGroupLabel({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-group-label" className={cn("sidebar-group-label", className)} {...props} />;
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="sidebar-menu" className={cn("sidebar-menu", className)} {...props} />;
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" className={cn("sidebar-menu-item", className)} {...props} />;
}

type SidebarMenuButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  isActive?: boolean;
  tooltip?: string;
  asChild?: boolean;
};

function SidebarMenuButton({ className, isActive, tooltip, asChild = false, children, ...props }: SidebarMenuButtonProps) {
  const { state } = useSidebar();
  const Comp = asChild ? Slot : "button";
  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-active={isActive || undefined}
      className={cn("sidebar-menu-button", className)}
      {...props}
    >
      {children}
    </Comp>
  );

  if (!tooltip || state !== "collapsed") return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function SidebarMenuAction({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" data-slot="sidebar-menu-action" className={cn("sidebar-menu-action", className)} {...props} />;
}

function SidebarInset({ className, ...props }: React.ComponentProps<"section">) {
  return <section data-slot="sidebar-inset" className={cn("sidebar-inset", className)} {...props} />;
}

function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Toggle agent sidebar"
      className={cn("sidebar-trigger", className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) toggleSidebar();
      }}
      {...props}
    >
      <PanelLeft />
      <span className="sr-only">Toggle agent sidebar</span>
    </Button>
  );
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
};
