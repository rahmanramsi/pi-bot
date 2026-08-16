import { createContext, useContext, useMemo, type ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const ICON_RADIUS = 10;
const ICON_CENTER = 12;
const ICON_CIRCUMFERENCE = 2 * Math.PI * ICON_RADIUS;

type ContextValue = {
  usedTokens: number;
  maxTokens: number;
  usedPercent: number;
};

const ContextValueContext = createContext<ContextValue | null>(null);

function useContextValue() {
  const value = useContext(ContextValueContext);
  if (!value) throw new Error("Context components must be used within Context");
  return value;
}

export type ContextProps = ComponentProps<typeof HoverCard> & {
  usedTokens: number;
  maxTokens: number;
};

export function Context({ usedTokens, maxTokens, ...props }: ContextProps) {
  const value = useMemo(() => ({
    usedTokens,
    maxTokens,
    usedPercent: maxTokens > 0 ? Math.min(1, Math.max(0, usedTokens / maxTokens)) : 0,
  }), [maxTokens, usedTokens]);

  return (
    <ContextValueContext.Provider value={value}>
      <HoverCard closeDelay={0} openDelay={0} {...props} />
    </ContextValueContext.Provider>
  );
}

export type ContextTriggerProps = ComponentProps<typeof Button>;

function ContextIcon() {
  const { usedPercent } = useContextValue();

  return (
    <svg aria-hidden="true" height="20" viewBox="0 0 24 24" width="20">
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.25"
        r={ICON_RADIUS}
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.7"
        r={ICON_RADIUS}
        stroke="currentColor"
        strokeDasharray={`${ICON_CIRCUMFERENCE} ${ICON_CIRCUMFERENCE}`}
        strokeDashoffset={ICON_CIRCUMFERENCE * (1 - usedPercent)}
        strokeLinecap="round"
        strokeWidth="2"
        style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
      />
    </svg>
  );
}

export function ContextTrigger({ children, className, ...props }: ContextTriggerProps) {
  const { maxTokens, usedPercent } = useContextValue();
  const percent = maxTokens > 0
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, style: "percent" }).format(usedPercent)
    : "—";

  return (
    <HoverCardTrigger asChild>
      <Button type="button" variant="ghost" size="sm" className={cn("text-muted-foreground", className)} {...props}>
        {children ?? (
          <>
            <span>{percent}</span>
            <ContextIcon />
          </>
        )}
      </Button>
    </HoverCardTrigger>
  );
}

export type ContextContentProps = ComponentProps<typeof HoverCardContent>;

export function ContextContent({ className, ...props }: ContextContentProps) {
  return <HoverCardContent align="start" className={cn("min-w-60 overflow-hidden p-0", className)} {...props} />;
}

export type ContextContentHeaderProps = ComponentProps<"div">;

export function ContextContentHeader({ children, className, ...props }: ContextContentHeaderProps) {
  const { maxTokens, usedPercent, usedTokens } = useContextValue();
  const percent = maxTokens > 0
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, style: "percent" }).format(usedPercent)
    : "—";
  const compact = new Intl.NumberFormat("en-US", { notation: "compact" });

  return (
    <div className={cn("flex w-full flex-col gap-2 p-3", className)} {...props}>
      {children ?? (
        <>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span>{percent} context used</span>
            <span className="font-mono text-muted-foreground">{compact.format(usedTokens)} / {maxTokens > 0 ? compact.format(maxTokens) : "—"}</span>
          </div>
          <Progress value={usedPercent * 100} aria-label="Context usage" />
        </>
      )}
    </div>
  );
}
