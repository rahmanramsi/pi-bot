import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { usePanelRef, type Layout, type LayoutChangedMeta, type PanelSize } from "react-resizable-panels";

export const sidebarWidthStorageKey = "pi-bot.sidebar-width";
export const sidebarDefaultWidth = 332;
export const sidebarMinWidth = 240;
export const sidebarMaxWidth = 420;
export const sidebarCollapsedWidth = 72;

export function clampSidebarWidth(value: number) {
  return Math.min(sidebarMaxWidth, Math.max(sidebarMinWidth, Math.round(value)));
}

export function readSidebarWidth() {
  if (typeof window === "undefined") return sidebarDefaultWidth;
  const storedValue = window.localStorage.getItem(sidebarWidthStorageKey);
  if (!storedValue?.trim()) return sidebarDefaultWidth;
  const value = Number(storedValue);
  return Number.isFinite(value) ? clampSidebarWidth(value) : sidebarDefaultWidth;
}

export function persistSidebarWidth(width: number) {
  window.localStorage.setItem(sidebarWidthStorageKey, String(clampSidebarWidth(width)));
}

export function useSidebarPanelController(sidebarOpen: boolean, setSidebarOpen: Dispatch<SetStateAction<boolean>>) {
  const [sidebarWidth] = useState(readSidebarWidth);
  const sidebarPanelRef = usePanelRef();

  useEffect(() => {
    if (sidebarOpen) sidebarPanelRef.current?.expand();
    else sidebarPanelRef.current?.collapse();
  }, [sidebarOpen, sidebarPanelRef]);

  function onResize({ inPixels }: PanelSize) {
    const nextOpen = inPixels > sidebarCollapsedWidth + 1;
    setSidebarOpen((current) => current === nextOpen ? current : nextOpen);
  }

  function onLayoutChanged(_layout: Layout, meta: LayoutChangedMeta) {
    if (!meta.isUserInteraction) return;
    const collapsed = sidebarPanelRef.current?.isCollapsed();
    if (collapsed !== undefined) {
      setSidebarOpen((current) => current === !collapsed ? current : !collapsed);
    }
    const width = sidebarPanelRef.current?.getSize().inPixels;
    if (width && width > sidebarCollapsedWidth + 1) persistSidebarWidth(width);
  }

  return { sidebarWidth, sidebarPanelRef, onLayoutChanged, onResize };
}
