import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import {
  clampSidebarWidth,
  persistSidebarWidth,
  readSidebarWidth,
  sidebarCollapsedWidth,
  sidebarMaxWidth,
  sidebarMinWidth,
  useSidebarPanelController,
} from "@/lib/sidebar-layout";

type ResizeObserverEntryTarget = Element & { getBoundingClientRect: () => DOMRect };

const resizeObservers = new Set<{ callback: ResizeObserverCallback; targets: Set<Element> }>();

class TestResizeObserver {
  private readonly record: { callback: ResizeObserverCallback; targets: Set<Element> };

  constructor(callback: ResizeObserverCallback) {
    this.record = { callback, targets: new Set() };
    resizeObservers.add(this.record);
  }

  observe(target: Element) {
    this.record.targets.add(target);
  }

  disconnect() {
    this.record.targets.clear();
    resizeObservers.delete(this.record);
  }
}

function notifyResizeObservers() {
  for (const { callback, targets } of resizeObservers) {
    callback(
      [...targets].map((target) => ({
        target,
        borderBoxSize: [{ inlineSize: (target as ResizeObserverEntryTarget).getBoundingClientRect().width, blockSize: 500 }],
        contentBoxSize: [],
        contentRect: (target as ResizeObserverEntryTarget).getBoundingClientRect(),
        devicePixelContentBoxSize: [],
      })),
      {} as ResizeObserver,
    );
  }
}

function installLayoutGeometry() {
  const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
  const offsetLeft = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetLeft");
  const ariaDisabled = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "ariaDisabled");
  const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;

  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      if (this.hasAttribute("data-group")) return 1000;
      if (!this.hasAttribute("data-panel")) return 0;
      const flexGrow = Number.parseFloat(this.style.flexGrow || "0");
      return Math.round((flexGrow / 100) * 1000);
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetLeft", {
    configurable: true,
    get() {
      if (!this.parentElement?.hasAttribute("data-group")) return 0;
      return [...this.parentElement.children]
        .slice(0, [...this.parentElement.children].indexOf(this))
        .reduce((total, element) => total + (element as HTMLElement).offsetWidth, 0);
    },
  });
  Object.defineProperty(HTMLElement.prototype, "ariaDisabled", {
    configurable: true,
    get() {
      return this.getAttribute("aria-disabled");
    },
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.hasAttribute("data-group")) return new DOMRect(0, 0, 1000, 500);
    if (this.hasAttribute("data-panel")) {
      const left = [...(this.parentElement?.children ?? [])]
        .filter((element) => element.hasAttribute("data-panel"))
        .slice(0, [...(this.parentElement?.children ?? [])].indexOf(this))
        .reduce((total, element) => total + (element as HTMLElement).offsetWidth, 0);
      return new DOMRect(left, 0, this.offsetWidth, 500);
    }
    return getBoundingClientRect.call(this);
  };

  return () => {
    if (offsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", offsetWidth);
    else delete (HTMLElement.prototype as { offsetWidth?: number }).offsetWidth;
    if (offsetLeft) Object.defineProperty(HTMLElement.prototype, "offsetLeft", offsetLeft);
    else delete (HTMLElement.prototype as { offsetLeft?: number }).offsetLeft;
    if (ariaDisabled) Object.defineProperty(HTMLElement.prototype, "ariaDisabled", ariaDisabled);
    else delete (HTMLElement.prototype as { ariaDisabled?: string | null }).ariaDisabled;
    HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect;
  };
}

function SidebarResizeHarness() {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const { sidebarPanelRef, onLayoutChanged, onResize } = useSidebarPanelController(sidebarOpen, setSidebarOpen);

  return (
    <div data-sidebar-open={sidebarOpen}>
      <ResizablePanelGroup id="test-layout" orientation="horizontal" onLayoutChanged={onLayoutChanged}>
        <ResizablePanel id="agent-sidebar" defaultSize="33.2%" minSize="24%" maxSize="42%" collapsedSize="7.2%" collapsible panelRef={sidebarPanelRef} onResize={onResize} />
        <ResizableHandle aria-label="Resize agent sidebar" />
        <ResizablePanel id="app-view" />
      </ResizablePanelGroup>
    </div>
  );
}

describe("resizable agent sidebar behavior", () => {
  let host: HTMLDivElement;
  let root: Root;
  let restoreGeometry: () => void;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    restoreGeometry = installLayoutGeometry();
    window.localStorage.clear();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    restoreGeometry();
    resizeObservers.clear();
    window.localStorage.clear();
    vi.unstubAllGlobals();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("restores and persists widths inside the desktop bounds", () => {
    expect(readSidebarWidth()).toBe(332);
    window.localStorage.setItem("pi-bot.sidebar-width", "not-a-width");
    expect(readSidebarWidth()).toBe(332);

    window.localStorage.setItem("pi-bot.sidebar-width", "180");
    expect(readSidebarWidth()).toBe(sidebarMinWidth);

    window.localStorage.setItem("pi-bot.sidebar-width", "900");
    expect(readSidebarWidth()).toBe(sidebarMaxWidth);

    persistSidebarWidth(381.6);
    expect(window.localStorage.getItem("pi-bot.sidebar-width")).toBe("382");
    expect(clampSidebarWidth(381.6)).toBe(382);
  });

  it("lets the native separator keyboard command collapse and expand the panel", () => {
    act(() => root.render(<SidebarResizeHarness />));
    act(() => notifyResizeObservers());
    const separator = host.querySelector('[data-slot="resizable-handle"]') as HTMLElement;
    expect(separator.getAttribute("role")).toBe("separator");
    expect(host.querySelector("[data-sidebar-open]")?.getAttribute("data-sidebar-open")).toBe("true");

    separator.focus();
    const collapse = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" });
    act(() => separator.dispatchEvent(collapse));
    expect(collapse.defaultPrevented).toBe(true);
    expect(host.querySelector("[data-sidebar-open]")?.getAttribute("data-sidebar-open")).toBe("false");

    const expand = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" });
    act(() => separator.dispatchEvent(expand));
    expect(expand.defaultPrevented).toBe(true);
    expect(host.querySelector("[data-sidebar-open]")?.getAttribute("data-sidebar-open")).toBe("true");
  });
});
